import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_auth';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = supabase();
  if (!db) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return;
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const action = String(req.query.action ?? '');
    if (action === 'accounts') {
      const { data, error } = await db.from('crm_accounts').select('*').order('updated_at', { ascending: false });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      res.status(200).json({ accounts: data ?? [] });
      return;
    }
    if (action === 'account') {
      const id = String(req.query.id ?? '');
      if (!id) {
        res.status(400).json({ error: 'Missing id' });
        return;
      }
      const [acc, contacts, interactions, research_notes] = await Promise.all([
        db.from('crm_accounts').select('*').eq('id', id).maybeSingle(),
        db.from('crm_contacts').select('*').eq('account_id', id).order('created_at', { ascending: true }),
        db.from('crm_interactions').select('*').eq('account_id', id).order('occurred_at', { ascending: false }),
        db.from('crm_research_notes').select('*').eq('account_id', id).order('created_at', { ascending: false }),
      ]);
      if (acc.error) {
        res.status(500).json({ error: acc.error.message });
        return;
      }
      if (!acc.data) {
        res.status(404).json({ error: 'Account not found' });
        return;
      }
      res.status(200).json({
        account: acc.data,
        contacts: contacts.data ?? [],
        interactions: interactions.data ?? [],
        research_notes: research_notes.data ?? [],
      });
      return;
    }
    res.status(400).json({ error: 'Invalid GET: use action=accounts or action=account&id=' });
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
    const keys = ['name', 'company', 'account_type', 'status', 'marketing_source', 'phone', 'email', 'address', 'notes'] as const;
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        const v = body[k];
        if (v === null) patch[k] = null;
        else if (typeof v === 'string') patch[k] = v;
      }
    }
    const { data, error } = await db.from('crm_accounts').update(patch).eq('id', id).select('*').single();
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
    const { error } = await db.from('crm_accounts').delete().eq('id', id);
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
    const row = {
      account_id,
      name,
      role: body.role != null ? String(body.role) : null,
      phone: body.phone != null ? String(body.phone).trim() || null : null,
      email: body.email != null ? String(body.email).trim() || null : null,
      is_primary: Boolean(body.is_primary),
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
    if (Object.prototype.hasOwnProperty.call(body, 'is_primary')) {
      patch.is_primary = Boolean(body.is_primary);
    }
    const { data, error } = await db.from('crm_contacts').update(patch).eq('id', id).select('*').single();
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
    const { error } = await db.from('crm_contacts').delete().eq('id', id);
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
    const { error } = await db.from('crm_interactions').delete().eq('id', id);
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
    const { data, error } = await db.from('crm_research_notes').update(patch).eq('id', id).select('*').single();
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
    const { error } = await db.from('crm_research_notes').delete().eq('id', id);
    if (await errTable(error)) return;
    res.status(200).json({ ok: true });
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
