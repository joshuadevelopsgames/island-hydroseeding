import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function db() {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = db();
  if (!supabase) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return;
  }
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const want = String(req.query.resource ?? 'announcements');
    if (want === 'announcements') {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('ops_announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      const rows = (data ?? []).filter((r) => {
        const s = r.starts_at as string | null;
        const e = r.ends_at as string | null;
        if (s && s > nowIso) return false;
        if (e && e < nowIso) return false;
        return true;
      });
      res.status(200).json({ announcements: rows });
      return;
    }
    if (want === 'approvals') {
      const status = String(req.query.status ?? 'pending');
      const { data, error } = await supabase
        .from('ops_approval_requests')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ approvals: data ?? [] });
      return;
    }
    res.status(400).json({ error: 'Invalid resource' });
    return;
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const action = String(body.action ?? '');
    if (action === 'announcement.create') {
      const title = String(body.title ?? '').trim();
      const annBody = String(body.body ?? '').trim();
      if (!title || !annBody) {
        res.status(400).json({ error: 'title and body required' });
        return;
      }
      const row = {
        title,
        body: annBody,
        starts_at: body.starts_at != null ? String(body.starts_at) : null,
        ends_at: body.ends_at != null ? String(body.ends_at) : null,
        is_active: body.is_active !== false,
      };
      const { data, error } = await supabase.from('ops_announcements').insert(row).select('*').single();
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ announcement: data });
      return;
    }
    if (action === 'approval.create') {
      const resource_type = String(body.resource_type ?? '').trim();
      const resource_id = String(body.resource_id ?? '').trim();
      const title = String(body.title ?? '').trim();
      if (!resource_type || !resource_id || !title) {
        res.status(400).json({ error: 'resource_type, resource_id, title required' });
        return;
      }
      const row = {
        resource_type,
        resource_id,
        title,
        detail: body.detail != null ? String(body.detail) : null,
        status: 'pending',
        requested_by: body.requested_by != null ? String(body.requested_by) : null,
      };
      const { data, error } = await supabase.from('ops_approval_requests').insert(row).select('*').single();
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ approval: data });
      return;
    }
    if (action === 'approval.resolve') {
      const id = String(body.id ?? '');
      const status = String(body.status ?? '');
      const resolved_by = String(body.resolved_by ?? '');
      if (!id || (status !== 'approved' && status !== 'rejected') || !resolved_by) {
        res.status(400).json({ error: 'id, status (approved|rejected), resolved_by required' });
        return;
      }
      const { data, error } = await supabase
        .from('ops_approval_requests')
        .update({ status, resolved_by, resolved_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      if (!data) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(200).json({ approval: data });
      return;
    }
    res.status(400).json({ error: 'Unknown action' });
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method not allowed' });
}
