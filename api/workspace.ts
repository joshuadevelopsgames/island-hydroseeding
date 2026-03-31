import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const WORKSPACE_ID = 'default';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return;
  }

  const supabase = createClient(url, key);

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('app_workspace')
      .select('payload, updated_at')
      .eq('id', WORKSPACE_ID)
      .maybeSingle();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(200).json({ payload: {}, updated_at: null });
      return;
    }
    res.status(200).json({ payload: data.payload ?? {}, updated_at: data.updated_at });
    return;
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const payload = body?.payload;
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'Missing payload' });
      return;
    }

    const updated_at = new Date().toISOString();
    const { error } = await supabase.from('app_workspace').upsert(
      { id: WORKSPACE_ID, payload, updated_at },
      { onConflict: 'id' }
    );
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ ok: true, updated_at });
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method not allowed' });
}
