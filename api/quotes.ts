import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { requireAuth } from './_auth';
import { resolveTenantId } from './_tenant';
import { documentTotalsFromSubtotal, lineTotal, roundMoney, MONEY_EPS } from './_documentPricing';
import { syncInvoiceFinancials } from './_invoiceSync';

function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return b as Record<string, unknown>;
}

const NOW_ISO = () => new Date().toISOString();

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

const QUOTE_LINE_STATUSES_LOCKED = new Set(['Sent', 'Approved', 'Converted']);

const VALID_QUOTE_STATUSES = new Set([
  'Draft',
  'Sent',
  'Awaiting Response',
  'Changes Requested',
  'Approved',
  'Converted',
]);

type QuoteStatusRow = {
  status: string;
  sent_at: string | null;
  approved_at: string | null;
  converted_at: string | null;
};

/** DB fields for a status change, or an error message. Empty object = no-op (same status). */
function quoteStatusUpdateFields(current: QuoteStatusRow, nextRaw: unknown): Record<string, unknown> | string {
  const next = String(nextRaw ?? '').trim();
  if (!VALID_QUOTE_STATUSES.has(next)) {
    return 'Invalid quote status';
  }
  if (current.status === next) {
    return {};
  }
  const t = NOW_ISO();
  const base: Record<string, unknown> = { status: next, updated_at: t };
  if (next === 'Draft') {
    return { ...base, sent_at: null, approved_at: null, converted_at: null };
  }
  if (next === 'Converted') {
    return { ...base, converted_at: current.converted_at ?? t };
  }
  if (next === 'Approved') {
    return {
      ...base,
      approved_at: current.approved_at ?? t,
      sent_at: current.sent_at ?? t,
      converted_at: null,
    };
  }
  return {
    ...base,
    sent_at: current.sent_at ?? t,
    approved_at: null,
    converted_at: null,
  };
}

async function assertQuoteLinesEditable(
  db: SupabaseClient,
  quoteId: string,
  tenantId: string
): Promise<string | null> {
  const { data, error } = await db
    .from('quotes')
    .select('status')
    .eq('id', quoteId)
    .eq('tenant_id', tenantId)
    .single();
  if (error) return error.message;
  if (QUOTE_LINE_STATUSES_LOCKED.has(String(data?.status ?? ''))) {
    return 'Cannot edit line items while quote is Sent, Approved, or Converted';
  }
  return null;
}

async function recalculateQuote(db: SupabaseClient, quoteId: string, tenantId: string) {
  const { data: items } = await db
    .from('quote_line_items')
    .select('total')
    .eq('quote_id', quoteId)
    .eq('tenant_id', tenantId);
  const subtotalRaw = (items ?? []).reduce((sum, i) => sum + Number(i.total), 0);
  const { data: taxRows } = await db
    .from('quote_tax_lines')
    .select('amount')
    .eq('quote_id', quoteId)
    .eq('tenant_id', tenantId);
  const { data: q } = await db
    .from('quotes')
    .select('tax_rate')
    .eq('id', quoteId)
    .eq('tenant_id', tenantId)
    .single();
  const taxRate = Number(q?.tax_rate ?? 0.05);
  let subtotal = roundMoney(subtotalRaw);
  let tax_amount: number;
  let total: number;
  if (taxRows && taxRows.length > 0) {
    tax_amount = roundMoney(taxRows.reduce((s, r) => s + Number(r.amount), 0));
    total = roundMoney(subtotal + tax_amount);
  } else {
    const t = documentTotalsFromSubtotal(subtotalRaw, taxRate);
    subtotal = t.subtotal;
    tax_amount = t.tax_amount;
    total = t.total;
  }
  await db
    .from('quotes')
    .update({ subtotal, tax_amount, total, updated_at: NOW_ISO() })
    .eq('id', quoteId)
    .eq('tenant_id', tenantId);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = supabase();
  if (!db) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return;
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const tenantId = resolveTenantId();

  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const action = String(req.query.action ?? '');

    if (action === 'list') {
      const accountId = String(req.query.account_id ?? '').trim();
      let q = db.from('quotes').select('*').eq('tenant_id', tenantId);
      if (accountId) q = q.eq('account_id', accountId);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ quotes: data ?? [] });
      return;
    }

    if (action === 'get') {
      const id = String(req.query.id ?? '');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const quote = await db.from('quotes').select('*').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
      if (quote.error) {
        res.status(500).json({ error: quote.error.message });
        return;
      }
      if (!quote.data) {
        res.status(404).json({ error: 'Quote not found' });
        return;
      }
      const line_items = await db
        .from('quote_line_items')
        .select('*')
        .eq('quote_id', id)
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (line_items.error) {
        res.status(500).json({ error: line_items.error.message });
        return;
      }
      const [tax_lines, quote_notes, quote_attachments] = await Promise.all([
        db.from('quote_tax_lines').select('*').eq('quote_id', id).eq('tenant_id', tenantId).order('sort_order', { ascending: true }),
        db.from('quote_notes').select('*').eq('quote_id', id).eq('tenant_id', tenantId).order('created_at', { ascending: false }),
        db.from('quote_attachments').select('*').eq('quote_id', id).eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      ]);
      if (tax_lines.error) {
        res.status(500).json({ error: tax_lines.error.message });
        return;
      }
      if (quote_notes.error) {
        res.status(500).json({ error: quote_notes.error.message });
        return;
      }
      if (quote_attachments.error) {
        res.status(500).json({ error: quote_attachments.error.message });
        return;
      }
      let accountData = null;
      let propertyData = null;
      if (quote.data.account_id) {
        const { data: acc } = await db
          .from('crm_accounts')
          .select('id, name, company, phone, email')
          .eq('id', quote.data.account_id as string)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        accountData = acc;
      }
      if (quote.data.property_id) {
        const { data: prop } = await db
          .from('crm_properties')
          .select('*')
          .eq('id', quote.data.property_id as string)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        propertyData = prop;
      }
      res.status(200).json({
        quote: quote.data,
        line_items: line_items.data ?? [],
        tax_lines: tax_lines.data ?? [],
        quote_notes: quote_notes.data ?? [],
        quote_attachments: quote_attachments.data ?? [],
        account: accountData,
        property: propertyData,
      });
      return;
    }

    if (action === 'properties') {
      const account_id = String(req.query.account_id ?? '');
      if (!account_id) {
        res.status(400).json({ error: 'Missing account_id' });
        return;
      }
      const { data, error } = await db
        .from('crm_properties')
        .select('*')
        .eq('account_id', account_id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ properties: data ?? [] });
      return;
    }

    res.status(400).json({ error: 'Invalid GET action' });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseBody(req);
  const action = String(body.action ?? '');

  const errTable = async (e: { message: string } | null) => {
    if (e) {
      res.status(500).json({ error: e.message });
      return true;
    }
    return false;
  };

  if (action === 'quote.create') {
    const account_id = String(body.account_id ?? '');
    const title = String(body.title ?? '').trim();
    if (!account_id || !title) {
      res.status(400).json({ error: 'account_id and title are required' });
      return;
    }
    const approval_token = randomUUID();
    const meta =
      typeof body.metadata === 'object' && body.metadata !== null && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};
    const ALLOWED_DESIGNS_LOCAL = new Set(['editorial', 'technical', 'field', 'statement']);
    const designRaw = body.template_design != null ? String(body.template_design) : 'editorial';
    const template_design = ALLOWED_DESIGNS_LOCAL.has(designRaw) ? designRaw : 'editorial';
    const row = {
      tenant_id: tenantId,
      account_id,
      title,
      property_id: body.property_id != null ? String(body.property_id) : null,
      salesperson_id: body.salesperson_id != null ? String(body.salesperson_id) : null,
      introduction: body.introduction != null ? String(body.introduction) : null,
      contract_disclaimer: body.contract_disclaimer != null ? String(body.contract_disclaimer) : null,
      tax_rate: Number(body.tax_rate ?? 0.05),
      deposit_required: Boolean(body.deposit_required ?? false),
      deposit_amount: Number(body.deposit_amount ?? 0),
      notes: body.notes != null ? String(body.notes) : null,
      require_payment_method_on_file: Boolean(body.require_payment_method_on_file ?? false),
      metadata: meta,
      approval_token,
      template_id: body.template_id != null ? String(body.template_id) : null,
      template_design,
      section_visibility: body.section_visibility ?? {},
      custom_text: body.custom_text ?? {},
      status: 'Draft',
      subtotal: 0,
      tax_amount: 0,
      total: 0,
      updated_at: NOW_ISO(),
    };
    const { data, error } = await db.from('quotes').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ quote: data });
    return;
  }

  if (action === 'quote.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const patch: Record<string, unknown> = { updated_at: NOW_ISO() };
    const keys = [
      'title',
      'property_id',
      'salesperson_id',
      'introduction',
      'contract_disclaimer',
      'tax_rate',
      'deposit_required',
      'deposit_amount',
      'notes',
      'template_id',
      'section_visibility',
      'custom_text',
    ] as const;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        const v = body[k];
        patch[k] = v;
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'template_design')) {
      const ALLOWED_DESIGNS_LOCAL = new Set(['editorial', 'technical', 'field', 'statement']);
      const d = String(body.template_design ?? '');
      if (!ALLOWED_DESIGNS_LOCAL.has(d)) {
        res.status(400).json({ error: `Invalid template_design: ${d}` });
        return;
      }
      patch.template_design = d;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      const { data: cur, error: curErr } = await db
        .from('quotes')
        .select('status, sent_at, approved_at, converted_at')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (await errTable(curErr)) return;
      if (!cur) {
        res.status(404).json({ error: 'Quote not found' });
        return;
      }
      const sf = quoteStatusUpdateFields(cur as QuoteStatusRow, body.status);
      if (typeof sf === 'string') {
        res.status(400).json({ error: sf });
        return;
      }
      Object.assign(patch, sf);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'require_payment_method_on_file')) {
      patch.require_payment_method_on_file = Boolean(body.require_payment_method_on_file);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'metadata')) {
      const m = body.metadata;
      patch.metadata =
        typeof m === 'object' && m !== null && !Array.isArray(m) ? m : {};
    }
    const taxRatePatch = patch.tax_rate;
    if (taxRatePatch !== undefined) {
      await db
        .from('quotes')
        .update({ tax_rate: Number(taxRatePatch), updated_at: NOW_ISO() })
        .eq('id', id)
        .eq('tenant_id', tenantId);
      delete patch.tax_rate;
    }
    if (
      'deposit_required' in patch ||
      'deposit_amount' in patch ||
      body.recalc ||
      taxRatePatch !== undefined
    ) {
      await recalculateQuote(db, id, tenantId);
    }
    if ('deposit_required' in patch || 'deposit_amount' in patch) {
      const { data: q } = await db
        .from('quotes')
        .select('total, deposit_required, deposit_amount')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      const depReq =
        patch.deposit_required !== undefined ? Boolean(patch.deposit_required) : Boolean(q?.deposit_required);
      const depAmt =
        patch.deposit_amount !== undefined ? Number(patch.deposit_amount) : Number(q?.deposit_amount ?? 0);
      if (depReq && depAmt > roundMoney(Number(q?.total ?? 0)) + MONEY_EPS) {
        res.status(400).json({ error: 'deposit_amount cannot exceed quote total' });
        return;
      }
    }
    const { data, error } = await db
      .from('quotes')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    if (Boolean(body.recalc)) {
      await recalculateQuote(db, id, tenantId);
      const { data: updated } = await db
        .from('quotes')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();
      res.status(200).json({ quote: updated });
      return;
    }
    res.status(200).json({ quote: data });
    return;
  }

  if (action === 'quote.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db.from('quotes').delete().eq('id', id).eq('tenant_id', tenantId);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'quote.recalculate') {
    const quote_id = String(body.quote_id ?? '');
    if (!quote_id) {
      res.status(400).json({ error: 'quote_id is required' });
      return;
    }
    await recalculateQuote(db, quote_id, tenantId);
    const { data, error } = await db
      .from('quotes')
      .select('*')
      .eq('id', quote_id)
      .eq('tenant_id', tenantId)
      .single();
    if (await errTable(error)) return;
    res.status(200).json({ quote: data });
    return;
  }

  if (action === 'line_item.create') {
    const quote_id = String(body.quote_id ?? '');
    const product_service_name = String(body.product_service_name ?? '').trim();
    const quantity = Number(body.quantity ?? 0);
    const unit_price = Number(body.unit_price ?? 0);
    if (!quote_id || !product_service_name || quantity <= 0 || unit_price < 0) {
      res.status(400).json({ error: 'quote_id, product_service_name, quantity, and unit_price are required' });
      return;
    }
    const locked = await assertQuoteLinesEditable(db, quote_id, tenantId);
    if (locked) {
      res.status(400).json({ error: locked });
      return;
    }
    const total = lineTotal(quantity, unit_price);
    const row: Record<string, unknown> = {
      tenant_id: tenantId,
      quote_id,
      product_service_name,
      description: body.description != null ? String(body.description) : null,
      section_title: body.section_title != null ? String(body.section_title).trim() || null : null,
      quantity,
      unit_price,
      total,
    };
    if (body.sort_order != null) row.sort_order = Number(body.sort_order);
    const { data, error } = await db.from('quote_line_items').insert(row).select('*').single();
    if (await errTable(error)) return;
    await recalculateQuote(db, quote_id, tenantId);
    res.status(200).json({ line_item: data });
    return;
  }

  if (action === 'line_item.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { data: existing } = await db
      .from('quote_line_items')
      .select('quote_id, quantity, unit_price')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();
    if (!existing) {
      res.status(404).json({ error: 'Line item not found' });
      return;
    }
    const locked = await assertQuoteLinesEditable(db, existing.quote_id as string, tenantId);
    if (locked) {
      res.status(400).json({ error: locked });
      return;
    }
    const patch: Record<string, unknown> = {};
    const keys = ['product_service_name', 'description', 'section_title', 'quantity', 'unit_price', 'sort_order'] as const;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        patch[k] = body[k];
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'quantity') || Object.prototype.hasOwnProperty.call(patch, 'unit_price')) {
      const q = Number(patch.quantity ?? existing.quantity);
      const up = Number(patch.unit_price ?? existing.unit_price);
      patch.total = lineTotal(q, up);
    }
    const { data, error } = await db
      .from('quote_line_items')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (await errTable(error)) return;
    await recalculateQuote(db, existing.quote_id as string, tenantId);
    res.status(200).json({ line_item: data });
    return;
  }

  if (action === 'line_item.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { data: existing } = await db
      .from('quote_line_items')
      .select('quote_id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();
    if (!existing) {
      res.status(404).json({ error: 'Line item not found' });
      return;
    }
    const locked = await assertQuoteLinesEditable(db, existing.quote_id as string, tenantId);
    if (locked) {
      res.status(400).json({ error: locked });
      return;
    }
    const { error } = await db.from('quote_line_items').delete().eq('id', id).eq('tenant_id', tenantId);
    if (await errTable(error)) return;
    await recalculateQuote(db, existing.quote_id as string, tenantId);
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'line_items.bulk_set') {
    const quote_id = String(body.quote_id ?? '');
    const items = body.items;
    if (!quote_id || !Array.isArray(items)) {
      res.status(400).json({ error: 'quote_id and items array are required' });
      return;
    }
    const locked = await assertQuoteLinesEditable(db, quote_id, tenantId);
    if (locked) {
      res.status(400).json({ error: locked });
      return;
    }
    await db.from('quote_line_items').delete().eq('quote_id', quote_id).eq('tenant_id', tenantId);
    const toInsert = items.map((item: Record<string, unknown>, idx: number) => ({
      tenant_id: tenantId,
      quote_id,
      product_service_name: String(item.product_service_name ?? '').trim(),
      description: item.description != null ? String(item.description) : null,
      section_title:
        item.section_title != null ? String(item.section_title).trim() || null : null,
      quantity: Number(item.quantity ?? 0),
      unit_price: Number(item.unit_price ?? 0),
      total: lineTotal(Number(item.quantity ?? 0), Number(item.unit_price ?? 0)),
      sort_order: item.sort_order != null ? Number(item.sort_order) : idx,
    }));
    const { data, error } = await db.from('quote_line_items').insert(toInsert).select('*');
    if (await errTable(error)) return;
    await recalculateQuote(db, quote_id, tenantId);
    res.status(200).json({ line_items: data ?? [] });
    return;
  }

  if (action === 'quote.tax_lines.replace') {
    const quote_id = String(body.quote_id ?? '');
    const lines = body.lines;
    if (!quote_id || !Array.isArray(lines)) {
      res.status(400).json({ error: 'quote_id and lines array are required' });
      return;
    }
    const { data: q } = await db
      .from('quotes')
      .select('id')
      .eq('id', quote_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!q) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    const { error: delErr } = await db
      .from('quote_tax_lines')
      .delete()
      .eq('quote_id', quote_id)
      .eq('tenant_id', tenantId);
    if (await errTable(delErr)) return;
    if (lines.length > 0) {
      const rows = lines.map((raw: Record<string, unknown>, i: number) => ({
        tenant_id: tenantId,
        quote_id,
        label: String(raw.label ?? 'Tax'),
        registration_number:
          raw.registration_number != null && String(raw.registration_number).trim() !== ''
            ? String(raw.registration_number)
            : null,
        rate: Number(raw.rate ?? 0),
        amount: Number(raw.amount ?? 0),
        sort_order: raw.sort_order != null ? Number(raw.sort_order) : i,
      }));
      const { error: insErr } = await db.from('quote_tax_lines').insert(rows);
      if (await errTable(insErr)) return;
    }
    await recalculateQuote(db, quote_id, tenantId);
    const { data: refreshed, error: refErr } = await db
      .from('quote_tax_lines')
      .select('*')
      .eq('quote_id', quote_id)
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true });
    if (await errTable(refErr)) return;
    res.status(200).json({ ok: true, tax_lines: refreshed ?? [] });
    return;
  }

  if (action === 'quote_note.create') {
    const quote_id = String(body.quote_id ?? '');
    const noteBody = String(body.body ?? '').trim();
    if (!quote_id || !noteBody) {
      res.status(400).json({ error: 'quote_id and body are required' });
      return;
    }
    const { data: q } = await db
      .from('quotes')
      .select('id')
      .eq('id', quote_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!q) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    const extra =
      typeof body.extra === 'object' && body.extra !== null && !Array.isArray(body.extra)
        ? (body.extra as Record<string, unknown>)
        : {};
    const row = {
      tenant_id: tenantId,
      quote_id,
      body: noteBody,
      kind: body.kind != null ? String(body.kind) : 'internal',
      extra,
      created_by_user_id: auth.userId ?? null,
      created_by_email: auth.email || null,
      updated_at: NOW_ISO(),
    };
    const { data, error } = await db.from('quote_notes').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ note: data });
    return;
  }

  if (action === 'quote_note.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { data: existing } = await db
      .from('quote_notes')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!existing) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }
    const patch: Record<string, unknown> = { updated_at: NOW_ISO() };
    if (Object.prototype.hasOwnProperty.call(body, 'body')) {
      patch.body = String(body.body ?? '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(body, 'kind')) {
      patch.kind = String(body.kind ?? 'internal');
    }
    if (Object.prototype.hasOwnProperty.call(body, 'extra')) {
      const m = body.extra;
      patch.extra = typeof m === 'object' && m !== null && !Array.isArray(m) ? m : {};
    }
    const { data, error } = await db
      .from('quote_notes')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (await errTable(error)) return;
    res.status(200).json({ note: data });
    return;
  }

  if (action === 'quote_note.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db.from('quote_notes').delete().eq('id', id).eq('tenant_id', tenantId);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'property.create') {
    const account_id = String(body.account_id ?? '');
    const address = String(body.address ?? '').trim();
    if (!account_id || !address) {
      res.status(400).json({ error: 'account_id and address are required' });
      return;
    }
    const row = {
      tenant_id: tenantId,
      account_id,
      address,
      city: body.city != null ? String(body.city).trim() || null : null,
      province: body.province != null ? String(body.province).trim() || null : null,
      postal_code: body.postal_code != null ? String(body.postal_code).trim() || null : null,
      notes: body.notes != null ? String(body.notes) : null,
      updated_at: NOW_ISO(),
    };
    const { data, error } = await db.from('crm_properties').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ property: data });
    return;
  }

  if (action === 'property.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const patch: Record<string, unknown> = { updated_at: NOW_ISO() };
    const keys = ['address', 'city', 'province', 'postal_code', 'notes'] as const;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        const v = body[k];
        patch[k] = v === null ? null : String(v);
      }
    }
    const { data, error } = await db
      .from('crm_properties')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    res.status(200).json({ property: data });
    return;
  }

  if (action === 'property.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db.from('crm_properties').delete().eq('id', id).eq('tenant_id', tenantId);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'quote.send') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { data, error } = await db
      .from('quotes')
      .update({ status: 'Sent', sent_at: NOW_ISO(), updated_at: NOW_ISO() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    res.status(200).json({ quote: data });
    return;
  }

  if (action === 'quote.mark_approved') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { data, error } = await db
      .from('quotes')
      .update({ status: 'Approved', approved_at: NOW_ISO(), updated_at: NOW_ISO() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    res.status(200).json({ quote: data });
    return;
  }

  if (action === 'quote.convert_to_job') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { data, error } = await db
      .from('quotes')
      .update({ status: 'Converted', converted_at: NOW_ISO(), updated_at: NOW_ISO() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    res.status(200).json({ quote: data });
    return;
  }

  if (action === 'quote.convert_to_invoice') {
    const quote_id = String(body.quote_id ?? body.id ?? '');
    if (!quote_id) {
      res.status(400).json({ error: 'quote_id is required' });
      return;
    }
    const { data: quote, error: qe } = await db
      .from('quotes')
      .select('*')
      .eq('id', quote_id)
      .eq('tenant_id', tenantId)
      .single();
    if (await errTable(qe)) return;
    if (!quote) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    const { data: lines } = await db
      .from('quote_line_items')
      .select('*')
      .eq('quote_id', quote_id)
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true });
    const invoiceId = randomUUID();
    const { data: invoice, error: ie } = await db
      .from('invoices')
      .insert({
        id: invoiceId,
        tenant_id: tenantId,
        account_id: quote.account_id,
        property_id: quote.property_id,
        quote_id,
        job_id: null,
        title: `Invoice — ${quote.title}`,
        status: 'Draft',
        issue_date: todayDate(),
        due_date: defaultDueDate(),
        notes: quote.notes,
        payment_terms: 'Net 30',
        tax_rate: Number(quote.tax_rate ?? 0.05),
        subtotal: 0,
        tax_amount: 0,
        total: 0,
        amount_paid: 0,
        balance_due: 0,
        created_at: NOW_ISO(),
        updated_at: NOW_ISO(),
      })
      .select('*')
      .single();
    if (await errTable(ie)) return;
    if (lines && lines.length > 0) {
      const rows = lines.map((li: Record<string, unknown>, idx: number) => ({
        id: randomUUID(),
        tenant_id: tenantId,
        invoice_id: invoiceId,
        product_service_name: li.product_service_name,
        description: li.description ?? null,
        quantity: li.quantity,
        unit_price: li.unit_price,
        total: li.total,
        sort_order: li.sort_order != null ? Number(li.sort_order) : idx,
        created_at: NOW_ISO(),
      }));
      const { error: le } = await db.from('invoice_line_items').insert(rows);
      if (await errTable(le)) return;
    }
    await syncInvoiceFinancials(db, invoiceId, tenantId);
    const { data: finv, error: fe } = await db
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .single();
    if (await errTable(fe)) return;
    res.status(201).json({ invoice: finv });
    return;
  }

  res.status(400).json({ error: `Unknown action: ${action}` });
}
