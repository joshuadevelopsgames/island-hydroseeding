/**
 * Per-account file attachments. Backed by the `account-attachments` Supabase
 * Storage bucket (private) plus the `crm_account_attachments` metadata table.
 *
 * Endpoints:
 *   GET  /api/account-attachments?accountId=...     → list, with fresh signed URLs
 *   POST /api/account-attachments                   → upload
 *        body: { accountId, fileName, fileType, fileBase64 }   (max 10 MB)
 *   POST /api/account-attachments?action=delete     → delete by id
 *        body: { id }
 *
 * Files are uploaded as base64 in the JSON body to keep the API surface small.
 * The handler decodes to a Buffer, writes to Storage, and returns a row with a
 * 1-hour signed URL the browser can use directly.
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

const BUCKET = 'account-attachments';
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
  account_id: string;
  uploaded_by_user_id: string | null;
  uploaded_by_email: string | null;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  storage_path: string;
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

  // ── List ────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const accountId = String(req.query.accountId ?? '').trim();
    if (!accountId) {
      res.status(400).json({ error: 'accountId is required' });
      return;
    }
    const { data, error } = await db
      .from('crm_account_attachments')
      .select('*')
      .eq('account_id', accountId)
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

  // ── Delete ──────────────────────────────────────────────────────────────
  if (action === 'delete') {
    const id = String(body.id ?? '').trim();
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { data: existing, error: lookupErr } = await db
      .from('crm_account_attachments')
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
      // Log and continue — the row should still be deleted so the UI stays consistent.
      console.error('storage remove failed', removeErr);
    }
    const { error: dbErr } = await db
      .from('crm_account_attachments')
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

  // ── Upload ──────────────────────────────────────────────────────────────
  const accountId = String(body.accountId ?? '').trim();
  const fileName = String(body.fileName ?? '').trim();
  const fileType = body.fileType != null ? String(body.fileType) : null;
  const fileBase64 = String(body.fileBase64 ?? '');

  if (!accountId || !fileName || !fileBase64) {
    res.status(400).json({ error: 'accountId, fileName, and fileBase64 are required' });
    return;
  }

  const buffer = decodeBase64File(fileBase64);
  if (!buffer || buffer.length === 0) {
    res.status(400).json({ error: 'fileBase64 could not be decoded' });
    return;
  }

  // Verify the account exists so we don't write orphan files into Storage.
  const { data: account, error: accountErr } = await db
    .from('crm_accounts')
    .select('id')
    .eq('id', accountId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (accountErr) {
    res.status(500).json({ error: accountErr.message });
    return;
  }
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const storagePath = `${accountId}/${Date.now()}-${sanitizeFileName(fileName)}`;
  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: fileType ?? 'application/octet-stream',
      upsert: false,
    });
  if (uploadErr) {
    res.status(500).json({
      error: `Upload failed: ${uploadErr.message}. Make sure the "${BUCKET}" bucket exists in Supabase Storage.`,
    });
    return;
  }

  const { data: row, error: insertErr } = await db
    .from('crm_account_attachments')
    .insert({
      tenant_id: tenantId,
      account_id: accountId,
      uploaded_by_user_id: auth.userId,
      uploaded_by_email: auth.email || null,
      file_name: fileName,
      file_size: buffer.length,
      file_type: fileType,
      storage_path: storagePath,
    })
    .select('*')
    .single();
  if (insertErr || !row) {
    // Clean up the orphaned storage object so we don't leak.
    await db.storage.from(BUCKET).remove([storagePath]);
    res.status(500).json({ error: insertErr?.message ?? 'Failed to record attachment' });
    return;
  }

  const [withUrl] = await withSignedUrl(db, [row as AttachmentRow]);
  res.status(200).json({ attachment: withUrl });
}
