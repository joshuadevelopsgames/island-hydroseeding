import type { WorkRequest } from '@/lib/requestsTypes';
import { apiFetch } from './apiClient';

const REQUESTS = '/api/requests';

/** Avoid throwing huge HTML bodies or tokens as Error.message (breaks UI layout). */
function messageFromUnparsedBody(text: string, statusText: string): string {
  const t = text.trim();
  if (!t) return statusText || 'Request failed';
  if (t.startsWith('<') && t.includes('>')) return 'Server returned HTML instead of JSON.';
  if (t.length > 400) return 'Unexpected response from the server.';
  return t.length > 200 ? `${t.slice(0, 200)}…` : t;
}

export function formatErrorForUi(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.length <= 320) return raw;
  return `${raw.slice(0, 280)}…`;
}

async function readJson<T>(r: Response): Promise<T> {
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(messageFromUnparsedBody(text, r.statusText));
  }
}

export async function fetchRequests(): Promise<WorkRequest[]> {
  const r = await apiFetch(`${REQUESTS}?action=list`);
  if (r.status === 404 || r.status === 503) return [];
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Requests ${r.status}`);
  }
  const data = await readJson<{ requests: WorkRequest[] }>(r);
  return data.requests ?? [];
}

export async function fetchRequestDetail(id: string): Promise<{ request: WorkRequest }> {
  const r = await apiFetch(`${REQUESTS}?action=get&id=${encodeURIComponent(id)}`);
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Request ${r.status}`);
  }
  return readJson(r);
}

export async function requestsPost<T>(body: Record<string, unknown>): Promise<T> {
  const r = await apiFetch(REQUESTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Requests ${r.status}`);
  }
  return readJson<T>(r);
}
