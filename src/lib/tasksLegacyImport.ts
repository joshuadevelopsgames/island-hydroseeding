/**
 * One-time import of the pre-server task board.
 *
 * Before /api/tasks existed, the board lived in two localStorage blobs
 * (`tasksBoard` and `tasksColumns_v1`) that were per-browser. Shipping the
 * server-backed board without this would look exactly like data loss to anyone
 * who already had a board — so on first load against an empty server we push
 * the local copy up, and we keep a backup of the raw blob either way.
 */
import { createTask, saveTaskColumnsRemote, type RemoteTask } from './tasksRemote';
import {
  DEFAULT_COLUMNS,
  TASK_COLUMNS_STORAGE_KEY,
  loadTaskColumns,
  type TaskColumn,
} from './taskColumns';
import { TASKS_STORAGE_KEY } from './taskAssignments';

const MIGRATED_FLAG = 'tasksMigratedToServer_v1';
const BACKUP_KEY = 'tasksBoard_preServerBackup';
const COLUMNS_BACKUP_KEY = 'tasksColumns_preServerBackup';

type LegacyTask = {
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string | null;
  labels: string[];
  assigneeId: string | null;
  assigneeName: string;
  assigneeSince: string | null;
  createdAt: string;
};

const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

function readLegacyTasks(): LegacyTask[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(TASKS_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((row) => {
        const o = (row ?? {}) as Record<string, unknown>;
        const title = String(o.title ?? '').trim();
        if (!title) return null;
        const pr = String(o.priority ?? 'medium');
        const aid = o.assigneeId != null && String(o.assigneeId).trim() !== '' ? String(o.assigneeId) : null;
        return {
          title,
          description: String(o.description ?? ''),
          status: String(o.status ?? 'todo').trim() || 'todo',
          priority: VALID_PRIORITIES.has(pr) ? pr : 'medium',
          dueDate: o.dueDate != null && String(o.dueDate).trim() !== '' ? String(o.dueDate) : null,
          labels: Array.isArray(o.labels) ? o.labels.map((x) => String(x)) : [],
          assigneeId: aid,
          assigneeName: String(o.assigneeName ?? ''),
          assigneeSince:
            o.assigneeSince != null && String(o.assigneeSince).trim() !== '' ? String(o.assigneeSince) : null,
          createdAt: String(o.createdAt ?? ''),
        } satisfies LegacyTask;
      })
      .filter((t): t is LegacyTask => t !== null);
  } catch {
    return [];
  }
}

/** Copies the raw blobs aside so a failed or unwanted import is still recoverable. */
function backupOnce() {
  try {
    if (localStorage.getItem(BACKUP_KEY) === null) {
      const raw = localStorage.getItem(TASKS_STORAGE_KEY);
      if (raw) localStorage.setItem(BACKUP_KEY, raw);
    }
    if (localStorage.getItem(COLUMNS_BACKUP_KEY) === null) {
      const raw = localStorage.getItem(TASK_COLUMNS_STORAGE_KEY);
      if (raw) localStorage.setItem(COLUMNS_BACKUP_KEY, raw);
    }
  } catch {
    /* private mode — nothing to back up */
  }
}

function markDone() {
  try {
    localStorage.setItem(MIGRATED_FLAG, new Date().toISOString());
  } catch {
    /* private mode — we may retry the check next load, which is harmless */
  }
}

function alreadyMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_FLAG) !== null;
  } catch {
    return false;
  }
}

function columnsDifferFromDefault(cols: TaskColumn[]): boolean {
  if (cols.length !== DEFAULT_COLUMNS.length) return true;
  return cols.some((c, i) => c.id !== DEFAULT_COLUMNS[i].id || c.label !== DEFAULT_COLUMNS[i].label);
}

export type LegacyImportResult = {
  tasks: RemoteTask[];
  columns: TaskColumn[] | null;
  importedCount: number;
};

/**
 * Imports the local board when the server has none. Returns null when there is
 * nothing to do — already migrated, no local board, or the server already holds
 * tasks (in which case the local copy is left backed up and untouched).
 */
export async function importLegacyBoardIfNeeded(serverTaskCount: number): Promise<LegacyImportResult | null> {
  if (alreadyMigrated()) return null;

  const legacy = readLegacyTasks();
  if (legacy.length === 0) {
    markDone();
    return null;
  }

  backupOnce();

  if (serverTaskCount > 0) {
    // Someone else already populated the shared board. Importing here would
    // duplicate their work, so stop — the backup above keeps the local copy.
    console.warn(
      `[tasks] ${legacy.length} local task(s) were not imported because the shared board already has tasks. ` +
        `A copy is kept under "${BACKUP_KEY}".`
    );
    markDone();
    return null;
  }

  let columns: TaskColumn[] | null = null;
  const localColumns = loadTaskColumns();
  if (columnsDifferFromDefault(localColumns)) {
    try {
      columns = await saveTaskColumnsRemote(localColumns);
    } catch {
      // Falling back to the seeded defaults still keeps every task — they just
      // land in whichever columns exist, or the "Other" group.
      columns = null;
    }
  }

  const tasks: RemoteTask[] = [];
  for (const t of legacy) {
    try {
      tasks.push(
        await createTask({
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority as RemoteTask['priority'],
          dueDate: t.dueDate,
          labels: t.labels,
          assigneeId: t.assigneeId,
          assigneeName: t.assigneeName,
          assigneeSince: t.assigneeSince,
        })
      );
    } catch {
      // Skip the individual failure; the backup still holds the original.
    }
  }

  markDone();
  return { tasks, columns, importedCount: tasks.length };
}
