/**
 * Persistent kanban column configuration. Built-in IDs match the original
 * `TaskStatus` literals so existing tasks keep showing up in the right place
 * with no migration. Users can add, rename, reorder, or delete custom
 * columns from the Tasks page.
 *
 * Note: `done` carries semantic meaning (hides overdue, suppresses
 * assignment notifications) — `BUILT_IN_DONE_ID` should not be removed.
 */

export const TASK_COLUMNS_STORAGE_KEY = 'tasksColumns_v1';

export const BUILT_IN_DONE_ID = 'done';

export type TaskColumn = {
  id: string;
  label: string;
  builtin?: boolean;
};

export const DEFAULT_COLUMNS: TaskColumn[] = [
  { id: 'backlog', label: 'Backlog', builtin: true },
  { id: 'todo', label: 'To do', builtin: true },
  { id: 'in-progress', label: 'In progress', builtin: true },
  { id: 'blocked', label: 'Blocked', builtin: true },
  { id: BUILT_IN_DONE_ID, label: 'Done', builtin: true },
];

function isValidColumn(value: unknown): value is TaskColumn {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o.id === 'string' && o.id.length > 0 && typeof o.label === 'string';
}

function ensureDoneColumn(cols: TaskColumn[]): TaskColumn[] {
  if (cols.some((c) => c.id === BUILT_IN_DONE_ID)) return cols;
  return [...cols, { id: BUILT_IN_DONE_ID, label: 'Done', builtin: true }];
}

export function loadTaskColumns(): TaskColumn[] {
  try {
    const raw = localStorage.getItem(TASK_COLUMNS_STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMNS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_COLUMNS;
    const cleaned = parsed.filter(isValidColumn).map((c) => ({
      id: c.id,
      label: c.label,
      builtin: Boolean(c.builtin),
    }));
    if (cleaned.length === 0) return DEFAULT_COLUMNS;
    return ensureDoneColumn(cleaned);
  } catch {
    return DEFAULT_COLUMNS;
  }
}

export function saveTaskColumns(cols: TaskColumn[]): void {
  localStorage.setItem(TASK_COLUMNS_STORAGE_KEY, JSON.stringify(ensureDoneColumn(cols)));
}

export function generateColumnId(label: string, existing: TaskColumn[]): string {
  const base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'col';
  const taken = new Set(existing.map((c) => c.id));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}
