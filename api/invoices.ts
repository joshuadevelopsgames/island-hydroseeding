import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { requireAuth } from './_auth';
import { resolveTenantId } from './_tenant';
import { lineTotal, roundMoney, balancesMatch, MONEY_EPS } from './_documentPricing';
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

function errTable(table: string, error: unknown) {
  console.error(`[${table}]`, error);
  const e = error as { message?: string } | null;
  return e?.message || `${table} operation failed`;
}

async function assertInvoiceLineItemsEditable(
  db: SupabaseClient,
  invoiceId: string,
  tenantId: string
): Promise<string | null> {
  const { data, error } = await db
    .from('invoices')
    .select('status')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single();
  if (error) return error.message;
  const s = String(data?.status ?? '');
  if (s === 'Paid') return 'Cannot edit line items on a paid invoice';
  if (s === 'Bad Debt') return 'Cannot edit line items on this invoice';
  return null;
}

async function nextLineSortOrder(db: SupabaseClient, invoiceId: string, tenantId: string): Promise<number> {
  const { data } = await db
    .from('invoice_line_items')
    .select('sort_order')
    .eq('invoice_id', invoiceId)
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.sort_order ?? -1) + 1;
}

async function handleGet(req: VercelRequest, res: VercelResponse, db: SupabaseClient, tenantId: string) {
  const action = req.query.action as string;

  if (action === 'list') {
    const accountId = String(req.query.account_id ?? '').trim();
    let q = db.from('invoices').select('*').eq('tenant_id', tenantId);
    if (accountId) q = q.eq('account_id', accountId);
    const { data, error } = await q.order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ error: errTable('invoices', error) });
    }

    return res.status(200).json({ invoices: data || [] });
  }

  if (action === 'get') {
    const invoiceId = req.query.id as string;
    if (!invoiceId) {
      return res.status(400).json({ error: 'Missing invoice id' });
    }

    const { data: invoice, error: invErr } = await db
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .single();

    if (invErr) {
      return res.status(400).json({ error: errTable('invoices', invErr) });
    }

    const { data: lineItems, error: lineErr } = await db
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true });

    if (lineErr) {
      return res.status(400).json({ error: errTable('invoice_line_items', lineErr) });
    }

    const { data: payments, error: payErr } = await db
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', invoiceId)
      .eq('tenant_id', tenantId)
      .order('payment_date', { ascending: false });

    if (payErr) {
      return res.status(400).json({ error: errTable('invoice_payments', payErr) });
    }

    let account = null;
    if (invoice?.account_id) {
      const { data: acc, error: accErr } = await db
        .from('crm_accounts')
        .select('*')
        .eq('id', invoice.account_id as string)
        .eq('tenant_id', tenantId)
        .single();
      if (accErr && accErr.code !== 'PGRST116') {
        return res.status(400).json({ error: errTable('crm_accounts', accErr) });
      }
      account = acc;
    }

    let property = null;
    if (invoice?.property_id) {
      const { data: prop, error: propErr } = await db
        .from('crm_properties')
        .select('*')
        .eq('id', invoice.property_id as string)
        .eq('tenant_id', tenantId)
        .single();
      if (propErr && propErr.code !== 'PGRST116') {
        return res.status(400).json({ error: errTable('crm_properties', propErr) });
      }
      property = prop;
    }

    return res.status(200).json({
      invoice,
      line_items: lineItems || [],
      payments: payments || [],
      account,
      property,
    });
  }

  return res.status(400).json({ error: 'Unknown GET action' });
}

const INVOICE_PATCH_KEYS = [
  'title',
  'account_id',
  'property_id',
  'job_id',
  'quote_id',
  'issue_date',
  'due_date',
  'notes',
  'payment_terms',
  'tax_rate',
  'status',
  'section_visibility',
  'custom_text',
] as const;

const ALLOWED_INVOICE_DESIGNS = new Set(['editorial', 'technical', 'field', 'statement']);

async function handlePost(req: VercelRequest, res: VercelResponse, db: SupabaseClient, tenantId: string) {
  const body = parseBody(req);
  const action = body.action as string;

  if (action === 'invoice.create') {
    const {
      account_id,
      property_id,
      job_id,
      quote_id,
      title,
      status,
      issue_date,
      due_date,
      notes,
      payment_terms,
      tax_rate,
    } = body;

    const id = randomUUID();
    const issue = (issue_date as string) || todayDate();
    const due = (due_date as string) || defaultDueDate();
    const tr = tax_rate != null ? Number(tax_rate) : 0.05;
    const designRaw = body.template_design != null ? String(body.template_design) : 'editorial';
    const template_design = ALLOWED_INVOICE_DESIGNS.has(designRaw) ? designRaw : 'editorial';

    const { data, error } = await db
      .from('invoices')
      .insert({
        id,
        tenant_id: tenantId,
        account_id,
        property_id,
        job_id,
        quote_id,
        title,
        status: (status as string) || 'Draft',
        issue_date: issue,
        due_date: due,
        notes,
        payment_terms,
        tax_rate: tr,
        template_design,
        section_visibility: body.section_visibility ?? {},
        custom_text: body.custom_text ?? {},
        subtotal: 0,
        tax_amount: 0,
        total: 0,
        amount_paid: 0,
        balance_due: 0,
        created_at: NOW_ISO(),
        updated_at: NOW_ISO(),
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: errTable('invoices', error) });
    }

    return res.status(201).json({ invoice: data });
  }

  if (action === 'invoice.update') {
    const { id, ...raw } = body;
    if (!id) {
      return res.status(400).json({ error: 'Missing invoice id' });
    }

    const updates: Record<string, unknown> = { updated_at: NOW_ISO() };
    for (const k of INVOICE_PATCH_KEYS) {
      if (Object.prototype.hasOwnProperty.call(raw, k)) {
        updates[k] = raw[k as keyof typeof raw];
      }
    }
    if (Object.prototype.hasOwnProperty.call(raw, 'template_design')) {
      const d = String((raw as Record<string, unknown>).template_design ?? '');
      if (!ALLOWED_INVOICE_DESIGNS.has(d)) {
        return res.status(400).json({ error: `Invalid template_design: ${d}` });
      }
      updates.template_design = d;
    }

    const { data, error } = await db
      .from('invoices')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: errTable('invoices', error) });
    }

    if ('tax_rate' in updates) {
      await syncInvoiceFinancials(db, id as string, tenantId);
      const { data: refreshed } = await db
        .from('invoices')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();
      return res.status(200).json({ invoice: refreshed });
    }

    return res.status(200).json({ invoice: data });
  }

  if (action === 'invoice.delete') {
    const { id } = body;
    if (!id) {
      return res.status(400).json({ error: 'Missing invoice id' });
    }

    const { error } = await db.from('invoices').delete().eq('id', id).eq('tenant_id', tenantId);

    if (error) {
      return res.status(400).json({ error: errTable('invoices', error) });
    }

    return res.status(200).json({ ok: true });
  }

  if (action === 'invoice.send') {
    const { id } = body;
    if (!id) {
      return res.status(400).json({ error: 'Missing invoice id' });
    }

    const { data, error } = await db
      .from('invoices')
      .update({
        status: 'Sent',
        updated_at: NOW_ISO(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: errTable('invoices', error) });
    }

    return res.status(200).json({ invoice: data });
  }

  if (action === 'invoice.mark_paid') {
    const { id } = body;
    if (!id) {
      return res.status(400).json({ error: 'Missing invoice id' });
    }

    const { data: invoice, error: getErr } = await db
      .from('invoices')
      .select('total, amount_paid, balance_due')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (getErr) {
      return res.status(400).json({ error: errTable('invoices', getErr) });
    }

    const remaining = roundMoney(Number(invoice?.balance_due ?? 0));
    if (remaining > MONEY_EPS) {
      const payId = randomUUID();
      const now = NOW_ISO();
      const { error: insErr } = await db.from('invoice_payments').insert({
        id: payId,
        tenant_id: tenantId,
        invoice_id: id,
        amount: remaining,
        payment_method: 'manual',
        payment_date: now.slice(0, 10),
        reference_number: 'mark_paid',
        notes: 'Recorded via mark paid',
        created_at: now,
      });
      if (insErr) {
        return res.status(400).json({ error: errTable('invoice_payments', insErr) });
      }
    }

    await syncInvoiceFinancials(db, id as string, tenantId);
    const { data: finalInv } = await db
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();
    return res.status(200).json({ invoice: finalInv });
  }

  if (action === 'line_item.create') {
    const { invoice_id, product_service_name, description, quantity, unit_price } = body;

    if (!invoice_id) {
      return res.status(400).json({ error: 'Missing invoice_id' });
    }

    const locked = await assertInvoiceLineItemsEditable(db, invoice_id as string, tenantId);
    if (locked) {
      return res.status(400).json({ error: locked });
    }

    const qty = Number(quantity);
    const price = Number(unit_price);
    const total = lineTotal(qty, price);
    const id = randomUUID();
    const sort_order = await nextLineSortOrder(db, invoice_id as string, tenantId);

    const { data, error } = await db
      .from('invoice_line_items')
      .insert({
        id,
        tenant_id: tenantId,
        invoice_id,
        product_service_name,
        description: description ?? null,
        quantity: qty,
        unit_price: price,
        total,
        sort_order,
        created_at: NOW_ISO(),
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: errTable('invoice_line_items', error) });
    }

    await syncInvoiceFinancials(db, invoice_id as string, tenantId);

    return res.status(201).json({ line_item: data });
  }

  if (action === 'line_item.update') {
    const { id, invoice_id, ...updates } = body;

    if (!id) {
      return res.status(400).json({ error: 'Missing line_item id' });
    }

    const { data: existing, error: exErr } = await db
      .from('invoice_line_items')
      .select('invoice_id, quantity, unit_price')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (exErr || !existing) {
      return res.status(400).json({ error: exErr ? errTable('invoice_line_items', exErr) : 'Line item not found' });
    }

    const invId = (invoice_id as string) || (existing.invoice_id as string);
    const locked = await assertInvoiceLineItemsEditable(db, invId, tenantId);
    if (locked) {
      return res.status(400).json({ error: locked });
    }

    const patch: Record<string, unknown> = {};
    if (updates.product_service_name != null) patch.product_service_name = updates.product_service_name;
    if (updates.description !== undefined) patch.description = updates.description;
    if (updates.quantity != null) patch.quantity = Number(updates.quantity);
    if (updates.unit_price != null) patch.unit_price = Number(updates.unit_price);

    const qty = patch.quantity != null ? Number(patch.quantity) : Number(existing.quantity);
    const price = patch.unit_price != null ? Number(patch.unit_price) : Number(existing.unit_price);
    if (updates.quantity != null || updates.unit_price != null) {
      patch.total = lineTotal(qty, price);
    }

    const { data, error } = await db
      .from('invoice_line_items')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: errTable('invoice_line_items', error) });
    }

    await syncInvoiceFinancials(db, invId, tenantId);

    return res.status(200).json({ line_item: data });
  }

  if (action === 'line_item.delete') {
    const { id } = body;

    if (!id) {
      return res.status(400).json({ error: 'Missing line_item id' });
    }

    const { data: row } = await db
      .from('invoice_line_items')
      .select('invoice_id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!row?.invoice_id) {
      return res.status(400).json({ error: 'Line item not found' });
    }

    const locked = await assertInvoiceLineItemsEditable(db, row.invoice_id as string, tenantId);
    if (locked) {
      return res.status(400).json({ error: locked });
    }

    const { error } = await db.from('invoice_line_items').delete().eq('id', id).eq('tenant_id', tenantId);

    if (error) {
      return res.status(400).json({ error: errTable('invoice_line_items', error) });
    }

    await syncInvoiceFinancials(db, row.invoice_id as string, tenantId);

    return res.status(200).json({ ok: true });
  }

  if (action === 'payment.create') {
    const { invoice_id, amount, payment_method, payment_date, reference_number, notes } = body;

    if (!invoice_id) {
      return res.status(400).json({ error: 'Missing invoice_id' });
    }

    const { data: inv, error: invErr } = await db
      .from('invoices')
      .select('balance_due, status')
      .eq('id', invoice_id)
      .eq('tenant_id', tenantId)
      .single();

    if (invErr) {
      return res.status(400).json({ error: errTable('invoices', invErr) });
    }

    if (String(inv?.status) === 'Paid' && balancesMatch(Number(inv?.balance_due ?? 0), 0)) {
      return res.status(400).json({ error: 'Invoice is already fully paid' });
    }

    const amt = roundMoney(Number(amount));
    if (amt <= 0) {
      return res.status(400).json({ error: 'Payment amount must be positive' });
    }

    const bal = roundMoney(Number(inv?.balance_due ?? 0));
    if (amt - bal > MONEY_EPS) {
      return res.status(400).json({ error: `Payment exceeds balance due (${bal})` });
    }

    const id = randomUUID();
    const { data, error } = await db
      .from('invoice_payments')
      .insert({
        id,
        tenant_id: tenantId,
        invoice_id,
        amount: amt,
        payment_method: payment_method ?? null,
        payment_date: (payment_date as string) || todayDate(),
        reference_number: reference_number ?? null,
        notes: notes ?? null,
        created_at: NOW_ISO(),
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: errTable('invoice_payments', error) });
    }

    await syncInvoiceFinancials(db, invoice_id as string, tenantId);

    return res.status(201).json({ payment: data });
  }

  if (action === 'payment.delete') {
    const { id } = body;

    if (!id) {
      return res.status(400).json({ error: 'Missing payment id' });
    }

    const { data: row } = await db
      .from('invoice_payments')
      .select('invoice_id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!row?.invoice_id) {
      return res.status(400).json({ error: 'Payment not found' });
    }

    const { error } = await db.from('invoice_payments').delete().eq('id', id).eq('tenant_id', tenantId);

    if (error) {
      return res.status(400).json({ error: errTable('invoice_payments', error) });
    }

    await syncInvoiceFinancials(db, row.invoice_id as string, tenantId);

    return res.status(200).json({ ok: true });
  }

  if (action === 'payments.list') {
    const { data: payments, error } = await db
      .from('invoice_payments')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('payment_date', { ascending: false });

    if (error) {
      return res.status(400).json({ error: errTable('invoice_payments', error) });
    }

    const list = payments || [];

    const invoiceIds = [...new Set(list.map((p: { invoice_id: string }) => p.invoice_id).filter(Boolean))];
    const { data: invoices } = invoiceIds.length
      ? await db
          .from('invoices')
          .select('id, invoice_number, account_id, due_date, title, issue_date')
          .eq('tenant_id', tenantId)
          .in('id', invoiceIds)
      : { data: [] as { id: string; invoice_number: number; account_id: string | null; due_date: string; title: string | null; issue_date: string }[] };

    const invoiceMap: Record<string, (typeof invoices)[0]> = {};
    (invoices || []).forEach((inv) => {
      invoiceMap[inv.id] = inv;
    });

    const accountIds = [...new Set((invoices || []).map((inv) => inv.account_id).filter(Boolean))] as string[];
    const { data: accounts } = accountIds.length
      ? await db
          .from('crm_accounts')
          .select('id, name, account_type')
          .eq('tenant_id', tenantId)
          .in('id', accountIds)
      : { data: [] as { id: string; name: string; account_type: string }[] };

    const accountMap: Record<string, (typeof accounts)[0]> = {};
    (accounts || []).forEach((acc) => {
      accountMap[acc.id] = acc;
    });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const recentPaid = list.filter((p: { payment_date: string }) => {
      const pd = new Date(p.payment_date);
      return pd >= thirtyDaysAgo;
    });

    function avgDaysToPayByType(type: string) {
      const inv60 = (invoices || []).filter((inv) => {
        const acc = accountMap[inv.account_id as string];
        return acc?.account_type?.toLowerCase() === type.toLowerCase();
      });
      const inv60Ids = new Set(inv60.map((i) => i.id));
      const relevant = recentPaid.filter((p: { invoice_id: string }) => inv60Ids.has(p.invoice_id));
      if (!relevant.length) return null;
      const days = relevant.map((p: { payment_date: string; invoice_id: string }) => {
        const inv = invoiceMap[p.invoice_id];
        if (!inv?.due_date) return 0;
        const diff =
          (new Date(p.payment_date).getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24);
        return Math.max(0, Math.round(diff));
      });
      return Math.round(days.reduce((a: number, b: number) => a + b, 0) / days.length);
    }

    function paidOnTimeRatioByType(type: string) {
      const inv60 = (invoices || []).filter((inv) => {
        const acc = accountMap[inv.account_id as string];
        const pd = new Date(inv.due_date);
        return acc?.account_type?.toLowerCase() === type.toLowerCase() && pd >= sixtyDaysAgo;
      });
      if (!inv60.length) return null;
      const inv60Ids = new Set(inv60.map((i) => i.id));
      const onTime = list.filter((p: { invoice_id: string; payment_date: string }) => {
        if (!inv60Ids.has(p.invoice_id)) return false;
        const inv = invoiceMap[p.invoice_id];
        return inv && new Date(p.payment_date) <= new Date(inv.due_date);
      });
      return Math.round((onTime.length / inv60.length) * 100);
    }

    const totalCollected = list.reduce((sum: number, p: { amount?: number }) => sum + (p.amount || 0), 0);
    const totalThisMonth = list
      .filter((p: { payment_date: string }) => new Date(p.payment_date) >= thirtyDaysAgo)
      .reduce((sum: number, p: { amount?: number }) => sum + (p.amount || 0), 0);

    const enriched = list.map((p: Record<string, unknown>) => {
      const inv = invoiceMap[p.invoice_id as string] || null;
      const acc = inv ? accountMap[inv.account_id as string] || null : null;
      return { ...p, invoice: inv, account: acc };
    });

    return res.status(200).json({
      payments: enriched,
      stats: {
        total_collected: totalCollected,
        total_this_month: totalThisMonth,
        avg_days_residential: avgDaysToPayByType('residential'),
        avg_days_commercial: avgDaysToPayByType('commercial'),
        paid_on_time_residential: paidOnTimeRatioByType('residential'),
        paid_on_time_commercial: paidOnTimeRatioByType('commercial'),
      },
    });
  }

  if (action === 'invoice.create_from_job') {
    const { job_id } = body;

    if (!job_id) {
      return res.status(400).json({ error: 'Missing job_id' });
    }

    const { data: job, error: jobErr } = await db
      .from('jobs')
      .select('id, account_id, property_id, title')
      .eq('id', job_id)
      .eq('tenant_id', tenantId)
      .single();

    if (jobErr) {
      return res.status(400).json({ error: errTable('jobs', jobErr) });
    }

    const { data: jobLineItems, error: lineErr } = await db
      .from('job_line_items')
      .select('*')
      .eq('job_id', job_id)
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true });

    if (lineErr) {
      return res.status(400).json({ error: errTable('job_line_items', lineErr) });
    }

    const invoiceId = randomUUID();
    const issue = todayDate();
    const due = defaultDueDate();

    const { data: invoice, error: invErr } = await db
      .from('invoices')
      .insert({
        id: invoiceId,
        tenant_id: tenantId,
        account_id: job?.account_id,
        property_id: job?.property_id,
        job_id,
        title: job?.title ? `Invoice — ${job.title}` : `Invoice from job`,
        status: 'Draft',
        issue_date: issue,
        due_date: due,
        tax_rate: 0.05,
        subtotal: 0,
        tax_amount: 0,
        total: 0,
        amount_paid: 0,
        balance_due: 0,
        created_at: NOW_ISO(),
        updated_at: NOW_ISO(),
      })
      .select()
      .single();

    if (invErr) {
      return res.status(400).json({ error: errTable('invoices', invErr) });
    }

    if (jobLineItems && jobLineItems.length > 0) {
      const itemsToInsert = jobLineItems.map((item: Record<string, unknown>, idx: number) => ({
        id: randomUUID(),
        tenant_id: tenantId,
        invoice_id: invoiceId,
        product_service_name: item.product_service_name,
        description: item.description ?? null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
        sort_order: item.sort_order != null ? Number(item.sort_order) : idx,
        created_at: NOW_ISO(),
      }));

      const { error: insertErr } = await db.from('invoice_line_items').insert(itemsToInsert);

      if (insertErr) {
        return res.status(400).json({ error: errTable('invoice_line_items', insertErr) });
      }
    }

    await syncInvoiceFinancials(db, invoiceId, tenantId);

    const { data: finalInvoice } = await db
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .single();

    return res.status(201).json({ invoice: finalInvoice });
  }

  return res.status(400).json({ error: 'Unknown POST action' });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = supabase();
  if (!db) {
    return res.status(500).json({ error: 'Database connection failed' });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const tenantId = resolveTenantId();

  if (req.method === 'GET') {
    return handleGet(req, res, db, tenantId);
  }

  if (req.method === 'POST') {
    return handlePost(req, res, db, tenantId);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
