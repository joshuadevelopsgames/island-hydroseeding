/**
 * Quote file / image attachments. Storage bucket: `quote-attachments` (private).
 * Same pattern as account-attachments; no payment card data — ever.
 *
 * GET  /api/quote-attachments?quoteId=...  → list + signed URLs
 * POST /api/quote-attachments            → upload (body: quoteId, fileName, fileType, fileBase64)
 * POST /api/quote-attachments?action=delete  body: { id }
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_auth';
import { resolveTenantId } from './_tenant';

export const config = {
  api: {
    bodyParser: { sizeLimit: '12mb' },
  },
};

const BUCKET = 'quote-attachments';
const SIGNED_URL_TTL_SECONDS = 3600;

function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
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

function decodeBase64File(input: string): Buffer | null {
  if (!input) return null;
  const comma = input.indexOf(',');
  const data = input.startsWith('data:') && comma >= 0 ? input.slice(comma + 1) : input;
  try {
    return Buffer.from(data, 'base64');
  } catch {
    return null;
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

type AttachmentRow = {
  id: string;
  quote_id: string;
  uploaded_by_user_id: string | null;
  uploaded_by_email: string | null;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  storage_path: string;
  attachment_kind: string;
  created_at: string;
};

async function withSignedUrl(
  db: SupabaseClient,
  rows: AttachmentRow[]
): Promise<Array<AttachmentRow & { signed_url: string | null }>> {
  return Promise.all(
    rows.map(async (row) => {
      const { data } = await db.storage
        .from(BUCKET)
        .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
      return { ...row, signed_url: data?.signedUrl ?? null };
    })
  );
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
    const quoteId = String(req.query.quoteId ?? '').trim();
    if (!quoteId) {
      res.status(400).json({ error: 'quoteId is required' });
      return;
    }
    const { data, error } = await db
      .from('quote_attachments')
      .select('*')
      .eq('quote_id', quoteId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    const rows = (data ?? []) as AttachmentRow[];
    const withUrls = await withSignedUrl(db, rows);
    res.status(200).json({ attachments: withUrls });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseBody(req);
  const action = String(req.query.action ?? body.action ?? '').trim();

  if (action === 'delete') {
    const id = String(body.id ?? '').trim();
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { data: existing, error: lookupErr } = await db
      .from('quote_attachments')
      .select('id, storage_path')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (lookupErr) {
      res.status(500).json({ error: lookupErr.message });
      return;
    }
    if (!existing) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }
    const { error: removeErr } = await db.storage.from(BUCKET).remove([existing.storage_path]);
    if (removeErr) {
      console.error('storage remove failed', removeErr);
    }
    const { error: dbErr } = await db
      .from('quote_attachments')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (dbErr) {
      res.status(500).json({ error: dbErr.message });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  const quoteId = String(body.quoteId ?? '').trim();
  const fileName = String(body.fileName ?? '').trim();
  const fileType = body.fileType != null ? String(body.fileType) : null;
  const fileBase64 = String(body.fileBase64 ?? '');
  const attachmentKind = body.attachmentKind != null ? String(body.attachmentKind) : 'file';

  if (!quoteId || !fileName || !fileBase64) {
    res.status(400).json({ error: 'quoteId, fileName, and fileBase64 are required' });
    return;
  }

  const buffer = decodeBase64File(fileBase64);
  if (!buffer || buffer.length === 0) {
    res.status(400).json({ error: 'fileBase64 could not be decoded' });
    return;
  }

  const { data: quote, error: quoteErr } = await db
    .from('quotes')
    .select('id')
    .eq('id', quoteId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (quoteErr) {
    res.status(500).json({ error: quoteErr.message });
    return;
  }
  if (!quote) {
    res.status(404).json({ error: 'Quote not found' });
    return;
  }

  const storagePath = `${quoteId}/${Date.now()}-${sanitizeFileName(fileName)}`;
  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: fileType ?? 'application/octet-stream',
      upsert: false,
    });
  if (uploadErr) {
    res.status(500).json({
      error: `Upload failed: ${uploadErr.message}. Create the "${BUCKET}" bucket in Supabase Storage if missing.`,
    });
    return;
  }

  const { data: row, error: insertErr } = await db
    .from('quote_attachments')
    .insert({
      tenant_id: tenantId,
      quote_id: quoteId,
      uploaded_by_user_id: auth.userId,
      uploaded_by_email: auth.email || null,
      file_name: fileName,
      file_size: buffer.length,
      file_type: fileType,
      storage_path: storagePath,
      attachment_kind: attachmentKind,
    })
    .select('*')
    .single();
  if (insertErr || !row) {
    await db.storage.from(BUCKET).remove([storagePath]);
    res.status(500).json({ error: insertErr?.message ?? 'Failed to record attachment' });
    return;
  }

  const [withUrl] = await withSignedUrl(db, [row as AttachmentRow]);
  res.status(200).json({ attachment: withUrl });
}
