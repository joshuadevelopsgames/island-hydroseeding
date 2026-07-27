/**
 * Authenticated /api/tasks calls. Tasks and the board's column configuration
 * are stored server-side (Supabase) — not localStorage — so two people editing
 * the board see the same data and clearing site data can't wipe the work.
 */
import { apiFetch } from './apiClient';
import type { TaskColumn } from './taskColumns';
import { TASKS_STORAGE_KEY } from './taskAssignments';

export type RemoteTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type RemoteTask = {
  id: string;
  title: string;
  description: string;
  /** Column id; matches a `TaskColumn.id`. */
  status: string;
  priority: RemoteTaskPriority;
  dueDate: string | null;
  labels: string[];
  assigneeId: string | null;
  assigneeName: string;
  assigneeSince: string | null;
  createdByEmail?: string | null;
  createdAt: string;
  updatedAt?: string;
};

/** Fields a create/update may set; everything is optional on update. */
export type TaskInput = {
  title?: string;
  description?: string;
  status?: string;
  priority?: RemoteTaskPriority;
  dueDate?: string | null;
  labels?: string[];
  assigneeId?: string | null;
  assigneeName?: string;
  assigneeSince?: string | null;
};

async function readJson<T>(r: Response): Promise<T> {
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.slice(0, 200) || r.statusText);
  }
}

async function errorFrom(r: Response, fallback: string): Promise<Error> {
  const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
  return new Error(j.error || fallback);
}

async function post<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const r = await apiFetch(`/api/tasks?action=${encodeURIComponent(String(body.action))}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await errorFrom(r, fallback);
  return readJson<T>(r);
}

export async function fetchTaskBoard(): Promise<{ tasks: RemoteTask[]; columns: TaskColumn[] }> {
  const r = await apiFetch('/api/tasks', { cache: 'no-store' });
  if (!r.ok) throw await errorFrom(r, `Tasks ${r.status}`);
  const j = await readJson<{ tasks?: RemoteTask[]; columns?: TaskColumn[] }>(r);
  return {
    tasks: Array.isArray(j.tasks) ? j.tasks : [],
    columns: Array.isArray(j.columns) ? j.columns : [],
  };
}

export async function createTask(input: TaskInput): Promise<RemoteTask> {
  const j = await post<{ task: RemoteTask }>({ action: 'create', ...input }, 'Could not create the task');
  return j.task;
}

export async function updateTask(id: string, input: TaskInput): Promise<RemoteTask> {
  const j = await post<{ task: RemoteTask }>({ action: 'update', id, ...input }, 'Could not save the task');
  return j.task;
}

export async function deleteTask(id: string): Promise<void> {
  await post<{ ok: true }>({ action: 'delete', id }, 'Could not delete the task');
}

export async function saveTaskColumnsRemote(columns: TaskColumn[]): Promise<TaskColumn[]> {
  const j = await post<{ columns: TaskColumn[] }>(
    { action: 'saveColumns', columns },
    'Could not save the columns'
  );
  return Array.isArray(j.columns) ? j.columns : columns;
}

/**
 * Mirror of the server list kept in localStorage purely so the sidebar's
 * assignment badge can be computed synchronously on first paint. The server is
 * the source of truth — nothing should ever load the board from here.
 */
export function writeTaskBadgeCache(tasks: { id: string }[]): void {
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    /* private mode — the badge just won't update until the next load */
  }
  window.dispatchEvent(new Event('tasks-updated'));
}

/**
 * Refreshes the badge cache from the server. Called once on app load so the
 * badge is correct even on a device that has never opened the Tasks page.
 */
export async function refreshTaskBadgeCache(): Promise<void> {
  try {
    const { tasks } = await fetchTaskBoard();
    writeTaskBadgeCache(tasks);
  } catch {
    // Badge accuracy is not worth surfacing an error for; the Tasks page
    // reports load failures properly when you actually open it.
  }
}
