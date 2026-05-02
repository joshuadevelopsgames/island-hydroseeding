import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_auth';
import { resolveTenantId } from './_tenant';

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

/** Drop duplicate catalog rows (same id or same display name); preserves first row in sort order. */
function dedupeCatalogList<T extends { id: string; name: string }>(rows: T[]): T[] {
  const seenId = new Set<string>();
  const seenName = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seenId.has(r.id)) continue;
    seenId.add(r.id);
    const nk = r.name.trim().toLowerCase();
    if (seenName.has(nk)) continue;
    seenName.add(nk);
    out.push(r);
  }
  return out;
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
        .from('products_services')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ products: dedupeCatalogList(data ?? []) });
      return;
    }

    if (action === 'templates') {
      const { data, error } = await db
        .from('quote_templates')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ templates: data ?? [] });
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

  if (action === 'product.create') {
    const name = String(body.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const row = {
      tenant_id: tenantId,
      name,
      description: body.description != null ? String(body.description) : null,
      default_unit_price: body.default_unit_price != null ? Number(body.default_unit_price) : null,
      unit_label: body.unit_label != null ? String(body.unit_label) : null,
      category: body.category != null ? String(body.category) : null,
      is_active: true,
      updated_at: NOW_ISO(),
    };
    const { data, error } = await db.from('products_services').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ product: data });
    return;
  }

  if (action === 'product.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const patch: Record<string, unknown> = { updated_at: NOW_ISO() };
    const keys = ['name', 'description', 'default_unit_price', 'unit_label', 'category'] as const;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        const v = body[k];
        patch[k] = v;
      }
    }
    const { data, error } = await db
      .from('products_services')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.status(200).json({ product: data });
    return;
  }

  if (action === 'product.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db
      .from('products_services')
      .update({ is_active: false, updated_at: NOW_ISO() })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'template.create') {
    const name = String(body.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const row = {
      tenant_id: tenantId,
      name,
      introduction_text: body.introduction_text != null ? String(body.introduction_text) : null,
      contract_text: body.contract_text != null ? String(body.contract_text) : null,
      line_items_json: body.line_items_json != null ? body.line_items_json : null,
      updated_at: NOW_ISO(),
    };
    const { data, error } = await db.from('quote_templates').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ template: data });
    return;
  }

  if (action === 'template.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const patch: Record<string, unknown> = { updated_at: NOW_ISO() };
    const keys = ['name', 'introduction_text', 'contract_text', 'line_items_json'] as const;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        const v = body[k];
        patch[k] = v;
      }
    }
    const { data, error } = await db
      .from('quote_templates')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.status(200).json({ template: data });
    return;
  }

  if (action === 'template.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db.from('quote_templates').delete().eq('id', id).eq('tenant_id', tenantId);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ error: `Unknown action: ${action}` });
}
