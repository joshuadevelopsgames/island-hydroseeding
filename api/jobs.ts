import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_auth';

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

async function recalculateJob(db: SupabaseClient, jobId: string) {
  const { data: items } = await db.from('job_line_items').select('total').eq('job_id', jobId);
  const totalPrice = (items ?? []).reduce((sum, i) => sum + Number(i.total), 0);
  await db.from('jobs').update({ total_price: totalPrice, updated_at: NOW_ISO() }).eq('id', jobId);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = supabase();
  if (!db) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return;
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const action = String(req.query.action ?? '');
    if (action === 'list') {
      const { data, error } = await db.from('jobs').select('*').order('created_at', { ascending: false });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ jobs: data ?? [] });
      return;
    }
    if (action === 'get') {
      const id = String(req.query.id ?? '');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const [job, lineItems, visits, expenses, timeEntries, account, property] = await Promise.all([
        db.from('jobs').select('*').eq('id', id).maybeSingle(),
        db.from('job_line_items').select('*').eq('job_id', id).order('created_at', { ascending: true }),
        db.from('job_visits').select('*').eq('job_id', id).order('scheduled_at', { ascending: false }),
        db.from('job_expenses').select('*').eq('job_id', id).order('created_at', { ascending: false }),
        db.from('job_time_entries').select('*').eq('job_id', id).order('started_at', { ascending: false }),
        db.from('crm_accounts').select('*').eq('id', (job as any)?.data?.account_id).maybeSingle(),
        db.from('properties').select('*').eq('id', (job as any)?.data?.property_id).maybeSingle(),
      ]);
      if (job.error) {
        res.status(500).json({ error: job.error.message });
        return;
      }
      if (!job.data) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      res.status(200).json({
        job: job.data,
        line_items: lineItems.data ?? [],
        visits: visits.data ?? [],
        expenses: expenses.data ?? [],
        time_entries: timeEntries.data ?? [],
        account: account.data ?? null,
        property: property.data ?? null,
      });
      return;
    }
    res.status(400).json({ error: 'Invalid GET: use action=list or action=get&id=' });
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

  if (action === 'job.create') {
    const accountId = String(body.account_id ?? '');
    const title = String(body.title ?? '').trim();
    if (!accountId || !title) {
      res.status(400).json({ error: 'account_id and title are required' });
      return;
    }
    const row = {
      account_id: accountId,
      property_id: body.property_id != null ? String(body.property_id) : null,
      quote_id: body.quote_id != null ? String(body.quote_id) : null,
      title,
      job_type: body.job_type != null ? String(body.job_type) : null,
      status: String(body.status ?? 'New'),
      billing_frequency: body.billing_frequency != null ? String(body.billing_frequency) : null,
      automatic_payments: Boolean(body.automatic_payments),
      start_date: body.start_date != null ? String(body.start_date) : null,
      end_date: body.end_date != null ? String(body.end_date) : null,
      salesperson_id: body.salesperson_id != null ? String(body.salesperson_id) : null,
      total_price: Number(body.total_price ?? 0),
      notes: body.notes != null ? String(body.notes) : null,
      updated_at: NOW_ISO(),
    };
    const { data, error } = await db.from('jobs').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ job: data });
    return;
  }

  if (action === 'job.create_from_quote') {
    const quoteId = String(body.quote_id ?? '');
    if (!quoteId) {
      res.status(400).json({ error: 'quote_id is required' });
      return;
    }
    const [quoteRes, lineItemsRes] = await Promise.all([
      db.from('quotes').select('*').eq('id', quoteId).maybeSingle(),
      db.from('quote_line_items').select('*').eq('quote_id', quoteId),
    ]);
    if (quoteRes.error) {
      res.status(500).json({ error: quoteRes.error.message });
      return;
    }
    if (!quoteRes.data) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    const quote = quoteRes.data as Record<string, unknown>;
    const jobRow = {
      account_id: String(quote.account_id ?? ''),
      property_id: quote.property_id != null ? String(quote.property_id) : null,
      quote_id: quoteId,
      title: String(quote.title ?? quote.name ?? ''),
      total_price: Number(quote.total ?? 0),
      updated_at: NOW_ISO(),
    };
    const { data: createdJob, error: jobError } = await db.from('jobs').insert(jobRow).select('*').single();
    if (await errTable(jobError)) return;
    if (!createdJob) {
      res.status(500).json({ error: 'Failed to create job' });
      return;
    }
    const jobId = createdJob.id as string;
    const quoteLineItems = lineItemsRes.data ?? [];
    if (quoteLineItems.length > 0) {
      const lineItemsToInsert = quoteLineItems.map((item: Record<string, unknown>) => ({
        job_id: jobId,
        product_service_name: String(item.product_service_name ?? item.description ?? ''),
        quantity: Number(item.quantity ?? 1),
        unit_price: Number(item.unit_price ?? 0),
        total: Number(item.total ?? 0),
        updated_at: NOW_ISO(),
      }));
      await db.from('job_line_items').insert(lineItemsToInsert);
    }
    await db.from('quotes').update({ status: 'Converted', converted_at: NOW_ISO() }).eq('id', quoteId);
    res.status(200).json({ job: createdJob });
    return;
  }

  if (action === 'job.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const patch: Record<string, unknown> = { updated_at: NOW_ISO() };
    const keys = [
      'account_id',
      'property_id',
      'quote_id',
      'title',
      'job_type',
      'status',
      'billing_frequency',
      'start_date',
      'end_date',
      'salesperson_id',
      'total_price',
      'notes',
    ] as const;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        const v = body[k];
        if (v === null) patch[k] = null;
        else if (k === 'total_price') patch[k] = Number(v);
        else if (k === 'automatic_payments') patch[k] = Boolean(v);
        else patch[k] = String(v);
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'automatic_payments')) {
      patch.automatic_payments = Boolean(body.automatic_payments);
    }
    const { data, error } = await db.from('jobs').update(patch).eq('id', id).select('*').single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.status(200).json({ job: data });
    return;
  }

  if (action === 'job.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db.from('jobs').delete().eq('id', id);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'job.recalculate') {
    const jobId = String(body.job_id ?? '');
    if (!jobId) {
      res.status(400).json({ error: 'job_id is required' });
      return;
    }
    await recalculateJob(db, jobId);
    const { data, error } = await db.from('jobs').select('*').eq('id', jobId).maybeSingle();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.status(200).json({ job: data });
    return;
  }

  if (action === 'line_item.create') {
    const jobId = String(body.job_id ?? '');
    const productServiceName = String(body.product_service_name ?? '').trim();
    const quantity = Number(body.quantity ?? 1);
    const unitPrice = Number(body.unit_price ?? 0);
    if (!jobId || !productServiceName) {
      res.status(400).json({ error: 'job_id and product_service_name are required' });
      return;
    }
    const total = quantity * unitPrice;
    const row = {
      job_id: jobId,
      product_service_name: productServiceName,
      quantity,
      unit_price: unitPrice,
      total,
      updated_at: NOW_ISO(),
    };
    const { data, error } = await db.from('job_line_items').insert(row).select('*').single();
    if (await errTable(error)) return;
    await recalculateJob(db, jobId);
    res.status(200).json({ line_item: data });
    return;
  }

  if (action === 'line_item.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const getRes = await db.from('job_line_items').select('*').eq('id', id).maybeSingle();
    if (getRes.error) {
      res.status(500).json({ error: getRes.error.message });
      return;
    }
    if (!getRes.data) {
      res.status(404).json({ error: 'Line item not found' });
      return;
    }
    const existing = getRes.data as Record<string, unknown>;
    const jobId = String(existing.job_id ?? '');
    const patch: Record<string, unknown> = { updated_at: NOW_ISO() };
    if (Object.prototype.hasOwnProperty.call(body, 'product_service_name')) {
      patch.product_service_name = String(body.product_service_name ?? '');
    }
    if (Object.prototype.hasOwnProperty.call(body, 'quantity')) {
      patch.quantity = Number(body.quantity);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'unit_price')) {
      patch.unit_price = Number(body.unit_price);
    }
    const newQuantity = Object.prototype.hasOwnProperty.call(patch, 'quantity') ? Number(patch.quantity) : Number(existing.quantity ?? 1);
    const newUnitPrice = Object.prototype.hasOwnProperty.call(patch, 'unit_price') ? Number(patch.unit_price) : Number(existing.unit_price ?? 0);
    patch.total = newQuantity * newUnitPrice;
    const { data, error } = await db.from('job_line_items').update(patch).eq('id', id).select('*').single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Line item not found' });
      return;
    }
    await recalculateJob(db, jobId);
    res.status(200).json({ line_item: data });
    return;
  }

  if (action === 'line_item.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const getRes = await db.from('job_line_items').select('job_id').eq('id', id).maybeSingle();
    if (getRes.error) {
      res.status(500).json({ error: getRes.error.message });
      return;
    }
    const jobId = getRes.data ? String(getRes.data.job_id ?? '') : '';
    const { error } = await db.from('job_line_items').delete().eq('id', id);
    if (await errTable(error)) return;
    if (jobId) {
      await recalculateJob(db, jobId);
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'visit.create') {
    const jobId = String(body.job_id ?? '');
    const scheduledAt = String(body.scheduled_at ?? '');
    if (!jobId || !scheduledAt) {
      res.status(400).json({ error: 'job_id and scheduled_at are required' });
      return;
    }
    const row = {
      job_id: jobId,
      scheduled_at: scheduledAt,
      assigned_to: body.assigned_to != null ? String(body.assigned_to) : null,
      status: 'Scheduled',
      notes: body.notes != null ? String(body.notes) : null,
      updated_at: NOW_ISO(),
    };
    const { data, error } = await db.from('job_visits').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ visit: data });
    return;
  }

  if (action === 'visit.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const patch: Record<string, unknown> = { updated_at: NOW_ISO() };
    for (const k of ['scheduled_at', 'assigned_to', 'status', 'notes'] as const) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        const v = body[k];
        patch[k] = v === null ? null : String(v);
      }
    }
    const { data, error } = await db.from('job_visits').update(patch).eq('id', id).select('*').single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Visit not found' });
      return;
    }
    res.status(200).json({ visit: data });
    return;
  }

  if (action === 'visit.complete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { data, error } = await db
      .from('job_visits')
      .update({ status: 'Completed', completed_at: NOW_ISO(), updated_at: NOW_ISO() })
      .eq('id', id)
      .select('*')
      .single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Visit not found' });
      return;
    }
    res.status(200).json({ visit: data });
    return;
  }

  if (action === 'expense.create') {
    const jobId = String(body.job_id ?? '');
    const description = String(body.description ?? '').trim();
    const amount = Number(body.amount ?? 0);
    if (!jobId || !description) {
      res.status(400).json({ error: 'job_id and description are required' });
      return;
    }
    const row = {
      job_id: jobId,
      description,
      amount,
      category: body.category != null ? String(body.category) : null,
      receipt_url: body.receipt_url != null ? String(body.receipt_url) : null,
      updated_at: NOW_ISO(),
    };
    const { data, error } = await db.from('job_expenses').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ expense: data });
    return;
  }

  if (action === 'expense.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db.from('job_expenses').delete().eq('id', id);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'time_entry.create') {
    const jobId = String(body.job_id ?? '');
    const startedAt = String(body.started_at ?? '');
    if (!jobId || !startedAt) {
      res.status(400).json({ error: 'job_id and started_at are required' });
      return;
    }
    let durationMinutes: number | null = null;
    if (body.ended_at != null && body.duration_minutes == null) {
      const startMs = new Date(startedAt).getTime();
      const endMs = new Date(String(body.ended_at)).getTime();
      durationMinutes = Math.round((endMs - startMs) / 60000);
    } else if (body.duration_minutes != null) {
      durationMinutes = Number(body.duration_minutes);
    }
    const row = {
      job_id: jobId,
      started_at: startedAt,
      ended_at: body.ended_at != null ? String(body.ended_at) : null,
      duration_minutes: durationMinutes,
      user_id: body.user_id != null ? String(body.user_id) : null,
      notes: body.notes != null ? String(body.notes) : null,
      updated_at: NOW_ISO(),
    };
    const { data, error } = await db.from('job_time_entries').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ time_entry: data });
    return;
  }

  if (action === 'time_entry.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db.from('job_time_entries').delete().eq('id', id);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ error: `Unknown action: ${action}` });
}
