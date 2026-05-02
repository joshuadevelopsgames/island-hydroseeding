import type { SupabaseClient } from '@supabase/supabase-js';

type CommKind = 'email' | 'sms' | 'call';

export async function insertCommLog(
  db: SupabaseClient,
  row: {
    tenant_id: string;
    account_id: string | null;
    kind: CommKind;
    direction?: string;
    subject?: string | null;
    body?: string | null;
    sent_by?: string | null;
    related_entity_type?: string | null;
    related_entity_id?: string | null;
    status?: string | null;
  }
): Promise<void> {
  const { error } = await db.from('comm_log').insert({
    tenant_id: row.tenant_id,
    account_id: row.account_id,
    kind: row.kind,
    direction: row.direction ?? 'outbound',
    subject: row.subject ?? null,
    body: row.body ?? null,
    sent_by: row.sent_by ?? null,
    sent_at: new Date().toISOString(),
    related_entity_type: row.related_entity_type ?? null,
    related_entity_id: row.related_entity_id ?? null,
    status: row.status ?? null,
  });
  if (error) {
    console.warn('[comm_log]', error.message);
  }
}
