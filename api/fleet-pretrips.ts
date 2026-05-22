/**
 * Vehicle pre-trip inspections — server-backed (replaces the old localStorage +
 * app_workspace blob path that clobbered records across field devices).
 *
 * GET  /api/fleet-pretrips              → list (newest first) with signed photo URLs
 * POST /api/fleet-pretrips              → create (body: action:'create' + fields + photos[] base64)
 * POST /api/fleet-pretrips?action=delete  body: { id }   → delete row + storage objects
 *
 * Photos are stored in the existing private `account-attachments` bucket under
 * the `pretrips/` path prefix (no new bucket needed); only object paths live in
 * the table. Signed URLs are minted on read (1h TTL).
 */
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_auth';
import { resolveTenantId } from './_tenant';

export const config = {
  api: {
    // Up to 12 compressed JPEGs (~1280px, q0.72) base64-encoded in one request.
    bodyParser: { sizeLimit: '25mb' },
  },
};

// Reuse the existing private bucket; pretrip photos live under the `pretrips/`
// prefix so they never collide with account attachments in the same bucket.
const BUCKET = 'account-attachments';
const PATH_PREFIX = 'pretrips';
const SIGNED_URL_TTL_SECONDS = 3600;
const MAX_PHOTOS = 12;
const VALID_TYPES = new Set(['Truck', 'Trailer']);
const VALID_STATUS = new Set(['Passed', 'Action Req']);

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

function decodeImage(input: string): { buffer: Buffer; contentType: string; ext: string } | null {
  if (!input) return null;
  let contentType = 'image/jpeg';
  let data = input;
  if (input.startsWith('data:')) {
    const comma = input.indexOf(',');
    if (comma < 0) return null;
    const header = input.slice(5, comma); // e.g. "image/jpeg;base64"
    const semi = header.indexOf(';');
    contentType = (semi >= 0 ? header.slice(0, semi) : header) || 'image/jpeg';
    data = input.slice(comma + 1);
  }
  if (!contentType.startsWith('image/')) return null;
  try {
    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0) return null;
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    return { buffer, contentType, ext };
  } catch {
    return null;
  }
}

type PretripRow = {
  id: string;
  type: string;
  inspected_at: string;
  employee_name: string;
  equipment_id: string;
  location: string;
  status: string;
  remarks: string;
  checklist: Record<string, unknown> | null;
  photo_paths: string[] | null;
  created_by_email: string | null;
  created_at: string;
};

async function signPaths(db: SupabaseClient, paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (!data) return [];
  return data.map((d) => d.signedUrl).filter((u): u is string => Boolean(u));
}

async function mapOut(db: SupabaseClient, row: PretripRow) {
  const paths = Array.isArray(row.photo_paths) ? row.photo_paths : [];
  const photoUrls = await signPaths(db, paths);
  return {
    id: row.id,
    type: row.type,
    date: row.inspected_at,
    employeeName: row.employee_name,
    equipmentId: row.equipment_id,
    location: row.location,
    status: row.status,
    remarks: row.remarks,
    checklist: row.checklist ?? {},
    photoUrls,
    photoCount: paths.length,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
  };
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
    const { data, error } = await db
      .from('fleet_pretrips')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('inspected_at', { ascending: false });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    const rows = (data ?? []) as PretripRow[];
    const pretrips = await Promise.all(rows.map((row) => mapOut(db, row)));
    res.status(200).json({ pretrips });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseBody(req);
  const action = String(req.query.action ?? body.action ?? 'create').trim();

  if (action === 'delete') {
    const id = String(body.id ?? '').trim();
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { data: existing, error: lookupErr } = await db
      .from('fleet_pretrips')
      .select('id, photo_paths')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (lookupErr) {
      res.status(500).json({ error: lookupErr.message });
      return;
    }
    if (!existing) {
      res.status(404).json({ error: 'Inspection not found' });
      return;
    }
    const paths = Array.isArray((existing as { photo_paths?: string[] }).photo_paths)
      ? (existing as { photo_paths: string[] }).photo_paths
      : [];
    if (paths.length) {
      const { error: rmErr } = await db.storage.from(BUCKET).remove(paths);
      if (rmErr) console.error('pretrip photo remove failed', rmErr);
    }
    const { error: delErr } = await db.from('fleet_pretrips').delete().eq('id', id).eq('tenant_id', tenantId);
    if (delErr) {
      res.status(500).json({ error: delErr.message });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (action !== 'create') {
    res.status(400).json({ error: 'Unknown action; use create or delete' });
    return;
  }

  // ── create ──────────────────────────────────────────────────────────────
  const typeRaw = String(body.type ?? 'Truck');
  const type = VALID_TYPES.has(typeRaw) ? typeRaw : 'Truck';
  const statusRaw = String(body.status ?? 'Passed');
  const status = VALID_STATUS.has(statusRaw) ? statusRaw : 'Passed';
  const dateRaw = body.date != null ? String(body.date) : '';
  const inspectedAt = Number.isFinite(Date.parse(dateRaw)) ? new Date(dateRaw).toISOString() : new Date().toISOString();
  const employeeName = String(body.employeeName ?? '').slice(0, 200);
  const equipmentId = String(body.equipmentId ?? '').slice(0, 200);
  const location = String(body.location ?? '').slice(0, 300);
  const remarks = String(body.remarks ?? '').slice(0, 4000);
  const checklist =
    body.checklist && typeof body.checklist === 'object' && !Array.isArray(body.checklist)
      ? (body.checklist as Record<string, unknown>)
      : {};
  const photosIn = Array.isArray(body.photos) ? (body.photos as unknown[]).slice(0, MAX_PHOTOS) : [];

  // Decode all photos up front so a bad payload fails before any upload.
  const decoded: { buffer: Buffer; contentType: string; ext: string }[] = [];
  for (const p of photosIn) {
    if (typeof p !== 'string') continue;
    const img = decodeImage(p);
    if (!img) {
      res.status(400).json({ error: 'One or more photos could not be decoded' });
      return;
    }
    decoded.push(img);
  }

  const folder = randomUUID();
  const uploadedPaths: string[] = [];
  for (let i = 0; i < decoded.length; i++) {
    const img = decoded[i];
    const path = `${PATH_PREFIX}/${tenantId}/${folder}/${i}-${randomUUID()}.${img.ext}`;
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, img.buffer, {
      contentType: img.contentType,
      upsert: false,
    });
    if (upErr) {
      if (uploadedPaths.length) await db.storage.from(BUCKET).remove(uploadedPaths);
      res.status(500).json({ error: `Photo upload failed: ${upErr.message}` });
      return;
    }
    uploadedPaths.push(path);
  }

  const { data: row, error: insErr } = await db
    .from('fleet_pretrips')
    .insert({
      tenant_id: tenantId,
      type,
      inspected_at: inspectedAt,
      employee_name: employeeName,
      equipment_id: equipmentId,
      location,
      status,
      remarks,
      checklist,
      photo_paths: uploadedPaths,
      created_by_user_id: auth.userId,
      created_by_email: auth.email || null,
    })
    .select('*')
    .single();
  if (insErr || !row) {
    if (uploadedPaths.length) await db.storage.from(BUCKET).remove(uploadedPaths);
    res.status(500).json({ error: insErr?.message ?? 'Failed to save inspection' });
    return;
  }

  const pretrip = await mapOut(db, row as PretripRow);
  res.status(200).json({ pretrip });
}
