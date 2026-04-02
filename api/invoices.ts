import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';

function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'string') { try { return JSON.parse(b) as Record<string, unknown>; } catch { return {}; } }
  return b as Record<string, unknown>;
}

const NOW_ISO = () => new Date().toISOString();

function errTable(table: string, error: any) {
  console.error(`[${table}]`, error);
  return error?.message || `${table} operation failed`;
}

async function recalculateInvoice(db: SupabaseClient, invoiceId: string) {
  try {
    // Get all line items for this invoice
    const { data: lineItems, error: lineErr } = await db
      .from('line_items')
      .select('total')
      .eq('invoice_id', invoiceId);

    if (lineErr) throw lineErr;

    const subtotal = (lineItems || []).reduce((sum, item) => sum + (item.total || 0), 0);

    // Get invoice to check for tax calculation
    const { data: invoice, error: invErr } = await db
      .from('invoices')
      .select('tax_rate')
      .eq('id', invoiceId)
      .single();

    if (invErr) throw invErr;

    const taxRate = invoice?.tax_rate || 0;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;

    // Get sum of payments
    const { data: payments, error: payErr } = await db
      .from('payments')
      .select('amount')
      .eq('invoice_id', invoiceId);

    if (payErr) throw payErr;

    const amountPaid = (payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const balanceDue = Math.max(total - amountPaid, 0);

    // Update invoice
    const { error: updateErr } = await db
      .from('invoices')
      .update({
        subtotal,
        tax,
        total,
        amount_paid: amountPaid,
        balance_due: balanceDue,
        updated_at: NOW_ISO(),
      })
      .eq('id', invoiceId);

    if (updateErr) throw updateErr;
  } catch (error) {
    console.error('recalculateInvoice error:', error);
    throw error;
  }
}

async function recalculatePayments(db: SupabaseClient, invoiceId: string) {
  try {
    // Get sum of payments
    const { data: payments, error: payErr } = await db
      .from('payments')
      .select('amount')
      .eq('invoice_id', invoiceId);

    if (payErr) throw payErr;

    const amountPaid = (payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);

    // Get current invoice total
    const { data: invoice, error: invErr } = await db
      .from('invoices')
      .select('total')
      .eq('id', invoiceId)
      .single();

    if (invErr) throw invErr;

    const total = invoice?.total || 0;
    const balanceDue = Math.max(total - amountPaid, 0);
    const newStatus = balanceDue <= 0 ? 'Paid' : 'Sent';

    // Update invoice
    const { error: updateErr } = await db
      .from('invoices')
      .update({
        amount_paid: amountPaid,
        balance_due: balanceDue,
        status: newStatus,
        updated_at: NOW_ISO(),
      })
      .eq('id', invoiceId);

    if (updateErr) throw updateErr;
  } catch (error) {
    console.error('recalculatePayments error:', error);
    throw error;
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse, db: SupabaseClient) {
  const action = req.query.action as string;

  if (action === 'list') {
    const { data, error } = await db
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false });

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
      .single();

    if (invErr) {
      return res.status(400).json({ error: errTable('invoices', invErr) });
    }

    const { data: lineItems, error: lineErr } = await db
      .from('line_items')
      .select('*')
      .eq('invoice_id', invoiceId);

    if (lineErr) {
      return res.status(400).json({ error: errTable('line_items', lineErr) });
    }

    const { data: payments, error: payErr } = await db
      .from('payments')
      .select('*')
      .eq('invoice_id', invoiceId);

    if (payErr) {
      return res.status(400).json({ error: errTable('payments', payErr) });
    }

    const { data: account, error: accErr } = await db
      .from('accounts')
      .select('*')
      .eq('id', invoice?.account_id)
      .single();

    if (accErr && accErr.code !== 'PGRST116') {
      return res.status(400).json({ error: errTable('accounts', accErr) });
    }

    const { data: property, error: propErr } = await db
      .from('properties')
      .select('*')
      .eq('id', invoice?.property_id)
      .single();

    if (propErr && propErr.code !== 'PGRST116') {
      return res.status(400).json({ error: errTable('properties', propErr) });
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

async function handlePost(req: VercelRequest, res: VercelResponse, db: SupabaseClient) {
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
    } = body;

    const id = randomUUID();
    const { data, error } = await db
      .from('invoices')
      .insert({
        id,
        account_id,
        property_id,
        job_id,
        quote_id,
        title,
        status: status || 'Draft',
        issue_date,
        due_date,
        notes,
        payment_terms,
        subtotal: 0,
        tax: 0,
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
    const { id, ...updates } = body;
    if (!id) {
      return res.status(400).json({ error: 'Missing invoice id' });
    }

    const { data, error } = await db
      .from('invoices')
      .update({
        ...updates,
        updated_at: NOW_ISO(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: errTable('invoices', error) });
    }

    return res.status(200).json({ invoice: data });
  }

  if (action === 'invoice.delete') {
    const { id } = body;
    if (!id) {
      return res.status(400).json({ error: 'Missing invoice id' });
    }

    const { error } = await db.from('invoices').delete().eq('id', id);

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
      .select('total')
      .eq('id', id)
      .single();

    if (getErr) {
      return res.status(400).json({ error: errTable('invoices', getErr) });
    }

    const { data, error } = await db
      .from('invoices')
      .update({
        status: 'Paid',
        amount_paid: invoice?.total || 0,
        balance_due: 0,
        updated_at: NOW_ISO(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: errTable('invoices', error) });
    }

    return res.status(200).json({ invoice: data });
  }

  if (action === 'line_item.create') {
    const { invoice_id, product_service_name, description, quantity, unit_price } = body;

    if (!invoice_id) {
      return res.status(400).json({ error: 'Missing invoice_id' });
    }

    const total = (quantity as number) * (unit_price as number);
    const id = randomUUID();

    const { data, error } = await db
      .from('line_items')
      .insert({
        id,
        invoice_id,
        product_service_name,
        description,
        quantity,
        unit_price,
        total,
        created_at: NOW_ISO(),
        updated_at: NOW_ISO(),
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: errTable('line_items', error) });
    }

    await recalculateInvoice(db, invoice_id as string);

    return res.status(201).json({ line_item: data });
  }

  if (action === 'line_item.update') {
    const { id, invoice_id, ...updates } = body;

    if (!id) {
      return res.status(400).json({ error: 'Missing line_item id' });
    }

    // Recalculate total if quantity or unit_price changed
    if (updates.quantity || updates.unit_price) {
      const { data: existing } = await db
        .from('line_items')
        .select('quantity, unit_price')
        .eq('id', id)
        .single();

      const qty = (updates.quantity as number) || existing?.quantity || 0;
      const price = (updates.unit_price as number) || existing?.unit_price || 0;
      updates.total = qty * price;
    }

    const { data, error } = await db
      .from('line_items')
      .update({
        ...updates,
        updated_at: NOW_ISO(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: errTable('line_items', error) });
    }

    if (invoice_id) {
      await recalculateInvoice(db, invoice_id as string);
    }

    return res.status(200).json({ line_item: data });
  }

  if (action === 'line_item.delete') {
    const { id, invoice_id } = body;

    if (!id) {
      return res.status(400).json({ error: 'Missing line_item id' });
    }

    const { error } = await db.from('line_items').delete().eq('id', id);

    if (error) {
      return res.status(400).json({ error: errTable('line_items', error) });
    }

    if (invoice_id) {
      await recalculateInvoice(db, invoice_id as string);
    }

    return res.status(200).json({ ok: true });
  }

  if (action === 'payment.create') {
    const { invoice_id, amount, payment_method, payment_date, reference_number, notes } = body;

    if (!invoice_id) {
      return res.status(400).json({ error: 'Missing invoice_id' });
    }

    const id = randomUUID();
    const { data, error } = await db
      .from('payments')
      .insert({
        id,
        invoice_id,
        amount,
        payment_method,
        payment_date,
        reference_number,
        notes,
        created_at: NOW_ISO(),
        updated_at: NOW_ISO(),
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: errTable('payments', error) });
    }

    await recalculatePayments(db, invoice_id as string);

    return res.status(201).json({ payment: data });
  }

  if (action === 'payment.delete') {
    const { id, invoice_id } = body;

    if (!id) {
      return res.status(400).json({ error: 'Missing payment id' });
    }

    const { error } = await db.from('payments').delete().eq('id', id);

    if (error) {
      return res.status(400).json({ error: errTable('payments', error) });
    }

    if (invoice_id) {
      await recalculatePayments(db, invoice_id as string);
    }

    return res.status(200).json({ ok: true });
  }

  if (action === 'payments.list') {
    // Fetch all payments joined with invoice + account for the Payments page.
    // Try invoice_payments (migration name) first, fall back to payments (legacy alias).
    let payments: any[] = [];
    for (const table of ['invoice_payments', 'payments']) {
      const { data, error } = await db
        .from(table)
        .select('*')
        .order('payment_date', { ascending: false });
      if (!error) { payments = data || []; break; }
    }

    const list = payments || [];

    // Batch-fetch invoices referenced by these payments
    const invoiceIds = [...new Set(list.map((p: any) => p.invoice_id).filter(Boolean))];
    const { data: invoices } = invoiceIds.length
      ? await db.from('invoices').select('id, invoice_number, account_id, due_date, title').in('id', invoiceIds)
      : { data: [] };

    const invoiceMap: Record<string, any> = {};
    (invoices || []).forEach((inv: any) => { invoiceMap[inv.id] = inv; });

    // Batch-fetch accounts
    const accountIds = [...new Set((invoices || []).map((inv: any) => inv.account_id).filter(Boolean))];
    const { data: accounts } = accountIds.length
      ? await db.from('accounts').select('id, name, account_type').in('id', accountIds)
      : { data: [] };

    const accountMap: Record<string, any> = {};
    (accounts || []).forEach((acc: any) => { accountMap[acc.id] = acc; });

    // Compute stats
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo  = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Invoice payment time (days from issue_date to payment_date) — last 30 days
    const recentPaid = list.filter((p: any) => {
      const pd = new Date(p.payment_date);
      return pd >= thirtyDaysAgo;
    });

    function avgDaysToPayByType(type: string) {
      const inv60 = (invoices || []).filter((inv: any) => {
        const acc = accountMap[inv.account_id];
        return acc?.account_type?.toLowerCase() === type.toLowerCase();
      });
      const inv60Ids = new Set(inv60.map((i: any) => i.id));
      const relevant = recentPaid.filter((p: any) => inv60Ids.has(p.invoice_id));
      if (!relevant.length) return null;
      // We don't have issue_date on payment; use payment_date minus invoice due_date as proxy
      const days = relevant.map((p: any) => {
        const inv = invoiceMap[p.invoice_id];
        if (!inv?.due_date) return 0;
        const diff = (new Date(p.payment_date).getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24);
        return Math.max(0, Math.round(diff));
      });
      return Math.round(days.reduce((a: number, b: number) => a + b, 0) / days.length);
    }

    function paidOnTimeRatioByType(type: string) {
      const inv60 = (invoices || []).filter((inv: any) => {
        const acc = accountMap[inv.account_id];
        const pd = new Date(inv.due_date);
        return acc?.account_type?.toLowerCase() === type.toLowerCase() && pd >= sixtyDaysAgo;
      });
      if (!inv60.length) return null;
      const inv60Ids = new Set(inv60.map((i: any) => i.id));
      const onTime = list.filter((p: any) => {
        if (!inv60Ids.has(p.invoice_id)) return false;
        const inv = invoiceMap[p.invoice_id];
        return inv && new Date(p.payment_date) <= new Date(inv.due_date);
      });
      return Math.round((onTime.length / inv60.length) * 100);
    }

    const totalCollected = list.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
    const totalThisMonth = list
      .filter((p: any) => new Date(p.payment_date) >= thirtyDaysAgo)
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    const enriched = list.map((p: any) => {
      const inv = invoiceMap[p.invoice_id] || null;
      const acc = inv ? (accountMap[inv.account_id] || null) : null;
      return { ...p, invoice: inv, account: acc };
    });

    return res.status(200).json({
      payments: enriched,
      stats: {
        total_collected:   totalCollected,
        total_this_month:  totalThisMonth,
        avg_days_residential: avgDaysToPayByType('residential'),
        avg_days_commercial:  avgDaysToPayByType('commercial'),
        paid_on_time_residential: paidOnTimeRatioByType('residential'),
        paid_on_time_commercial:  paidOnTimeRatioByType('commercial'),
      },
    });
  }

  if (action === 'invoice.create_from_job') {
    const { job_id } = body;

    if (!job_id) {
      return res.status(400).json({ error: 'Missing job_id' });
    }

    // Fetch job data
    const { data: job, error: jobErr } = await db
      .from('jobs')
      .select('*, account_id, property_id')
      .eq('id', job_id)
      .single();

    if (jobErr) {
      return res.status(400).json({ error: errTable('jobs', jobErr) });
    }

    // Fetch job line items
    const { data: jobLineItems, error: lineErr } = await db
      .from('line_items')
      .select('*')
      .eq('job_id', job_id);

    if (lineErr) {
      return res.status(400).json({ error: errTable('line_items', lineErr) });
    }

    // Create invoice
    const invoiceId = randomUUID();
    const { data: invoice, error: invErr } = await db
      .from('invoices')
      .insert({
        id: invoiceId,
        account_id: job?.account_id,
        property_id: job?.property_id,
        job_id,
        title: `Invoice from Job ${job_id}`,
        status: 'Draft',
        issue_date: NOW_ISO(),
        subtotal: 0,
        tax: 0,
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

    // Copy line items from job
    if (jobLineItems && jobLineItems.length > 0) {
      const itemsToInsert = jobLineItems.map((item) => ({
        id: randomUUID(),
        invoice_id: invoiceId,
        product_service_name: item.product_service_name,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total: item.total,
        created_at: NOW_ISO(),
        updated_at: NOW_ISO(),
      }));

      const { error: insertErr } = await db.from('line_items').insert(itemsToInsert);

      if (insertErr) {
        return res.status(400).json({ error: errTable('line_items', insertErr) });
      }
    }

    // Recalculate invoice totals
    await recalculateInvoice(db, invoiceId);

    // Fetch final invoice
    const { data: finalInvoice } = await db
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
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

  if (req.method === 'GET') {
    return handleGet(req, res, db);
  }

  if (req.method === 'POST') {
    return handlePost(req, res, db);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
