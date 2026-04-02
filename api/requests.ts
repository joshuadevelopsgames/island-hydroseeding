import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
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
      const { data, error } = await db.from('requests').select('*').order('requested_at', { ascending: false });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ requests: data ?? [] });
      return;
    }
    if (action === 'get') {
      const id = String(req.query.id ?? '');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const { data, error } = await db.from('requests').select('*').eq('id', id).maybeSingle();
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      if (!data) {
        res.status(404).json({ error: 'Request not found' });
        return;
      }
      res.status(200).json({ request: data });
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

  if (action === 'request.create') {
    const row = {
      account_id: body.account_id != null ? String(body.account_id) : null,
      property_id: body.property_id != null ? String(body.property_id) : null,
      title: body.title != null ? String(body.title) : null,
      description: body.description != null ? String(body.description) : null,
      status: String(body.status ?? 'New'),
      source: String(body.source ?? 'phone'),
      assigned_to: body.assigned_to != null ? String(body.assigned_to) : null,
      contact_name: body.contact_name != null ? String(body.contact_name).trim() || null : null,
      contact_phone: body.contact_phone != null ? String(body.contact_phone).trim() || null : null,
      contact_email: body.contact_email != null ? String(body.contact_email).trim() || null : null,
      notes: body.notes != null ? String(body.notes) : null,
      requested_at: NOW_ISO(),
    };
    const { data, error } = await db.from('requests').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ request: data });
    return;
  }

  if (action === 'request.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const patch: Record<string, unknown> = {};
    const keys = ['account_id', 'property_id', 'title', 'description', 'status', 'source', 'assigned_to', 'contact_name', 'contact_phone', 'contact_email', 'notes'] as const;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        const v = body[k];
        if (v === null) patch[k] = null;
        else if (typeof v === 'string') patch[k] = v;
      }
    }
    const { data, error } = await db.from('requests').update(patch).eq('id', id).select('*').single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    res.status(200).json({ request: data });
    return;
  }

  if (action === 'request.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db.from('requests').delete().eq('id', id);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'request.convert_to_quote') {
    const requestId = String(body.id ?? '');
    if (!requestId) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    // Fetch the request
    const { data: request, error: fetchError } = await db.from('requests').select('*').eq('id', requestId).maybeSingle();
    if (await errTable(fetchError)) return;
    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    // Create a new quote
    const approvalToken = randomUUID();
    const quoteRow = {
      account_id: request.account_id || null,
      property_id: request.property_id || null,
      title: request.title || 'New Quote',
      status: 'Draft',
      approval_token: approvalToken,
      created_at: NOW_ISO(),
    };
    const { data: quote, error: createError } = await db.from('quotes').insert(quoteRow).select('*').single();
    if (await errTable(createError)) return;

    // Update the request
    const updatePatch = {
      status: 'Converted',
      converted_at: NOW_ISO(),
      converted_quote_id: quote.id,
    };
    const { error: updateError } = await db.from('requests').update(updatePatch).eq('id', requestId);
    if (await errTable(updateError)) return;

    res.status(200).json({ quote, request: { ...request, ...updatePatch } });
    return;
  }

  res.status(400).json({ error: `Unknown action: ${action}` });
}
