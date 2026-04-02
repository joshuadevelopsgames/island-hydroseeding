import type { Invoice, InvoiceBundle } from '@/lib/invoicesTypes';
import { apiFetch } from './apiClient';

const INVOICES = '/api/invoices';

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

export async function fetchInvoices(): Promise<Invoice[]> {
  const r = await apiFetch(`${INVOICES}?action=list`);
  if (r.status === 404 || r.status === 503) return [];
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Invoices ${r.status}`);
  }
  const data = await readJson<{ invoices: Invoice[] }>(r);
  return data.invoices ?? [];
}

export async function fetchInvoiceBundle(invoiceId: string): Promise<InvoiceBundle> {
  const r = await apiFetch(`${INVOICES}?action=get&id=${encodeURIComponent(invoiceId)}`);
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Invoice ${r.status}`);
  }
  return readJson(r);
}

export async function invoicesPost<T>(body: Record<string, unknown>): Promise<T> {
  const r = await apiFetch(INVOICES, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Invoices ${r.status}`);
  }
  return readJson<T>(r);
}
