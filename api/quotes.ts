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

async function recalculateQuote(db: SupabaseClient, quoteId: string) {
  const { data: items } = await db.from('quote_line_items').select('total').eq('quote_id', quoteId);
  const subtotal = (items ?? []).reduce((sum, i) => sum + Number(i.total), 0);
  const { data: q } = await db.from('quotes').select('tax_rate').eq('id', quoteId).single();
  const taxRate = Number(q?.tax_rate ?? 0.05);
  const tax_amount = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax_amount) * 100) / 100;
  await db.from('quotes').update({ subtotal, tax_amount, total, updated_at: NOW_ISO() }).eq('id', quoteId);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = supabase();
  if (!db) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return;
  }

  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const action = String(req.query.action ?? '');

    if (action === 'list') {
      const { data, error } = await db.from('quotes').select('*').order('created_at', { ascending: false });
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
      const [quote, line_items, account, property] = await Promise.all([
        db.from('quotes').select('*').eq('id', id).maybeSingle(),
        db.from('quote_line_items').select('*').eq('quote_id', id).order('created_at', { ascending: true }),
        db.from('crm_accounts').select('id, name, company, phone, email').eq('id', '').maybeSingle(),
        db.from('crm_properties').select('*').eq('id', '').maybeSingle(),
      ]);
      if (quote.error) {
        res.status(500).json({ error: quote.error.message });
        return;
      }
      if (!quote.data) {
        res.status(404).json({ error: 'Quote not found' });
        return;
      }
      let accountData = null;
      let propertyData = null;
      if (quote.data.account_id) {
        const { data: acc } = await db
          .from('crm_accounts')
          .select('id, name, company, phone, email')
          .eq('id', quote.data.account_id as string)
          .maybeSingle();
        accountData = acc;
      }
      if (quote.data.property_id) {
        const { data: prop } = await db.from('crm_properties').select('*').eq('id', quote.data.property_id as string).maybeSingle();
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
      const { data, error } = await db.from('crm_properties').select('*').eq('account_id', account_id).order('created_at', { ascending: false });
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
    const { data, error } = await db.from('quotes').update(patch).eq('id', id).select('*').single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    if (Boolean(body.recalc)) {
      await recalculateQuote(db, id);
      const { data: updated } = await db.from('quotes').select('*').eq('id', id).single();
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
    const { error } = await db.from('quotes').delete().eq('id', id);
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
    await recalculateQuote(db, quote_id);
    const { data, error } = await db.from('quotes').select('*').eq('id', quote_id).single();
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
    const total = Math.round(quantity * unit_price * 100) / 100;
    const row = {
      quote_id,
      product_service_name,
      quantity,
      unit_price,
      total,
      updated_at: NOW_ISO(),
    };
    const { data, error } = await db.from('quote_line_items').insert(row).select('*').single();
    if (await errTable(error)) return;
    await recalculateQuote(db, quote_id);
    res.status(200).json({ line_item: data });
    return;
  }

  if (action === 'line_item.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { data: existing } = await db.from('quote_line_items').select('quote_id').eq('id', id).single();
    if (!existing) {
      res.status(404).json({ error: 'Line item not found' });
      return;
    }
    const patch: Record<string, unknown> = { updated_at: NOW_ISO() };
    const keys = ['product_service_name', 'quantity', 'unit_price'] as const;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        patch[k] = body[k];
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'quantity') || Object.prototype.hasOwnProperty.call(patch, 'unit_price')) {
      const q = Number(patch.quantity ?? existing.quantity);
      const up = Number(patch.unit_price ?? existing.unit_price);
      patch.total = Math.round(q * up * 100) / 100;
    }
    const { data, error } = await db.from('quote_line_items').update(patch).eq('id', id).select('*').single();
    if (await errTable(error)) return;
    await recalculateQuote(db, existing.quote_id as string);
    res.status(200).json({ line_item: data });
    return;
  }

  if (action === 'line_item.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { data: existing } = await db.from('quote_line_items').select('quote_id').eq('id', id).single();
    if (!existing) {
      res.status(404).json({ error: 'Line item not found' });
      return;
    }
    const { error } = await db.from('quote_line_items').delete().eq('id', id);
    if (await errTable(error)) return;
    await recalculateQuote(db, existing.quote_id as string);
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
    await db.from('quote_line_items').delete().eq('quote_id', quote_id);
    const toInsert = items.map((item: Record<string, unknown>) => ({
      quote_id,
      product_service_name: String(item.product_service_name ?? '').trim(),
      quantity: Number(item.quantity ?? 0),
      unit_price: Number(item.unit_price ?? 0),
      total: Math.round(Number(item.quantity ?? 0) * Number(item.unit_price ?? 0) * 100) / 100,
      updated_at: NOW_ISO(),
    }));
    const { data, error } = await db.from('quote_line_items').insert(toInsert).select('*');
    if (await errTable(error)) return;
    await recalculateQuote(db, quote_id);
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
    const { data, error } = await db.from('crm_properties').update(patch).eq('id', id).select('*').single();
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
    const { error } = await db.from('crm_properties').delete().eq('id', id);
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
    const { data, error } = await db.from('quotes').update({ status: 'Sent', sent_at: NOW_ISO(), updated_at: NOW_ISO() }).eq('id', id).select('*').single();
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
    const { data, error } = await db.from('quotes').update({ status: 'Approved', approved_at: NOW_ISO(), updated_at: NOW_ISO() }).eq('id', id).select('*').single();
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
    const { data, error } = await db.from('quotes').update({ status: 'Converted', converted_at: NOW_ISO(), updated_at: NOW_ISO() }).eq('id', id).select('*').single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    res.status(200).json({ quote: data });
    return;
  }

  res.status(400).json({ error: `Unknown action: ${action}` });
}
