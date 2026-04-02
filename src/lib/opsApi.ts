import { apiFetch } from './apiClient';

const OPS = '/api/ops';

async function readJson<T>(r: Response): Promise<T> {
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || r.statusText || 'Request failed');
  }
}

export type OpsAnnouncement = {
  id: string;
  title: string;
  body: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
};

export type OpsApproval = {
  id: string;
  resource_type: string;
  resource_id: string;
  title: string;
  detail: string | null;
  status: string;
  requested_by: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

export async function fetchAnnouncements(): Promise<OpsAnnouncement[]> {
  const r = await apiFetch(`${OPS}?resource=announcements`);
  if (r.status === 404 || r.status === 503) return [];
  if (!r.ok) return [];
  const data = await readJson<{ announcements: OpsAnnouncement[] }>(r);
  return data.announcements ?? [];
}

export async function fetchApprovals(status: string): Promise<OpsApproval[]> {
  const r = await apiFetch(`${OPS}?resource=approvals&status=${encodeURIComponent(status)}`);
  if (r.status === 404 || r.status === 503) return [];
  if (!r.ok) return [];
  const data = await readJson<{ approvals: OpsApproval[] }>(r);
  return data.approvals ?? [];
}

export async function opsPost<T>(body: Record<string, unknown>): Promise<T> {
  const r = await apiFetch(OPS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Ops ${r.status}`);
  }
  return readJson<T>(r);
}
