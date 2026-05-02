import { apiFetch } from './apiClient';

const REPORTS = '/api/reports';

async function readJson<T>(r: Response): Promise<T> {
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(r.statusText || 'Request failed');
  }
}

export type WorkflowSnapshot = {
  requests: Record<string, number>;
  quotes: Record<string, number>;
  jobs: Record<string, number>;
  invoices: Record<string, number>;
  overdue_invoices: number;
  quotes_conversion_30d: { pool: number; converted: number; rate: number };
  quotes_conversion_90d: { pool: number; converted: number; rate: number };
  quotes_conversion_ytd: { pool: number; converted: number; rate: number };
};

export async function fetchWorkflowSnapshot(): Promise<WorkflowSnapshot> {
  const r = await apiFetch(`${REPORTS}?action=workflow_snapshot`);
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Reports ${r.status}`);
  }
  return readJson(r);
}

export async function fetchReportJson<T>(action: string, params?: Record<string, string>): Promise<T> {
  const q = new URLSearchParams({ action, ...(params ?? {}) });
  const r = await apiFetch(`${REPORTS}?${q.toString()}`);
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Reports ${r.status}`);
  }
  return readJson<T>(r);
}

