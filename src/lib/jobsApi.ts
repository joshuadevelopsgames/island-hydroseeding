import type { Job, JobBundle } from '@/lib/jobsTypes';

const JOBS = '/api/jobs';

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

export async function fetchJobs(): Promise<Job[]> {
  const r = await fetch(`${JOBS}?action=list`, { cache: 'no-store' });
  if (r.status === 404 || r.status === 503) return [];
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Jobs ${r.status}`);
  }
  const data = await readJson<{ jobs: Job[] }>(r);
  return data.jobs ?? [];
}

export async function fetchJobBundle(jobId: string): Promise<JobBundle> {
  const r = await fetch(`${JOBS}?action=get&id=${encodeURIComponent(jobId)}`, { cache: 'no-store' });
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Job ${r.status}`);
  }
  return readJson(r);
}

export async function jobsPost<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch(JOBS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Jobs ${r.status}`);
  }
  return readJson<T>(r);
}
