import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_auth';
import { resolveTenantId } from './_tenant';

function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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

const NOW_ISO = () => new Date().toISOString();

const CONTACT_TIERS = ['primary', 'secondary', 'tertiary', 'other'] as const;
type ContactTier = (typeof CONTACT_TIERS)[number];

function normalizeContactTier(raw: unknown, isPrimaryHint?: unknown): ContactTier {
  if (typeof raw === 'string') {
    const t = raw.toLowerCase();
    if ((CONTACT_TIERS as readonly string[]).includes(t)) return t as ContactTier;
  }
  return isPrimaryHint ? 'primary' : 'other';
}

/** Adds lifetime_value, current_balance, lead_source_name to each account (Phase 2). */
async function enrichAccounts(
  db: SupabaseClient,
  tenantId: string,
  accounts: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (accounts.length === 0) return [];
  const ids = accounts.map((a) => String(a.id));
  const [invRes, lsRes] = await Promise.all([
    db.from('invoices').select('account_id, amount_paid, balance_due').eq('tenant_id', tenantId).in('account_id', ids),
    db.from('crm_lead_sources').select('id, name').eq('tenant_id', tenantId),
  ]);
  const invoices = (invRes.data ?? []) as { account_id: string | null; amount_paid: unknown; balance_due: unknown }[];
  const lv = new Map<string, number>();
  const bal = new Map<string, number>();
  for (const inv of invoices) {
    if (!inv.account_id) continue;
    const id = inv.account_id;
    lv.set(id, (lv.get(id) ?? 0) + Number(inv.amount_paid ?? 0));
    bal.set(id, (bal.get(id) ?? 0) + Number(inv.balance_due ?? 0));
  }
  const lsName = new Map((lsRes.data ?? []).map((x: { id: string; name: string }) => [x.id, x.name]));
  return accounts.map((a) => {
    const id = String(a.id);
    const lsid = a.lead_source_id != null ? String(a.lead_source_id) : null;
    return {
      ...a,
      lifetime_value: lv.get(id) ?? 0,
      current_balance: bal.get(id) ?? 0,
      lead_source_name: lsid ? lsName.get(lsid) ?? null : null,
    };
  });
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
    const action = String(req.query.action ?? '');
    if (action === 'accounts') {
      const { data, error } = await db
        .from('crm_accounts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      const rows = (data ?? []) as Record<string, unknown>[];
      const enriched = await enrichAccounts(db, tenantId, rows);
      res.status(200).json({ accounts: enriched });
      return;
    }
    if (action === 'lead_sources') {
      const { data, error } = await db
        .from('crm_lead_sources')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ lead_sources: data ?? [] });
      return;
    }
    if (action === 'comm_log') {
      const accountId = String(req.query.account_id ?? '').trim();
      let q = db.from('comm_log').select('*').eq('tenant_id', tenantId).order('sent_at', { ascending: false }).limit(500);
      if (accountId) q = q.eq('account_id', accountId);
      const { data, error } = await q;
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ comm_log: data ?? [] });
      return;
    }
    if (action === 'account') {
      const id = String(req.query.id ?? '');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const [acc, contacts, properties, interactions, research_notes, comm_log] = await Promise.all([
        db.from('crm_accounts').select('*').eq('id', id).eq('tenant_id', tenantId).maybeSingle(),
        db
          .from('crm_contacts')
          .select('*')
          .eq('account_id', id)
          .eq('tenant_id', tenantId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        db
          .from('crm_properties')
          .select('*')
          .eq('account_id', id)
          .eq('tenant_id', tenantId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true }),
        db.from('crm_interactions').select('*').eq('account_id', id).eq('tenant_id', tenantId).order('occurred_at', { ascending: false }),
        db.from('crm_research_notes').select('*').eq('account_id', id).eq('tenant_id', tenantId).order('created_at', { ascending: false }),
        db.from('comm_log').select('*').eq('account_id', id).eq('tenant_id', tenantId).order('sent_at', { ascending: false }).limit(200),
      ]);
      if (acc.error) {
        res.status(500).json({ error: acc.error.message });
        return;
      }
      if (!acc.data) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }
      const commLogRows = comm_log.error ? [] : comm_log.data ?? [];
      const [acctEnriched] = await enrichAccounts(db, tenantId, [acc.data as Record<string, unknown>]);
      res.status(200).json({
        account: acctEnriched,
        contacts: contacts.data ?? [],
        properties: properties.data ?? [],
        interactions: interactions.data ?? [],
        research_notes: research_notes.data ?? [],
        comm_log: commLogRows,
      });
      return;
    }
    res.status(400).json({
      error:
        'Invalid GET: use action=accounts, lead_sources, comm_log, or action=account&id=',
    });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseBody(req);
  const action = String(body.action ?? '');

  const errTable = async (e: { message: string } | null) => {
    if (e) {
      res.status(500).json({ error: e.message });
      return true;
    }
    return false;
  };

  if (action === 'account.create') {
    const row = {
      tenant_id: tenantId,
      name: String(body.name ?? '').trim(),
      company: body.company != null ? String(body.company).trim() || null : null,
      account_type: String(body.account_type ?? 'Residential'),
      status: String(body.status ?? 'New Lead'),
      marketing_source: body.marketing_source != null ? String(body.marketing_source) : null,
      phone: body.phone != null ? String(body.phone).trim() || null : null,
      email: body.email != null ? String(body.email).trim() || null : null,
      address: body.address != null ? String(body.address).trim() || null : null,
      notes: body.notes != null ? String(body.notes) : null,
      updated_at: NOW_ISO(),
    };
    if (!row.name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const { data, error } = await db.from('crm_accounts').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ account: data });
    return;
  }

  if (action === 'account.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const patch: Record<string, unknown> = { updated_at: NOW_ISO() };
    const keys = [
      'name',
      'company',
      'account_type',
      'status',
      'marketing_source',
      'phone',
      'email',
      'address',
      'notes',
      'lead_source_id',
      'stripe_customer_id',
    ] as const;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        const v = body[k];
        if (v === null) patch[k] = null;
        else if (typeof v === 'string') patch[k] = v;
      }
    }
    const { data, error } = await db
      .from('crm_accounts')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    res.status(200).json({ account: data });
    return;
  }

  if (action === 'account.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db.from('crm_accounts').delete().eq('id', id).eq('tenant_id', tenantId);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'contact.create') {
    const account_id = String(body.account_id ?? '');
    const name = String(body.name ?? '').trim();
    if (!account_id || !name) {
      res.status(400).json({ error: 'account_id and name are required' });
      return;
    }
    const tier = normalizeContactTier(body.tier, body.is_primary);
    const row = {
      tenant_id: tenantId,
      account_id,
      name,
      role: body.role != null ? String(body.role) : null,
      phone: body.phone != null ? String(body.phone).trim() || null : null,
      email: body.email != null ? String(body.email).trim() || null : null,
      is_primary: tier === 'primary',
      tier,
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
      notes: body.notes != null ? String(body.notes) : null,
      updated_at: NOW_ISO(),
    };
    const { data, error } = await db.from('crm_contacts').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ contact: data });
    return;
  }

  if (action === 'contact.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const patch: Record<string, unknown> = { updated_at: NOW_ISO() };
    for (const k of ['name', 'role', 'phone', 'email', 'notes'] as const) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        const v = body[k];
        patch[k] = v === null ? null : String(v);
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'tier')) {
      const tier = normalizeContactTier(body.tier, body.is_primary);
      patch.tier = tier;
      patch.is_primary = tier === 'primary';
    } else if (Object.prototype.hasOwnProperty.call(body, 'is_primary')) {
      patch.is_primary = Boolean(body.is_primary);
      if (Boolean(body.is_primary)) patch.tier = 'primary';
    }
    if (Object.prototype.hasOwnProperty.call(body, 'sort_order')) {
      const n = Number(body.sort_order);
      patch.sort_order = Number.isFinite(n) ? n : 0;
    }
    const { data, error } = await db
      .from('crm_contacts')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }
    res.status(200).json({ contact: data });
    return;
  }

  if (action === 'contact.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db.from('crm_contacts').delete().eq('id', id).eq('tenant_id', tenantId);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'property.create') {
    const account_id = String(body.account_id ?? '');
    const address = String(body.address ?? '').trim();
    if (!account_id || !address) {
      res.status(400).json({ error: 'account_id and address are required' });
      return;
    }
    const wantsDefault = Boolean(body.is_default);
    if (wantsDefault) {
      await db
        .from('crm_properties')
        .update({ is_default: false, updated_at: NOW_ISO() })
        .eq('account_id', account_id)
        .eq('tenant_id', tenantId);
    } else {
      const existing = await db
        .from('crm_properties')
        .select('id')
        .eq('account_id', account_id)
        .eq('tenant_id', tenantId)
        .limit(1);
      if (!existing.error && (existing.data ?? []).length === 0) {
        // First property for the account becomes the default automatically.
        body.is_default = true;
      }
    }
    const row = {
      tenant_id: tenantId,
      account_id,
      address,
      label: body.label != null ? String(body.label).trim() || null : null,
      city: body.city != null ? String(body.city).trim() || null : null,
      province: body.province != null ? String(body.province).trim() || null : null,
      postal_code: body.postal_code != null ? String(body.postal_code).trim() || null : null,
      notes: body.notes != null ? String(body.notes) : null,
      is_default: Boolean(body.is_default),
      updated_at: NOW_ISO(),
    };
    const { data, error } = await db.from('crm_properties').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ property: data });
    return;
  }

  if (action === 'property.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const patch: Record<string, unknown> = { updated_at: NOW_ISO() };
    for (const k of ['label', 'address', 'city', 'province', 'postal_code', 'notes'] as const) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        const v = body[k];
        patch[k] = v === null ? null : String(v);
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'is_default')) {
      patch.is_default = Boolean(body.is_default);
      if (Boolean(body.is_default)) {
        const target = await db
          .from('crm_properties')
          .select('account_id')
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (target.data?.account_id) {
          await db
            .from('crm_properties')
            .update({ is_default: false, updated_at: NOW_ISO() })
            .eq('account_id', target.data.account_id)
            .eq('tenant_id', tenantId)
            .neq('id', id);
        }
      }
    }
    const { data, error } = await db
      .from('crm_properties')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    res.status(200).json({ property: data });
    return;
  }

  if (action === 'property.set_default') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const target = await db
      .from('crm_properties')
      .select('account_id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (target.error) {
      res.status(500).json({ error: target.error.message });
      return;
    }
    if (!target.data?.account_id) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    const account_id = target.data.account_id;
    const clearOthers = await db
      .from('crm_properties')
      .update({ is_default: false, updated_at: NOW_ISO() })
      .eq('account_id', account_id)
      .eq('tenant_id', tenantId);
    if (clearOthers.error) {
      res.status(500).json({ error: clearOthers.error.message });
      return;
    }
    const { data, error } = await db
      .from('crm_properties')
      .update({ is_default: true, updated_at: NOW_ISO() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (await errTable(error)) return;
    res.status(200).json({ property: data });
    return;
  }

  if (action === 'property.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db.from('crm_properties').delete().eq('id', id).eq('tenant_id', tenantId);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'interaction.create') {
    const account_id = String(body.account_id ?? '');
    const kind = String(body.kind ?? 'note').trim();
    const summary = String(body.summary ?? '').trim();
    if (!account_id || !summary) {
      res.status(400).json({ error: 'account_id and summary are required' });
      return;
    }
    const row = {
      tenant_id: tenantId,
      account_id,
      kind,
      summary,
      detail: body.detail != null ? String(body.detail) : null,
      occurred_at: body.occurred_at != null ? String(body.occurred_at) : NOW_ISO(),
      created_by_user_id: body.created_by_user_id != null ? String(body.created_by_user_id) : null,
    };
    const { data, error } = await db.from('crm_interactions').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ interaction: data });
    return;
  }

  if (action === 'interaction.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db.from('crm_interactions').delete().eq('id', id).eq('tenant_id', tenantId);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'research_note.create') {
    const account_id = String(body.account_id ?? '');
    const noteBody = String(body.body ?? '').trim();
    if (!account_id || !noteBody) {
      res.status(400).json({ error: 'account_id and body are required' });
      return;
    }
    const row = {
      tenant_id: tenantId,
      account_id,
      title: body.title != null ? String(body.title) : null,
      body: noteBody,
      source_url: body.source_url != null ? String(body.source_url).trim() || null : null,
      updated_at: NOW_ISO(),
    };
    const { data, error } = await db.from('crm_research_notes').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ research_note: data });
    return;
  }

  if (action === 'research_note.update') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const patch: Record<string, unknown> = { updated_at: NOW_ISO() };
    if (Object.prototype.hasOwnProperty.call(body, 'title')) patch.title = body.title === null ? null : String(body.title);
    if (Object.prototype.hasOwnProperty.call(body, 'body')) patch.body = String(body.body ?? '');
    if (Object.prototype.hasOwnProperty.call(body, 'source_url'))
      patch.source_url = body.source_url === null ? null : String(body.source_url).trim() || null;
    const { data, error } = await db
      .from('crm_research_notes')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (await errTable(error)) return;
    if (!data) {
      res.status(404).json({ error: 'Note not found' });
      return;
    }
    res.status(200).json({ research_note: data });
    return;
  }

  if (action === 'research_note.delete') {
    const id = String(body.id ?? '');
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db.from('crm_research_notes').delete().eq('id', id).eq('tenant_id', tenantId);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'lead_source.create') {
    const name = String(body.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const { data, error } = await db
      .from('crm_lead_sources')
      .insert({ tenant_id: tenantId, name, sort_order: Number(body.sort_order ?? 99) })
      .select('*')
      .single();
    if (await errTable(error)) return;
    res.status(200).json({ lead_source: data });
    return;
  }

  if (action === 'comm_log.create') {
    const kind = String(body.kind ?? 'email').toLowerCase();
    if (!['email', 'sms', 'call'].includes(kind)) {
      res.status(400).json({ error: 'kind must be email, sms, or call' });
      return;
    }
    const row = {
      tenant_id: tenantId,
      account_id: body.account_id != null ? String(body.account_id) : null,
      contact_id: body.contact_id != null ? String(body.contact_id) : null,
      property_id: body.property_id != null ? String(body.property_id) : null,
      kind,
      direction: String(body.direction ?? 'outbound'),
      subject: body.subject != null ? String(body.subject) : null,
      body: body.body != null ? String(body.body) : null,
      sent_by: body.sent_by != null ? String(body.sent_by) : null,
      sent_at: body.sent_at != null ? String(body.sent_at) : NOW_ISO(),
      related_entity_type: body.related_entity_type != null ? String(body.related_entity_type) : null,
      related_entity_id: body.related_entity_id != null ? String(body.related_entity_id) : null,
      status: body.status != null ? String(body.status) : null,
    };
    const { data, error } = await db.from('comm_log').insert(row).select('*').single();
    if (await errTable(error)) return;
    res.status(200).json({ comm_log: data });
    return;
  }

  if (action === 'import_legacy_leads') {
    const leads = body.leads;
    if (!Array.isArray(leads) || leads.length === 0) {
      res.status(400).json({ error: 'leads array required' });
      return;
    }
    const created: string[] = [];
    for (const raw of leads as Record<string, unknown>[]) {
      const name = String(raw.name ?? '').trim();
      if (!name) continue;
      const company = raw.company != null ? String(raw.company).trim() || null : null;
      const account_type = String(raw.type ?? 'Residential');
      const status = String(raw.status ?? 'New Lead');
      const marketing_source = raw.marketingSource != null ? String(raw.marketingSource) : null;
      const contact = String(raw.contact ?? '').trim();
      const notes = raw.notes != null ? String(raw.notes) : null;
      let phone: string | null = null;
      let email: string | null = null;
      if (contact.includes('@')) email = contact;
      else phone = contact || null;
      const insAcc = {
        tenant_id: tenantId,
        name: company ? `${name}` : name,
        company,
        account_type,
        status,
        marketing_source,
        phone,
        email,
        notes,
        updated_at: NOW_ISO(),
      };
      const { data: acc, error: e1 } = await db.from('crm_accounts').insert(insAcc).select('id').single();
      if (e1 || !acc) continue;
      const aid = acc.id as string;
      created.push(aid);
      await db.from('crm_contacts').insert({
        tenant_id: tenantId,
        account_id: aid,
        name,
        is_primary: true,
        phone,
        email,
        notes: notes,
        updated_at: NOW_ISO(),
      });
    }
    res.status(200).json({ imported_account_ids: created, count: created.length });
    return;
  }

  if (action === 'import_accounts_csv') {
    const rows = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: 'rows array required' });
      return;
    }
    let n = 0;
    for (const raw of rows as Record<string, unknown>[]) {
      const name = String(raw.name ?? raw.Name ?? '').trim();
      if (!name) continue;
      const row = {
        tenant_id: tenantId,
        name,
        company: raw.company != null ? String(raw.company) : raw.Company != null ? String(raw.Company) : null,
        account_type: String(raw.account_type ?? raw.accountType ?? 'Residential'),
        status: String(raw.status ?? raw.Status ?? 'New Lead'),
        marketing_source:
          raw.marketing_source != null
            ? String(raw.marketing_source)
            : raw.marketingSource != null
              ? String(raw.marketingSource)
              : null,
        phone: raw.phone != null ? String(raw.phone) : raw.Phone != null ? String(raw.Phone) : null,
        email: raw.email != null ? String(raw.email) : raw.Email != null ? String(raw.Email) : null,
        address: raw.address != null ? String(raw.address) : raw.Address != null ? String(raw.Address) : null,
        notes: raw.notes != null ? String(raw.notes) : raw.Notes != null ? String(raw.Notes) : null,
        updated_at: NOW_ISO(),
      };
      const { error } = await db.from('crm_accounts').insert(row);
      if (!error) n += 1;
    }
    res.status(200).json({ imported: n });
    return;
  }

  res.status(400).json({ error: `Unknown action: ${action}` });
}
