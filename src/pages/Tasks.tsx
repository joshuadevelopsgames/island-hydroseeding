import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  Plus,
  Calendar as CalendarIcon,
  Search,
  Flag,
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  UserCircle,
  Bell,
  Pencil,
  ArrowLeft,
  ArrowRight,
  LayoutList,
  LayoutGrid,
  Columns3,
} from 'lucide-react';
import { isBefore } from 'date-fns';
import {
  formatInVancouver,
  isVancouverToday,
  vancouverDateInputFromIso,
  vancouverDateInputToIso,
  vancouverStartOfDay,
} from '../lib/vancouverTime';
import { useAuth } from '../context/AuthContext';
import type { AppUser } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { toast } from 'sonner';
import {
  acknowledgeAllAssignments,
  acknowledgeAssignment,
  isUnacknowledgedAssignment,
  readAssignmentAcks,
} from '../lib/taskAssignments';
import { BUILT_IN_DONE_ID, DEFAULT_COLUMNS, generateColumnId, type TaskColumn } from '../lib/taskColumns';
import {
  fetchTaskBoard,
  createTask,
  updateTask,
  deleteTask,
  saveTaskColumnsRemote,
  writeTaskBadgeCache,
  type TaskInput,
} from '../lib/tasksRemote';
import { importLegacyBoardIfNeeded } from '../lib/tasksLegacyImport';

type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

type Task = {
  id: string;
  title: string;
  description: string;
  /** Column id; matches a `TaskColumn.id` from the configured columns list. */
  status: string;
  createdAt: string;
  dueDate: string | null;
  priority: TaskPriority;
  labels: string[];
  assigneeId: string | null;
  assigneeName: string;
  /** When the current assignee was set; used for “new assignment” inbox / notifications */
  assigneeSince: string | null;
};

function normalizeTask(raw: unknown): Task {
  const o = raw as Record<string, unknown>;
  let labels: string[] = [];
  const lr = o.labels;
  if (Array.isArray(lr)) {
    labels = lr.map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
  }
  const status = String(o.status ?? 'todo').trim() || 'todo';
  const pr = String(o.priority);
  const priority: TaskPriority =
    pr === 'low' || pr === 'high' || pr === 'urgent' || pr === 'medium' ? pr : 'medium';
  let dueDate: string | null = null;
  if (o.dueDate != null && String(o.dueDate).trim() !== '') {
    const d = String(o.dueDate);
    dueDate = d.includes('T') ? d : vancouverDateInputToIso(d);
  }
  const aid = o.assigneeId != null && String(o.assigneeId).trim() !== '' ? String(o.assigneeId) : null;
  let assigneeSince: string | null = null;
  if (o.assigneeSince != null && String(o.assigneeSince).trim() !== '') {
    assigneeSince = String(o.assigneeSince);
  } else if (aid) {
    assigneeSince = String(o.createdAt ?? new Date().toISOString());
  }
  return {
    id: String(o.id ?? Math.random().toString(36).slice(2, 11)),
    title: String(o.title ?? ''),
    description: String(o.description ?? ''),
    status,
    createdAt: String(o.createdAt ?? new Date().toISOString()),
    dueDate,
    priority,
    labels,
    assigneeId: aid,
    assigneeName: String(o.assigneeName ?? ''),
    assigneeSince,
  };
}

function reconcileAssignees(tasks: Task[], users: AppUser[]): Task[] {
  const byId = new Map(users.map((u) => [u.id, u]));
  return tasks.map((t) => {
    if (!t.assigneeId) return { ...t, assigneeName: '', assigneeSince: null };
    const u = byId.get(t.assigneeId);
    if (!u) return { ...t, assigneeId: null, assigneeName: '', assigneeSince: null };
    return { ...t, assigneeName: u.name };
  });
}

function tasksAssigneeReconcileChanged(prev: Task[], next: Task[]) {
  if (prev.length !== next.length) return true;
  return next.some((t, i) => {
    const p = prev[i];
    return p.assigneeId !== t.assigneeId || p.assigneeName !== t.assigneeName;
  });
}

function parseLabelsInput(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12);
}

const PRIORITY_ORDER: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

/** List / Grid / Board, mirroring the view switcher in the LECRM tasks page. */
type ViewMode = 'list' | 'grid' | 'board';
const VIEW_MODES: { id: ViewMode; label: string; Icon: typeof LayoutList }[] = [
  { id: 'list', label: 'List', Icon: LayoutList },
  { id: 'grid', label: 'Grid', Icon: LayoutGrid },
  { id: 'board', label: 'Board', Icon: Columns3 },
];

type DateFilter = 'today' | 'upcoming' | 'done' | 'all';
const DATE_FILTERS: { id: DateFilter; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'done', label: 'Done' },
  { id: 'all', label: 'All' },
];

const VIEW_MODE_KEY = 'tasksViewMode_v1';
const DATE_FILTER_KEY = 'tasksDateFilter_v1';

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function priorityAccent(p: TaskPriority): string {
  switch (p) {
    case 'urgent':
      return '#dc2626';
    case 'high':
      return '#ea580c';
    case 'medium':
      return '#ca8a04';
    default:
      return '#64748b';
  }
}

function isOverdue(task: Task): boolean {
  if (task.status === BUILT_IN_DONE_ID || !task.dueDate) return false;
  try {
    return isBefore(vancouverStartOfDay(task.dueDate), vancouverStartOfDay());
  } catch {
    return false;
  }
}

/**
 * Which top-level tab a task belongs under. "Today" deliberately includes
 * overdue work — an inspection that slipped yesterday still needs doing today,
 * and burying it under a tab nobody opens is how things get missed.
 */
function matchesDateFilter(task: Task, filter: DateFilter): boolean {
  if (filter === 'all') return true;
  const isDone = task.status === BUILT_IN_DONE_ID;
  if (filter === 'done') return isDone;
  if (isDone || !task.dueDate) return false;
  let due: Date;
  let today: Date;
  try {
    due = vancouverStartOfDay(task.dueDate);
    today = vancouverStartOfDay();
  } catch {
    return false;
  }
  if (filter === 'today') return !isBefore(today, due);
  return isBefore(today, due);
}

/** Today in Vancouver, as a `yyyy-MM-dd` value for a `<input type="date">`. */
function todayDateInput(): string {
  return vancouverDateInputFromIso(new Date().toISOString());
}

function resolveAssignee(formData: FormData, users: AppUser[]) {
  const aid = String(formData.get('assigneeId') || '').trim();
  if (!aid) return { assigneeId: null as string | null, assigneeName: '' };
  const u = users.find((x) => x.id === aid);
  return { assigneeId: aid, assigneeName: u?.name ?? '' };
}

function assigneeSelectLabel(u: AppUser) {
  return `${u.name} · ${u.email}`;
}

function resolveDropColumn(overId: string, columnIds: string[], allTasks: Task[]): string | null {
  if (columnIds.includes(overId)) return overId;
  const t = allTasks.find((x) => x.id === overId);
  return t && columnIds.includes(t.status) ? t.status : null;
}

type KanbanTaskCardProps = {
  task: Task;
  columnId: string;
  overdue: boolean;
  isNew: boolean;
  accent: string;
  prevColumnId: string | null;
  nextColumnId: string | null;
  moveTask: (id: string, s: string) => void;
  setDetailTask: (t: Task | null) => void;
};

function KanbanTaskCard({
  task,
  columnId,
  overdue,
  isNew,
  accent,
  prevColumnId,
  nextColumnId,
  moveTask,
  setDetailTask,
}: KanbanTaskCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      className={`kanban-card${overdue ? ' kanban-card--overdue' : ''}${isNew ? ' kanban-card--unread' : ''}${isDragging ? ' kanban-card--dragging' : ''}`}
      style={{
        ['--task-accent' as string]: accent,
        touchAction: 'none',
        opacity: isDragging ? 0.45 : undefined,
      }}
      onClick={() => setDetailTask(task)}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          setDetailTask(task);
        }
      }}
    >
      {isNew && <span className="kanban-card__new">New for you</span>}
      {task.labels.length > 0 && (
        <div className="kanban-card__labels">
          {task.labels.map((lab, i) => (
            <span key={`${task.id}-${i}-${lab}`} className="task-label-tag">
              {lab}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-start gap-2">
        <span className="priority-dot" style={{ marginTop: '0.35rem', background: accent }} />
        <h3 className="kanban-card__title" style={{ flex: 1 }}>
          {task.title}
        </h3>
      </div>
      {task.description ? <p className="kanban-card__desc">{task.description}</p> : null}
      {task.assigneeName ? (
        <div className="kanban-card__meta" style={{ marginBottom: '0.35rem' }}>
          <UserCircle size={12} />
          {task.assigneeName}
        </div>
      ) : null}
      <div className="kanban-card__foot">
        <div className="flex flex-col gap-1">
          {task.dueDate && (
            <span
              className={`kanban-card__meta kanban-card__meta--due${overdue ? ' kanban-card__meta--overdue' : ''}`}
            >
              <CalendarIcon size={12} />
              {isVancouverToday(task.dueDate) ? 'Today' : formatInVancouver(task.dueDate, 'MMM d')}
              {overdue ? ' · Overdue' : ''}
            </span>
          )}
          <span className="kanban-card__meta">
            <Flag size={12} />
            {task.priority}
          </span>
        </div>
        <div
          className="kanban-card__actions"
          onClick={(ev) => ev.stopPropagation()}
          onPointerDown={(ev) => ev.stopPropagation()}
        >
          {prevColumnId !== null && (
            <button
              type="button"
              className="kanban-card__move"
              title={`Move to "${prevColumnId}"`}
              onClick={() => moveTask(task.id, prevColumnId)}
            >
              <ChevronLeft size={14} style={{ verticalAlign: 'middle' }} />
            </button>
          )}
          {nextColumnId !== null && (
            <button
              type="button"
              className="kanban-card__move"
              title={`Move to "${nextColumnId}"`}
              onClick={() => moveTask(task.id, nextColumnId)}
            >
              <ChevronRight size={14} style={{ verticalAlign: 'middle' }} />
            </button>
          )}
          {/* Suppress unused-var warning when neither neighbor exists */}
          <span style={{ display: 'none' }}>{columnId}</span>
        </div>
      </div>
    </div>
  );
}

type TaskRowProps = {
  task: Task;
  statusLabel: string;
  overdue: boolean;
  isNew: boolean;
  accent: string;
  columns: TaskColumn[];
  onOpen: (t: Task) => void;
  onStatusChange: (id: string, status: string) => void;
};

/**
 * The status chip doubles as the column picker — changing which list a task is
 * in is the most common edit, and it shouldn't need opening the task first.
 * Rendered as a real `<select>` so it gets native keyboard and touch handling.
 */
function TaskStatusSelect({
  task,
  statusLabel,
  columns,
  onStatusChange,
}: Pick<TaskRowProps, 'task' | 'statusLabel' | 'columns' | 'onStatusChange'>) {
  const known = columns.some((c) => c.id === task.status);
  return (
    <span
      className="task-status-select"
      // Keep clicks off the row so picking a column never opens the detail panel.
      onClick={(ev) => ev.stopPropagation()}
      onKeyDown={(ev) => ev.stopPropagation()}
    >
      <select
        value={task.status}
        aria-label={`Column for “${task.title}”`}
        onChange={(ev) => onStatusChange(task.id, ev.target.value)}
      >
        {!known && <option value={task.status}>{statusLabel}</option>}
        {columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <ChevronDown size={12} aria-hidden />
    </span>
  );
}

/** Full-width row used by the List view. */
function TaskListRow({
  task,
  statusLabel,
  overdue,
  isNew,
  accent,
  columns,
  onOpen,
  onStatusChange,
}: TaskRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`task-row${overdue ? ' task-row--overdue' : ''}${isNew ? ' task-row--unread' : ''}`}
      style={{ ['--task-accent' as string]: accent }}
      onClick={() => onOpen(task)}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onOpen(task);
        }
      }}
    >
      <span className="task-row__accent" aria-hidden />
      <span className="task-row__main">
        <span className="task-row__titleline">
          <span className="task-row__title">{task.title}</span>
          {isNew && <span className="task-row__new">New for you</span>}
        </span>
        {task.description ? <span className="task-row__desc">{task.description}</span> : null}
        {task.labels.length > 0 && (
          <span className="task-row__labels">
            {task.labels.map((lab, i) => (
              <span key={`${task.id}-${i}-${lab}`} className="task-label-tag">
                {lab}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="task-row__meta">
        <TaskStatusSelect
          task={task}
          statusLabel={statusLabel}
          columns={columns}
          onStatusChange={onStatusChange}
        />
        {task.dueDate && (
          <span className={`task-row__chip${overdue ? ' task-row__chip--overdue' : ''}`}>
            <CalendarIcon size={12} aria-hidden />
            {isVancouverToday(task.dueDate) ? 'Today' : formatInVancouver(task.dueDate, 'MMM d')}
            {overdue ? ' · Overdue' : ''}
          </span>
        )}
        <span className="task-row__chip">
          <Flag size={12} aria-hidden />
          {task.priority}
        </span>
        <span className="task-row__chip">
          <UserCircle size={12} aria-hidden />
          {task.assigneeName || 'Unassigned'}
        </span>
      </span>
    </div>
  );
}

/** Card used by the Grid view — same information as a board card, no drag handles. */
function TaskGridCard({
  task,
  statusLabel,
  overdue,
  isNew,
  accent,
  columns,
  onOpen,
  onStatusChange,
}: TaskRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`task-tile${overdue ? ' task-tile--overdue' : ''}${isNew ? ' task-tile--unread' : ''}`}
      style={{ ['--task-accent' as string]: accent }}
      onClick={() => onOpen(task)}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onOpen(task);
        }
      }}
    >
      <span className="task-tile__top">
        <TaskStatusSelect
          task={task}
          statusLabel={statusLabel}
          columns={columns}
          onStatusChange={onStatusChange}
        />
        {isNew && <span className="task-row__new">New</span>}
      </span>
      {task.labels.length > 0 && (
        <span className="task-row__labels">
          {task.labels.map((lab, i) => (
            <span key={`${task.id}-${i}-${lab}`} className="task-label-tag">
              {lab}
            </span>
          ))}
        </span>
      )}
      <span className="task-tile__titleline">
        <span className="priority-dot" style={{ marginTop: '0.35rem', background: accent }} />
        <span className="task-tile__title">{task.title}</span>
      </span>
      {task.description ? <span className="task-tile__desc">{task.description}</span> : null}
      <span className="task-tile__foot">
        {task.dueDate && (
          <span className={`task-row__chip${overdue ? ' task-row__chip--overdue' : ''}`}>
            <CalendarIcon size={12} aria-hidden />
            {isVancouverToday(task.dueDate) ? 'Today' : formatInVancouver(task.dueDate, 'MMM d')}
          </span>
        )}
        <span className="task-row__chip">
          <Flag size={12} aria-hidden />
          {task.priority}
        </span>
        {task.assigneeName ? (
          <span className="task-row__chip">
            <UserCircle size={12} aria-hidden />
            {task.assigneeName}
          </span>
        ) : null}
      </span>
    </div>
  );
}

type KanbanColumnBodyProps = {
  columnId: string;
  children: ReactNode;
};

function KanbanColumnBody({ columnId, children }: KanbanColumnBodyProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });
  return (
    <div ref={setNodeRef} className={`kanban-column__body${isOver ? ' kanban-column__body--over' : ''}`}>
      {children}
    </div>
  );
}

export default function Tasks() {
  const { users, currentUser } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<TaskColumn[]>(DEFAULT_COLUMNS);
  const [isAdding, setIsAdding] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [dueFilter, setDueFilter] = useState<'all' | 'overdue' | 'has' | 'none'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [taskDeleteId, setTaskDeleteId] = useState<string | null>(null);
  const [columnDeleteId, setColumnDeleteId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnLabel, setEditingColumnLabel] = useState('');
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [notifyPermission, setNotifyPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Restore the last-used view and tab so the page opens where you left it.
  useEffect(() => {
    setViewMode(readStored(VIEW_MODE_KEY, VIEW_MODES.map((v) => v.id), 'list'));
    setDateFilter(readStored(DATE_FILTER_KEY, DATE_FILTERS.map((f) => f.id), 'today'));
  }, []);

  const changeViewMode = (next: ViewMode) => {
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {
      /* private mode — the view just won't persist */
    }
  };

  const changeDateFilter = (next: DateFilter) => {
    setDateFilter(next);
    try {
      localStorage.setItem(DATE_FILTER_KEY, next);
    } catch {
      /* private mode — the tab just won't persist */
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const board = await fetchTaskBoard();
        if (cancelled) return;

        // One-time lift of the old per-browser board onto the server.
        const imported = await importLegacyBoardIfNeeded(board.tasks.length);
        if (cancelled) return;
        const rows = imported && imported.importedCount > 0 ? imported.tasks : board.tasks;
        const cols = imported?.columns ?? board.columns;
        if (imported && imported.importedCount > 0) {
          toast.success(
            `Imported ${imported.importedCount} task${imported.importedCount === 1 ? '' : 's'} from this device`,
            { description: 'Tasks now live on the server and are shared across devices.' }
          );
        }

        setColumns(cols.length ? cols : DEFAULT_COLUMNS);
        setTasks(reconcileAssignees(rows.map(normalizeTask), users));
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Could not load tasks';
        setLoadError(msg);
        toast.error('Could not load tasks', { description: msg });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Initial load only; team updates handled by the reconcile effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTasks((prev) => {
      if (prev.length === 0) return prev;
      const next = reconcileAssignees(prev, users);
      if (!tasksAssigneeReconcileChanged(prev, next)) return prev;
      return next;
    });
  }, [users]);

  /**
   * Applies the server's copy of the board to local state and refreshes the
   * sidebar badge cache. All mutations funnel through here so the cache can
   * never drift from what we're rendering.
   */
  const applyTasks = (next: Task[]) => {
    const reconciled = reconcileAssignees(next, users);
    setTasks(reconciled);
    writeTaskBadgeCache(reconciled);
    return reconciled;
  };

  /** Persists the column set, rolling local state back if the server rejects it. */
  const persistColumns = async (next: TaskColumn[]) => {
    const previous = columns;
    setColumns(next);
    try {
      const saved = await saveTaskColumnsRemote(next);
      if (saved.length) setColumns(saved);
    } catch (err) {
      setColumns(previous);
      const msg = err instanceof Error ? err.message : 'Please try again.';
      toast.error('Could not save the columns', { description: msg });
    }
  };

  const inboxCount = useMemo(() => {
    if (!currentUser) return 0;
    const acks = readAssignmentAcks(currentUser.id);
    return tasks.filter((t) => isUnacknowledgedAssignment(t, currentUser.id, acks)).length;
  }, [tasks, currentUser]);

  const requestBrowserNotify = async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setNotifyPermission(p);
    if (p === 'granted' && currentUser && inboxCount > 0) {
      new Notification('Island Hydroseeding', {
        body:
          inboxCount === 1
            ? 'You have a task assigned to you. Open Tasks to view it.'
            : `You have ${inboxCount} tasks assigned to you.`,
        tag: 'ih-tasks-inbox',
      });
    }
  };

  const markAllAssignmentsSeen = () => {
    if (!currentUser) return;
    acknowledgeAllAssignments(currentUser.id, tasks);
    window.dispatchEvent(new Event('tasks-updated'));
    setTasks((t) => [...t]);
  };

  const detailOpenedForAck = useRef<string | null>(null);
  useEffect(() => {
    if (!detailTask || !currentUser) {
      detailOpenedForAck.current = null;
      return;
    }
    if (detailTask.assigneeId !== currentUser.id || !detailTask.assigneeSince) return;
    const key = `${detailTask.id}:${detailTask.assigneeSince}`;
    if (detailOpenedForAck.current === key) return;
    detailOpenedForAck.current = key;
    acknowledgeAssignment(currentUser.id, detailTask.id, detailTask.assigneeSince);
    window.dispatchEvent(new Event('tasks-updated'));
  }, [detailTask, currentUser]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  /** Everything matching the search + dropdown filters, before the date tab is applied. */
  const searchedTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (q) {
        const assignee = t.assigneeId ? userById.get(t.assigneeId) : undefined;
        const emailMatch = assignee?.email.toLowerCase().includes(q) ?? false;
        const inText =
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.labels.some((l) => l.toLowerCase().includes(q)) ||
          t.assigneeName.toLowerCase().includes(q) ||
          emailMatch;
        if (!inText) return false;
      }
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (dueFilter === 'overdue') {
        if (!isOverdue(t)) return false;
      } else if (dueFilter === 'has') {
        if (!t.dueDate) return false;
      } else if (dueFilter === 'none') {
        if (t.dueDate) return false;
      }
      if (assigneeFilter === 'me' && currentUser) {
        if (t.assigneeId !== currentUser.id) return false;
      } else if (assigneeFilter === 'none') {
        if (t.assigneeId) return false;
      } else if (assigneeFilter.startsWith('user:')) {
        const uid = assigneeFilter.slice('user:'.length);
        if (t.assigneeId !== uid) return false;
      }
      return true;
    });
  }, [tasks, search, priorityFilter, dueFilter, assigneeFilter, currentUser, userById]);

  const filteredTasks = useMemo(
    () => searchedTasks.filter((t) => matchesDateFilter(t, dateFilter)),
    [searchedTasks, dateFilter]
  );

  /** Tab counts reflect the other active filters, so they never promise rows the tab won't show. */
  const tabCounts = useMemo(() => {
    const counts = {} as Record<DateFilter, number>;
    for (const f of DATE_FILTERS) counts[f.id] = searchedTasks.filter((t) => matchesDateFilter(t, f.id)).length;
    return counts;
  }, [searchedTasks]);

  const byPriorityThenNewest = (a: Task, b: Task) => {
    const pa = PRIORITY_ORDER.indexOf(a.priority);
    const pb = PRIORITY_ORDER.indexOf(b.priority);
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  };

  const sortedInColumn = (status: string) =>
    [...filteredTasks.filter((t) => t.status === status)].sort(byPriorityThenNewest);

  /** Flat, sorted list backing the List and Grid views: overdue first, then priority. */
  const flatTasks = useMemo(
    () =>
      [...filteredTasks].sort((a, b) => {
        const oa = isOverdue(a) ? 0 : 1;
        const ob = isOverdue(b) ? 0 : 1;
        if (oa !== ob) return oa - ob;
        return byPriorityThenNewest(a, b);
      }),
    [filteredTasks]
  );

  const columnLabelById = useMemo(() => {
    const m = new Map(columns.map((c) => [c.id, c.label]));
    return (id: string) => m.get(id) ?? 'Other';
  }, [columns]);

  /** Tasks whose status doesn't match any current column — surfaced as an "Other" group at the end. */
  const orphanTasks = useMemo(() => {
    const ids = new Set(columns.map((c) => c.id));
    return filteredTasks.filter((t) => !ids.has(t.status));
  }, [filteredTasks, columns]);

  const stats = useMemo(() => {
    const active = tasks.filter((t) => t.status !== BUILT_IN_DONE_ID).length;
    const done = tasks.filter((t) => t.status === BUILT_IN_DONE_ID).length;
    const overdue = tasks.filter((t) => isOverdue(t)).length;
    return { active, done, overdue, total: tasks.length };
  }, [tasks]);

  const handleSave = (e: React.FormEvent<HTMLFormElement>, status: string) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const dueRaw = String(formData.get('dueDate') || '').trim();
    const { assigneeId, assigneeName } = resolveAssignee(formData, users);
    const title = String(formData.get('title') || '').trim();
    if (!title) return;
    const input: TaskInput = {
      title,
      description: String(formData.get('description') || '').trim(),
      status,
      // A new task with no date lands on today rather than nowhere — undated
      // tasks fall outside every date tab except All, so they get forgotten.
      dueDate: vancouverDateInputToIso(dueRaw || todayDateInput()),
      priority: (formData.get('priority') as TaskPriority) || 'medium',
      labels: parseLabelsInput(String(formData.get('labels') || '')),
      assigneeId,
      assigneeName,
      assigneeSince: assigneeId ? new Date().toISOString() : null,
    };
    setSaving(true);
    void (async () => {
      try {
        const created = await createTask(input);
        applyTasks([normalizeTask(created), ...tasks]);
        setIsAdding(null);
        form.reset();
      } catch (err) {
        // Leave the form populated so nothing typed is lost on a failed save.
        const msg = err instanceof Error ? err.message : 'Please try again.';
        toast.error('Could not create the task', { description: msg });
      } finally {
        setSaving(false);
      }
    })();
  };

  const handleDetailSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!detailTask) return;
    const formData = new FormData(e.currentTarget);
    const dueRaw = String(formData.get('dueDate') || '').trim();
    const { assigneeId, assigneeName } = resolveAssignee(formData, users);
    const assigneeChanged = detailTask.assigneeId !== assigneeId;
    const assigneeSince = !assigneeId
      ? null
      : assigneeChanged
        ? new Date().toISOString()
        : detailTask.assigneeSince ?? detailTask.createdAt;
    const title = String(formData.get('title') || '').trim();
    if (!title) return;
    const input: TaskInput = {
      title,
      description: String(formData.get('description') || '').trim(),
      status: String(formData.get('status') || detailTask.status),
      priority: (formData.get('priority') as TaskPriority) || 'medium',
      dueDate: dueRaw ? vancouverDateInputToIso(dueRaw) : null,
      labels: parseLabelsInput(String(formData.get('labels') || '')),
      assigneeId,
      assigneeName,
      assigneeSince,
    };
    const id = detailTask.id;
    setSaving(true);
    void (async () => {
      try {
        const saved = normalizeTask(await updateTask(id, input));
        applyTasks(tasks.map((t) => (t.id === id ? saved : t)));
        setDetailTask(saved);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Please try again.';
        toast.error('Could not save the task', { description: msg });
      } finally {
        setSaving(false);
      }
    })();
  };

  /** Optimistic status change — drag and the ‹ › buttons both land here. */
  const moveTask = (id: string, newStatus: string) => {
    const previous = tasks;
    applyTasks(tasks.map((t) => (t.id === id ? { ...t, status: newStatus } : t)));
    setDetailTask((d) => (d && d.id === id ? { ...d, status: newStatus } : d));
    void (async () => {
      try {
        await updateTask(id, { status: newStatus });
      } catch (err) {
        applyTasks(previous);
        const revert = previous.find((t) => t.id === id) ?? null;
        setDetailTask((d) => (d && d.id === id ? revert : d));
        const msg = err instanceof Error ? err.message : 'Please try again.';
        toast.error('Could not move the task', { description: msg });
      }
    })();
  };

  const handleKanbanDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleKanbanDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const newStatus = resolveDropColumn(String(over.id), columns.map((c) => c.id), tasks);
    if (!newStatus) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    moveTask(taskId, newStatus);
  };

  const executeDeleteTask = (id: string) => {
    void (async () => {
      try {
        await deleteTask(id);
        applyTasks(tasks.filter((t) => t.id !== id));
        setDetailTask((d) => (d?.id === id ? null : d));
        setTaskDeleteId(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Please try again.';
        toast.error('Could not delete the task', { description: msg });
      }
    })();
  };

  // ── Column management ────────────────────────────────────────────────────
  const addColumn = () => {
    const label = newColumnLabel.trim();
    if (!label) return;
    const id = generateColumnId(label, columns);
    // Insert before the Done column so Done stays visually rightmost.
    const doneIdx = columns.findIndex((c) => c.id === BUILT_IN_DONE_ID);
    const next = [...columns];
    const insertAt = doneIdx >= 0 ? doneIdx : next.length;
    next.splice(insertAt, 0, { id, label, builtin: false });
    void persistColumns(next);
    setIsAddingColumn(false);
    setNewColumnLabel('');
  };

  const renameColumn = (id: string) => {
    const label = editingColumnLabel.trim();
    if (!label) return;
    void persistColumns(columns.map((c) => (c.id === id ? { ...c, label } : c)));
    setEditingColumnId(null);
    setEditingColumnLabel('');
  };

  const moveColumn = (id: string, dir: -1 | 1) => {
    const idx = columns.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= columns.length) return;
    const next = [...columns];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    void persistColumns(next);
  };

  const executeDeleteColumn = (id: string) => {
    if (id === BUILT_IN_DONE_ID) {
      setColumnDeleteId(null);
      return;
    }
    const remaining = columns.filter((c) => c.id !== id);
    const fallback = remaining.find((c) => c.id === 'todo')?.id ?? remaining[0]?.id ?? BUILT_IN_DONE_ID;
    const orphaned = tasks.filter((t) => t.status === id);
    setColumnDeleteId(null);
    void (async () => {
      // Re-home the tasks first — a column removal that succeeded while its
      // tasks kept a dead status would strand them in the "Other" group.
      try {
        await Promise.all(orphaned.map((t) => updateTask(t.id, { status: fallback })));
        applyTasks(tasks.map((t) => (t.status === id ? { ...t, status: fallback } : t)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Please try again.';
        toast.error('Could not move the tasks out of that column', { description: msg });
        return;
      }
      await persistColumns(remaining);
    })();
  };

  const taskPendingDelete = taskDeleteId ? tasks.find((t) => t.id === taskDeleteId) : null;
  const columnPendingDelete = columnDeleteId ? columns.find((c) => c.id === columnDeleteId) : null;
  const tasksInDeletingColumn = columnDeleteId ? tasks.filter((t) => t.status === columnDeleteId).length : 0;

  const acksNow = currentUser ? readAssignmentAcks(currentUser.id) : ({} as Record<string, string>);

  const activeDragTask = activeDragId ? tasks.find((t) => t.id === activeDragId) : null;

  return (
    <div>
      <ConfirmDialog
        open={taskDeleteId !== null}
        title="Delete this task?"
        message={
          taskPendingDelete
            ? `Permanently remove “${taskPendingDelete.title}”? This cannot be undone.`
            : 'Permanently remove this task? This cannot be undone.'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => taskDeleteId && executeDeleteTask(taskDeleteId)}
        onCancel={() => setTaskDeleteId(null)}
      />

      <ConfirmDialog
        open={columnDeleteId !== null}
        title="Delete this column?"
        message={
          columnPendingDelete
            ? tasksInDeletingColumn > 0
              ? `Remove the “${columnPendingDelete.label}” column? ${tasksInDeletingColumn} task(s) will move to the To do column.`
              : `Remove the “${columnPendingDelete.label}” column?`
            : 'Remove this column?'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => columnDeleteId && executeDeleteColumn(columnDeleteId)}
        onCancel={() => setColumnDeleteId(null)}
      />

      <p className="page-kicker">Operations</p>
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <h1 className="mb-2">Tasks</h1>
          <p>
            {filteredTasks.length}{' '}
            {dateFilter === 'today'
              ? 'due today or overdue'
              : dateFilter === 'upcoming'
                ? 'upcoming'
                : dateFilter === 'done'
                  ? 'completed'
                  : 'total'}{' '}
            {filteredTasks.length === 1 ? 'task' : 'tasks'}
            {viewMode === 'board' ? ' · drag cards between columns to change status' : ''}
          </p>
        </div>
        {viewMode !== 'board' && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsAdding(columns.find((c) => c.id !== BUILT_IN_DONE_ID)?.id ?? columns[0]?.id ?? 'todo')}
          >
            <Plus size={16} /> New task
          </button>
        )}
      </div>

      {currentUser && inboxCount > 0 && (
        <div className="task-inbox-banner">
          <div className="task-inbox-banner__text">
            <Bell size={18} className="task-inbox-banner__icon" aria-hidden />
            <div>
              <p className="task-inbox-banner__title">
                {inboxCount === 1
                  ? 'You have 1 new assignment'
                  : `You have ${inboxCount} new assignments`}
              </p>
              <p className="task-inbox-banner__hint">
                Open a card to mark it seen, or dismiss all. Alerts (if enabled) fire when new work is assigned to you.
              </p>
            </div>
          </div>
          <div className="task-inbox-banner__actions">
            {typeof Notification !== 'undefined' && notifyPermission === 'default' && (
              <button type="button" className="btn btn-secondary" onClick={() => void requestBrowserNotify()}>
                Enable browser alerts
              </button>
            )}
            {typeof Notification !== 'undefined' && notifyPermission === 'denied' && (
              <span className="task-inbox-banner__muted">Notifications blocked in browser settings</span>
            )}
            <button type="button" className="btn btn-primary" onClick={markAllAssignmentsSeen}>
              Mark all seen
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
          <p style={{ margin: 0 }}>Loading tasks…</p>
        </div>
      ) : loadError ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
          <p style={{ margin: 0 }}>Could not load tasks.</p>
          <p className="text-sm" style={{ marginBottom: 0 }}>{loadError}</p>
        </div>
      ) : (
        <>
      <div className="kanban-stats">
        <span className="kanban-stat">{stats.total} total</span>
        <span className="kanban-stat">{stats.active} active</span>
        <span className="kanban-stat">{stats.done} completed</span>
        {stats.overdue > 0 && (
          <span className="kanban-stat" style={{ borderColor: 'rgba(220, 38, 38, 0.35)', color: '#b91c1c' }}>
            {stats.overdue} overdue
          </span>
        )}
      </div>

      <div className="task-viewbar">
        <div className="task-tabs" role="tablist" aria-label="Filter tasks by due date">
          {DATE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={dateFilter === f.id}
              className={`task-tab${dateFilter === f.id ? ' task-tab--active' : ''}`}
              onClick={() => changeDateFilter(f.id)}
            >
              {f.label}
              <span className="task-tab__count">{tabCounts[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="task-viewswitch" role="group" aria-label="Task view">
          {VIEW_MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={viewMode === id}
              title={`${label} view`}
              className={`task-viewswitch__btn${viewMode === id ? ' task-viewswitch__btn--active' : ''}`}
              onClick={() => changeViewMode(id)}
            >
              <Icon size={15} aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="kanban-toolbar">
        <div className="kanban-toolbar__grow" style={{ position: 'relative' }}>
          <Search
            size={18}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            type="search"
            placeholder="Search title, notes, labels, assignee…"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
            aria-label="Search tasks"
            style={{ paddingLeft: '2.5rem', margin: 0 }}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <label className="text-sm font-semibold text-muted" style={{ margin: 0 }}>
            Priority
          </label>
          <select
            value={priorityFilter}
            onChange={(ev) => setPriorityFilter(ev.target.value as TaskPriority | 'all')}
            style={{ width: 'auto', minWidth: '9rem', margin: 0 }}
          >
            <option value="all">All</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <label className="text-sm font-semibold text-muted" style={{ margin: 0 }}>
            Due
          </label>
          <select
            value={dueFilter}
            onChange={(ev) => setDueFilter(ev.target.value as typeof dueFilter)}
            style={{ width: 'auto', minWidth: '10rem', margin: 0 }}
          >
            <option value="all">Any</option>
            <option value="overdue">Overdue</option>
            <option value="has">Has due date</option>
            <option value="none">No due date</option>
          </select>
          <label className="text-sm font-semibold text-muted" style={{ margin: 0 }}>
            Assignee
          </label>
          <select
            value={assigneeFilter}
            onChange={(ev) => setAssigneeFilter(ev.target.value)}
            style={{ width: 'auto', minWidth: '12rem', margin: 0 }}
          >
            <option value="all">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={`user:${u.id}`}>
                {assigneeSelectLabel(u)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {viewMode !== 'board' && isAdding !== null && (
        <form onSubmit={(e) => handleSave(e, isAdding)} className="kanban-quick-form task-quick-form">
          <div className="kanban-quick-field">
            <label htmlFor="qt-flat-title">Title</label>
            <input id="qt-flat-title" name="title" required autoFocus placeholder="Short title" />
          </div>
          <div className="kanban-quick-field">
            <label htmlFor="qt-flat-desc">Description (optional)</label>
            <textarea id="qt-flat-desc" name="description" rows={3} placeholder="Details, links, checklist…" />
          </div>
          <div className="kanban-quick-row">
            <div className="kanban-quick-field">
              <label htmlFor="qt-flat-status">Column</label>
              {/* Drives the `status` argument passed to handleSave, not a form field. */}
              <select id="qt-flat-status" value={isAdding} onChange={(e) => setIsAdding(e.target.value)}>
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="kanban-quick-field">
              <label htmlFor="qt-flat-assign">Assignee</label>
              <select id="qt-flat-assign" name="assigneeId" defaultValue="">
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {assigneeSelectLabel(u)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="kanban-quick-row">
            <div className="kanban-quick-field">
              <label htmlFor="qt-flat-pri">Priority</label>
              <select id="qt-flat-pri" name="priority" defaultValue="medium">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="kanban-quick-field">
              <label htmlFor="qt-flat-due">Due</label>
              <input id="qt-flat-due" name="dueDate" type="date" defaultValue={todayDateInput()} />
            </div>
          </div>
          <div className="kanban-quick-field">
            <label htmlFor="qt-flat-lab">Labels</label>
            <input id="qt-flat-lab" name="labels" placeholder="e.g. Safety, Admin (comma-separated)" />
          </div>
          <div className="flex justify-between items-center" style={{ marginTop: '0.25rem' }}>
            <button type="button" className="btn-ghost-link" onClick={() => setIsAdding(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ padding: '0.45rem 1rem' }} disabled={saving}>
              {saving ? 'Adding…' : 'Add task'}
            </button>
          </div>
        </form>
      )}

      {viewMode !== 'board' &&
        (flatTasks.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <p style={{ margin: 0 }}>
              {dateFilter === 'today'
                ? 'Nothing due today. Check Upcoming for what is coming next.'
                : dateFilter === 'upcoming'
                  ? 'No upcoming tasks with a due date.'
                  : dateFilter === 'done'
                    ? 'No completed tasks yet.'
                    : 'No tasks match these filters.'}
            </p>
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'task-grid' : 'task-list'}>
            {flatTasks.map((task) => {
              const props = {
                task,
                statusLabel: columnLabelById(task.status),
                overdue: isOverdue(task),
                isNew: !!currentUser && isUnacknowledgedAssignment(task, currentUser.id, acksNow),
                accent: priorityAccent(task.priority),
                columns,
                onOpen: setDetailTask,
                onStatusChange: moveTask,
              };
              return viewMode === 'grid' ? (
                <TaskGridCard key={task.id} {...props} />
              ) : (
                <TaskListRow key={task.id} {...props} />
              );
            })}
          </div>
        ))}

      {viewMode === 'board' && (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleKanbanDragStart}
        onDragEnd={handleKanbanDragEnd}
      >
        <div className="kanban-board">
          {columns.map((column, idx) => {
            const list = sortedInColumn(column.id);
            const prevColId = idx > 0 ? columns[idx - 1].id : null;
            const nextColId = idx < columns.length - 1 ? columns[idx + 1].id : null;
            const isLastColumn = idx === columns.length - 1;
            return (
              <div key={column.id} className="kanban-column">
                <div className="kanban-column__head">
                  {editingColumnId === column.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        renameColumn(column.id);
                      }}
                      style={{ display: 'flex', gap: '0.4rem', flex: 1 }}
                    >
                      <input
                        type="text"
                        value={editingColumnLabel}
                        autoFocus
                        onChange={(e) => setEditingColumnLabel(e.target.value)}
                        onBlur={() => renameColumn(column.id)}
                        style={{ margin: 0, fontWeight: 600 }}
                      />
                    </form>
                  ) : (
                    <div className="kanban-column__title" style={{ flex: 1 }}>
                      {column.label}
                      <span className="kanban-count">{list.length}</span>
                    </div>
                  )}
                  <div className="kanban-column__menu" onClick={(e) => e.stopPropagation()}>
                    {idx > 0 && (
                      <button
                        type="button"
                        className="kanban-column__menu-btn"
                        title="Move column left"
                        aria-label="Move column left"
                        onClick={() => moveColumn(column.id, -1)}
                      >
                        <ArrowLeft size={14} />
                      </button>
                    )}
                    {!isLastColumn && (
                      <button
                        type="button"
                        className="kanban-column__menu-btn"
                        title="Move column right"
                        aria-label="Move column right"
                        onClick={() => moveColumn(column.id, 1)}
                      >
                        <ArrowRight size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="kanban-column__menu-btn"
                      title="Rename column"
                      aria-label="Rename column"
                      onClick={() => {
                        setEditingColumnId(column.id);
                        setEditingColumnLabel(column.label);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    {column.id !== BUILT_IN_DONE_ID && (
                      <button
                        type="button"
                        className="kanban-column__menu-btn"
                        title="Delete column"
                        aria-label="Delete column"
                        onClick={() => setColumnDeleteId(column.id)}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <KanbanColumnBody columnId={column.id}>
                  {list.map((task) => {
                    const overdue = isOverdue(task);
                    const accent = priorityAccent(task.priority);
                    const isNew =
                      !!currentUser &&
                      isUnacknowledgedAssignment(task, currentUser.id, acksNow);
                    return (
                      <KanbanTaskCard
                        key={task.id}
                        task={task}
                        columnId={column.id}
                        overdue={overdue}
                        isNew={isNew}
                        accent={accent}
                        prevColumnId={prevColId}
                        nextColumnId={nextColId}
                        moveTask={moveTask}
                        setDetailTask={setDetailTask}
                      />
                    );
                  })}
                </KanbanColumnBody>

                {isAdding === column.id ? (
                <form onSubmit={(e) => handleSave(e, column.id)} className="kanban-quick-form">
                  <div className="kanban-quick-field">
                    <label htmlFor={`qt-${column.id}-title`}>Title</label>
                    <input id={`qt-${column.id}-title`} name="title" required autoFocus placeholder="Short title" />
                  </div>
                  <div className="kanban-quick-field">
                    <label htmlFor={`qt-${column.id}-desc`}>Description (optional)</label>
                    <textarea id={`qt-${column.id}-desc`} name="description" rows={3} placeholder="Details, links, checklist…" />
                  </div>
                  <div className="kanban-quick-field">
                    <label htmlFor={`qt-${column.id}-assign`}>Assignee</label>
                    <select id={`qt-${column.id}-assign`} name="assigneeId" defaultValue="">
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {assigneeSelectLabel(u)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="kanban-quick-row">
                    <div className="kanban-quick-field">
                      <label htmlFor={`qt-${column.id}-pri`}>Priority</label>
                      <select id={`qt-${column.id}-pri`} name="priority" defaultValue="medium">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div className="kanban-quick-field">
                      <label htmlFor={`qt-${column.id}-due`}>Due</label>
                      <input id={`qt-${column.id}-due`} name="dueDate" type="date" defaultValue={todayDateInput()} />
                    </div>
                  </div>
                  <div className="kanban-quick-field">
                    <label htmlFor={`qt-${column.id}-lab`}>Labels</label>
                    <input id={`qt-${column.id}-lab`} name="labels" placeholder="e.g. Safety, Admin (comma-separated)" />
                  </div>
                  <div className="flex justify-between items-center" style={{ marginTop: '0.25rem' }}>
                    <button type="button" className="btn-ghost-link" onClick={() => setIsAdding(null)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.45rem 1rem' }} disabled={saving}>
                      {saving ? 'Adding…' : 'Add card'}
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" className="btn-add-card" onClick={() => setIsAdding(column.id)}>
                  <Plus size={16} /> Add a card
                </button>
              )}
              </div>
            );
          })}

          {/* Add column control / form */}
          <div className="kanban-column kanban-column--add">
            {isAddingColumn ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addColumn();
                }}
                className="kanban-quick-form"
                style={{ marginTop: 0 }}
              >
                <div className="kanban-quick-field">
                  <label htmlFor="qc-new-label">Column name</label>
                  <input
                    id="qc-new-label"
                    type="text"
                    autoFocus
                    placeholder="e.g. Blake to do"
                    value={newColumnLabel}
                    onChange={(e) => setNewColumnLabel(e.target.value)}
                  />
                </div>
                <div className="flex justify-between items-center" style={{ marginTop: '0.25rem' }}>
                  <button
                    type="button"
                    className="btn-ghost-link"
                    onClick={() => {
                      setIsAddingColumn(false);
                      setNewColumnLabel('');
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ padding: '0.45rem 1rem' }}>
                    Add column
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="btn-add-card"
                style={{ minHeight: '5rem' }}
                onClick={() => setIsAddingColumn(true)}
              >
                <Plus size={16} /> Add column
              </button>
            )}
          </div>

          {orphanTasks.length > 0 && (
            <div className="kanban-column">
              <div className="kanban-column__head">
                <div className="kanban-column__title" style={{ flex: 1 }}>
                  Other
                  <span className="kanban-count">{orphanTasks.length}</span>
                </div>
              </div>
              <KanbanColumnBody columnId="__orphan__">
                {orphanTasks.map((task) => {
                  const overdue = isOverdue(task);
                  const accent = priorityAccent(task.priority);
                  const isNew = !!currentUser && isUnacknowledgedAssignment(task, currentUser.id, acksNow);
                  return (
                    <KanbanTaskCard
                      key={task.id}
                      task={task}
                      columnId={task.status}
                      overdue={overdue}
                      isNew={isNew}
                      accent={accent}
                      prevColumnId={null}
                      nextColumnId={columns[0]?.id ?? null}
                      moveTask={moveTask}
                      setDetailTask={setDetailTask}
                    />
                  );
                })}
              </KanbanColumnBody>
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDragTask ? (
            <div
              className={`kanban-card kanban-card--overlay${isOverdue(activeDragTask) ? ' kanban-card--overdue' : ''}`}
              style={{ ['--task-accent' as string]: priorityAccent(activeDragTask.priority), width: 300 }}
            >
              <div className="flex items-start gap-2">
                <span
                  className="priority-dot"
                  style={{ marginTop: '0.35rem', background: priorityAccent(activeDragTask.priority) }}
                />
                <h3 className="kanban-card__title" style={{ flex: 1, margin: 0 }}>
                  {activeDragTask.title}
                </h3>
              </div>
              <span className="kanban-card__meta" style={{ marginTop: '0.5rem' }}>
                <Flag size={12} />
                {activeDragTask.priority}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      )}
        </>
      )}

      {detailTask && (
        <div className="modal-overlay" role="presentation" onClick={() => setDetailTask(null)}>
          <div
            className="modal-panel modal-panel--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-detail-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <button
              type="button"
              className="btn-icon"
              style={{ float: 'right', margin: '-0.5rem -0.5rem 0 0' }}
              onClick={() => setDetailTask(null)}
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <p className="page-kicker" style={{ marginBottom: '0.35rem' }}>
              Task
            </p>
            <h2 id="task-detail-title" className="modal-panel__title">
              {detailTask.title}
            </h2>
            <form key={detailTask.id} onSubmit={handleDetailSave} className="flex flex-col gap-4" style={{ marginTop: '1rem' }}>
              <div>
                <label htmlFor="dt-title">Title</label>
                <input id="dt-title" name="title" required defaultValue={detailTask.title} />
              </div>
              <div>
                <label htmlFor="dt-desc">Description</label>
                <textarea id="dt-desc" name="description" rows={4} defaultValue={detailTask.description} />
              </div>
              <div>
                <label htmlFor="dt-assignee">Assignee</label>
                <select id="dt-assignee" name="assigneeId" defaultValue={detailTask.assigneeId ?? ''}>
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {assigneeSelectLabel(u)}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label htmlFor="dt-status">Column</label>
                  <select id="dt-status" name="status" defaultValue={detailTask.status}>
                    {columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                    {!columns.some((c) => c.id === detailTask.status) && (
                      <option value={detailTask.status}>{detailTask.status}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label htmlFor="dt-priority">Priority</label>
                  <select id="dt-priority" name="priority" defaultValue={detailTask.priority}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="dt-due">Due date</label>
                <input
                  id="dt-due"
                  name="dueDate"
                  type="date"
                  defaultValue={vancouverDateInputFromIso(detailTask.dueDate)}
                />
              </div>
              <div>
                <label htmlFor="dt-labels">Labels (comma-separated)</label>
                <input id="dt-labels" name="labels" defaultValue={detailTask.labels.join(', ')} />
              </div>
              <p className="text-xs text-muted">Created {formatInVancouver(detailTask.createdAt, 'PPp')}</p>
              <div className="modal-panel__foot" style={{ justifyContent: 'space-between' }}>
                <button type="button" className="btn btn-danger" onClick={() => setTaskDeleteId(detailTask.id)}>
                  <Trash2 size={16} /> Delete
                </button>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-secondary" onClick={() => setDetailTask(null)}>
                    Close
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
