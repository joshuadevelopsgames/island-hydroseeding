/**
 * Tenant-scoped business branding for client-facing invoices/quotes and PDFs.
 *
 * GET  — safe public fields for the authenticated workspace
 * POST { display_name?, public_tagline?, public_brand_logo_url?, public_etransfer_email?, public_gst_registration?, public_footer_note? }
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_auth';
import { resolveTenantId } from './_tenant';

function getDb() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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

const SELECT_FIELDS =
  'id, slug, display_name, public_tagline, public_brand_logo_url, public_etransfer_email, public_gst_registration, public_footer_note';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getDb();

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const tenantId = resolveTenantId();

  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const { data, error } = await db.from('tenants').select(SELECT_FIELDS).eq('id', tenantId).single();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ tenant: data });
    return;
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const patch: Record<string, unknown> = {};
    const keys = [
      'display_name',
      'public_tagline',
      'public_brand_logo_url',
      'public_etransfer_email',
      'public_gst_registration',
      'public_footer_note',
    ] as const;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        const v = body[k];
        if (v === null || v === '') patch[k] = null;
        else patch[k] = String(v).trim() || null;
      }
    }
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const { data, error } = await db.from('tenants').update(patch).eq('id', tenantId).select(SELECT_FIELDS).single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ tenant: data });
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method not allowed' });
}
