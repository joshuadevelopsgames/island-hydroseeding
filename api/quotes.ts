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
  const { data: q } = await db
    .from('quotes')
    .select('tax_rate')
    .eq('id', quoteId)
    .eq('tenant_id', tenantId)
    .single();
  const taxRate = Number(q?.tax_rate ?? 0.05);
  const { subtotal, tax_amount, total } = documentTotalsFromSubtotal(subtotalRaw, taxRate);
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
      const { data, error } = await db
        .from('quotes')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
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
        .order('created_at', { ascending: true });
      if (line_items.error) {
        res.status(500).json({ error: line_items.error.message });
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
      approval_token,
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
    const keys = ['title', 'property_id', 'salesperson_id', 'introduction', 'contract_disclaimer', 'tax_rate', 'deposit_required', 'deposit_amount', 'notes', 'status'] as const;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        const v = body[k];
        patch[k] = v;
      }
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
    const row = {
      tenant_id: tenantId,
      quote_id,
      product_service_name,
      quantity,
      unit_price,
      total,
    };
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
    const keys = ['product_service_name', 'quantity', 'unit_price'] as const;
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
      quantity: Number(item.quantity ?? 0),
      unit_price: Number(item.unit_price ?? 0),
      total: lineTotal(Number(item.quantity ?? 0), Number(item.unit_price ?? 0)),
      sort_order: idx,
    }));
    const { data, error } = await db.from('quote_line_items').insert(toInsert).select('*');
    if (await errTable(error)) return;
    await recalculateQuote(db, quote_id, tenantId);
    res.status(200).json({ line_items: data ?? [] });
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
