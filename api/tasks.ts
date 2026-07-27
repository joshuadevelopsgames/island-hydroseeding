/**
 * Task board — server-backed (replaces the `tasksBoard` / `tasksColumns_v1`
 * localStorage blobs, which were per-browser and silently diverged between
 * devices).
 *
 * GET  /api/tasks                        → { tasks, columns }
 * POST /api/tasks  body { action, ... }:
 *   create        → { task }   create a task
 *   update        → { task }   patch a task by id
 *   delete        → { ok }     remove a task
 *   saveColumns   → { columns } replace the column set (order = array order)
 *
 * Columns are seeded on first read so a fresh tenant gets the same default
 * board the client used to hard-code.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_auth';
import { resolveTenantId } from './_tenant';

const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const MAX_LABELS = 12;
const BUILT_IN_DONE_ID = 'done';

const DEFAULT_COLUMNS = [
  { column_id: 'backlog', label: 'Backlog', builtin: true },
  { column_id: 'todo', label: 'To do', builtin: true },
  { column_id: 'in-progress', label: 'In progress', builtin: true },
  { column_id: 'blocked', label: 'Blocked', builtin: true },
  { column_id: BUILT_IN_DONE_ID, label: 'Done', builtin: true },
];

function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
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

type TaskRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_date: string | null;
  labels: string[] | null;
  assignee_id: string | null;
  assignee_name: string;
  assignee_since: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

type ColumnRow = {
  column_id: string;
  label: string;
  builtin: boolean;
  sort_order: number;
};

function mapTask(row: TaskRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: VALID_PRIORITIES.has(row.priority) ? row.priority : 'medium',
    dueDate: row.due_date,
    labels: Array.isArray(row.labels) ? row.labels : [],
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name ?? '',
    assigneeSince: row.assignee_since,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapColumn(row: ColumnRow) {
  return { id: row.column_id, label: row.label, builtin: row.builtin };
}

/** Normalises the writable fields shared by create and update. */
function readTaskFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if ('title' in body) out.title = String(body.title ?? '').slice(0, 300);
  if ('description' in body) out.description = String(body.description ?? '').slice(0, 8000);
  if ('status' in body) out.status = String(body.status ?? 'todo').slice(0, 120) || 'todo';
  if ('priority' in body) {
    const p = String(body.priority ?? 'medium');
    out.priority = VALID_PRIORITIES.has(p) ? p : 'medium';
  }
  if ('dueDate' in body) {
    const raw = body.dueDate == null ? '' : String(body.dueDate).trim();
    out.due_date = raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
  }
  if ('labels' in body) {
    const arr = Array.isArray(body.labels) ? body.labels : [];
    out.labels = arr
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, MAX_LABELS);
  }
  if ('assigneeId' in body) {
    const raw = body.assigneeId == null ? '' : String(body.assigneeId).trim();
    out.assignee_id = raw || null;
  }
  if ('assigneeName' in body) out.assignee_name = String(body.assigneeName ?? '').slice(0, 200);
  if ('assigneeSince' in body) {
    const raw = body.assigneeSince == null ? '' : String(body.assigneeSince).trim();
    out.assignee_since = raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
  }
  return out;
}

/** Reads the tenant's columns, seeding the defaults the first time. */
async function loadColumns(db: SupabaseClient, tenantId: string): Promise<ColumnRow[]> {
  const { data, error } = await db
    .from('task_columns')
    .select('column_id, label, builtin, sort_order')
    .eq('tenant_id', tenantId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ColumnRow[];
  if (rows.length > 0) return rows;

  const seed = DEFAULT_COLUMNS.map((c, i) => ({ ...c, tenant_id: tenantId, sort_order: i }));
  const { data: inserted, error: seedErr } = await db
    .from('task_columns')
    .insert(seed)
    .select('column_id, label, builtin, sort_order');
  // A concurrent first load may win the race; fall back to the defaults rather
  // than failing the whole page load over a unique-violation.
  if (seedErr) return seed as ColumnRow[];
  return ((inserted ?? []) as ColumnRow[]).sort((a, b) => a.sort_order - b.sort_order);
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
    const [{ data, error }, columns] = await Promise.all([
      db.from('tasks').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      loadColumns(db, tenantId).catch(() => [] as ColumnRow[]),
    ]);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({
      tasks: ((data ?? []) as TaskRow[]).map(mapTask),
      columns: columns.map(mapColumn),
    });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseBody(req);
  const action = String(req.query.action ?? body.action ?? '').trim();

  if (action === 'create') {
    const fields = readTaskFields(body);
    const title = String(fields.title ?? '').trim();
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const { data: row, error } = await db
      .from('tasks')
      .insert({
        ...fields,
        title,
        tenant_id: tenantId,
        created_by_user_id: auth.userId,
        created_by_email: auth.email || null,
      })
      .select('*')
      .single();
    if (error || !row) {
      res.status(500).json({ error: error?.message ?? 'Failed to create task' });
      return;
    }
    res.status(200).json({ task: mapTask(row as TaskRow) });
    return;
  }

  if (action === 'update') {
    const id = String(body.id ?? '').trim();
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const fields = readTaskFields(body);
    if ('title' in fields && !String(fields.title).trim()) {
      res.status(400).json({ error: 'title cannot be empty' });
      return;
    }
    const { data: row, error } = await db
      .from('tasks')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .maybeSingle();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.status(200).json({ task: mapTask(row as TaskRow) });
    return;
  }

  if (action === 'delete') {
    const id = String(body.id ?? '').trim();
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const { error } = await db.from('tasks').delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'saveColumns') {
    const incoming = Array.isArray(body.columns) ? body.columns : null;
    if (!incoming) {
      res.status(400).json({ error: 'columns array is required' });
      return;
    }
    const rows = incoming
      .map((raw, i) => {
        const o = (raw ?? {}) as Record<string, unknown>;
        const columnId = String(o.id ?? '').trim().slice(0, 120);
        if (!columnId) return null;
        return {
          tenant_id: tenantId,
          column_id: columnId,
          label: String(o.label ?? '').slice(0, 200),
          builtin: Boolean(o.builtin),
          sort_order: i,
          updated_at: new Date().toISOString(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (!rows.some((r) => r.column_id === BUILT_IN_DONE_ID)) {
      // `done` carries semantics (hides overdue, suppresses assignment badges),
      // so it can never be deleted away.
      res.status(400).json({ error: 'The Done column cannot be removed' });
      return;
    }

    const keep = rows.map((r) => r.column_id);
    const { error: delErr } = await db
      .from('task_columns')
      .delete()
      .eq('tenant_id', tenantId)
      .not('column_id', 'in', `(${keep.map((k) => `"${k.replace(/"/g, '')}"`).join(',')})`);
    if (delErr) {
      res.status(500).json({ error: delErr.message });
      return;
    }
    const { data, error } = await db
      .from('task_columns')
      .upsert(rows, { onConflict: 'tenant_id,column_id' })
      .select('column_id, label, builtin, sort_order');
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    const columns = ((data ?? []) as ColumnRow[]).sort((a, b) => a.sort_order - b.sort_order);
    res.status(200).json({ columns: columns.map(mapColumn) });
    return;
  }

  res.status(400).json({ error: 'Unknown action; use create, update, delete or saveColumns' });
}
