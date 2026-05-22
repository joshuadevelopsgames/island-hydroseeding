/**
 * Authenticated /api/fleet-pretrips calls. Pre-trip inspections are stored
 * server-side (Supabase) — not localStorage — so submissions from multiple
 * field devices can no longer clobber each other.
 */
import { apiFetch } from './apiClient';

export type PretripType = 'Truck' | 'Trailer';
export type PretripStatus = 'Passed' | 'Action Req';

export type Pretrip = {
  id: string;
  type: PretripType;
  /** Inspection timestamp (ISO). */
  date: string;
  employeeName: string;
  equipmentId: string;
  location: string;
  status: PretripStatus;
  remarks: string;
  checklist: Record<string, string>;
  /** Short-lived signed URLs for the inspection photos. */
  photoUrls: string[];
  photoCount: number;
  createdByEmail?: string | null;
  createdAt?: string;
};

export type NewPretripInput = {
  type: PretripType;
  date: string;
  employeeName: string;
  equipmentId: string;
  location: string;
  status: PretripStatus;
  remarks: string;
  checklist: Record<string, string>;
  /** Compressed JPEG data URLs; uploaded to Storage server-side. */
  photos: string[];
};

async function readJson<T>(r: Response): Promise<T> {
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.slice(0, 200) || r.statusText);
  }
}

async function errorFrom(r: Response, fallback: string): Promise<Error> {
  const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
  return new Error(j.error || fallback);
}

export async function fetchPretrips(): Promise<Pretrip[]> {
  const r = await apiFetch('/api/fleet-pretrips', { cache: 'no-store' });
  if (r.status === 404 || r.status === 503) return [];
  if (!r.ok) throw await errorFrom(r, `Pre-trips ${r.status}`);
  const j = await readJson<{ pretrips: Pretrip[] }>(r);
  return Array.isArray(j.pretrips) ? j.pretrips : [];
}

export async function createPretrip(input: NewPretripInput): Promise<Pretrip> {
  const r = await apiFetch('/api/fleet-pretrips', {
    method: 'POST',
    body: JSON.stringify({ action: 'create', ...input }),
  });
  if (!r.ok) throw await errorFrom(r, `Save failed (${r.status})`);
  const j = await readJson<{ pretrip: Pretrip }>(r);
  return j.pretrip;
}

export async function deletePretrip(id: string): Promise<void> {
  const r = await apiFetch('/api/fleet-pretrips?action=delete', {
    method: 'POST',
    body: JSON.stringify({ action: 'delete', id }),
  });
  if (!r.ok) throw await errorFrom(r, `Delete failed (${r.status})`);
}
