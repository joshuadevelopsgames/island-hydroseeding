import type {
  CrmAccount,
  CrmContact,
  CrmInteraction,
  CrmResearchNote,
  LegacyLead,
} from '@/lib/crmTypes';
import { apiFetch } from './apiClient';

const CRM = '/api/crm';

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

export async function fetchCrmAccounts(): Promise<CrmAccount[]> {
  const r = await apiFetch(`${CRM}?action=accounts`);
  if (r.status === 404 || r.status === 503) return [];
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `CRM ${r.status}`);
  }
  const data = await readJson<{ accounts: CrmAccount[] }>(r);
  return data.accounts ?? [];
}

export async function fetchCrmAccountBundle(accountId: string): Promise<{
  account: CrmAccount;
  contacts: CrmContact[];
  interactions: CrmInteraction[];
  research_notes: CrmResearchNote[];
}> {
  const r = await apiFetch(`${CRM}?action=account&id=${encodeURIComponent(accountId)}`);
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `CRM ${r.status}`);
  }
  return readJson(r);
}

export async function crmPost<T>(body: Record<string, unknown>): Promise<T> {
  const r = await apiFetch(CRM, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `CRM ${r.status}`);
  }
  return readJson<T>(r);
}

export function importLegacyLeads(leads: LegacyLead[]) {
  return crmPost<{ imported_account_ids: string[]; count: number }>({
    action: 'import_legacy_leads',
    leads,
  });
}

export function importAccountsCsvRows(rows: Record<string, unknown>[]) {
  return crmPost<{ imported: number }>({ action: 'import_accounts_csv', rows });
}
