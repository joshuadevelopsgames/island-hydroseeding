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
  Circle,
  Loader2,
  CheckCircle2,
  Search,
  Flag,
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
  UserCircle,
  Bell,
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
import {
  TASKS_STORAGE_KEY,
  acknowledgeAllAssignments,
  acknowledgeAssignment,
  isUnacknowledgedAssignment,
  readAssignmentAcks,
} from '../lib/taskAssignments';

const STORAGE_KEY = TASKS_STORAGE_KEY;

type TaskStatus = 'todo' | 'in-progress' | 'done';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
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
  const st = String(o.status);
  const status: TaskStatus =
    st === 'in-progress' || st === 'done' || st === 'todo' ? st : 'todo';
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
  if (task.status === 'done' || !task.dueDate) return false;
  try {
    return isBefore(vancouverStartOfDay(task.dueDate), vancouverStartOfDay());
  } catch {
    return false;
  }
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

function resolveDropColumn(overId: string, allTasks: Task[]): TaskStatus | null {
  if (overId === 'todo' || overId === 'in-progress' || overId === 'done') return overId;
  const t = allTasks.find((x) => x.id === overId);
  return t?.status ?? null;
}

type KanbanTaskCardProps = {
  task: Task;
  columnId: TaskStatus;
  overdue: boolean;
  isNew: boolean;
  accent: string;
  moveTask: (id: string, s: TaskStatus) => void;
  setDetailTask: (t: Task | null) => void;
};

function KanbanTaskCard({
  task,
  columnId,
  overdue,
  isNew,
  accent,
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
          {columnId !== 'todo' && (
            <button
              type="button"
              className="kanban-card__move"
              title="Move back"
              onClick={() => moveTask(task.id, columnId === 'done' ? 'in-progress' : 'todo')}
            >
              <ChevronLeft size={14} style={{ verticalAlign: 'middle' }} />
            </button>
          )}
          {columnId !== 'done' && (
            <button
              type="button"
              className="kanban-card__move"
              title="Move forward"
              onClick={() => moveTask(task.id, columnId === 'todo' ? 'in-progress' : 'done')}
            >
              <ChevronRight size={14} style={{ verticalAlign: 'middle' }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type KanbanColumnBodyProps = {
  columnId: TaskStatus;
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
  const [isAdding, setIsAdding] = useState<TaskStatus | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [dueFilter, setDueFilter] = useState<'all' | 'overdue' | 'has' | 'none'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [taskDeleteId, setTaskDeleteId] = useState<string | null>(null);
  const [notifyPermission, setNotifyPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as unknown[];
      setTasks(reconcileAssignees(parsed.map(normalizeTask), users));
    } catch {
      setTasks([]);
    }
    // Initial load only; team updates handled by reconcile effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTasks((prev) => {
      if (prev.length === 0) return prev;
      const next = reconcileAssignees(prev, users);
      if (!tasksAssigneeReconcileChanged(prev, next)) return prev;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event('tasks-updated'));
      return next;
    });
  }, [users]);

  const persist = (next: Task[]) => {
    const reconciled = reconcileAssignees(next, users);
    setTasks(reconciled);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reconciled));
    window.dispatchEvent(new Event('tasks-updated'));
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

  const filteredTasks = useMemo(() => {
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

  const sortedInColumn = (status: TaskStatus) =>
    [...filteredTasks.filter((t) => t.status === status)].sort((a, b) => {
      const pa = PRIORITY_ORDER.indexOf(a.priority);
      const pb = PRIORITY_ORDER.indexOf(b.priority);
      if (pa !== pb) return pa - pb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const stats = useMemo(() => {
    const active = tasks.filter((t) => t.status !== 'done').length;
    const done = tasks.filter((t) => t.status === 'done').length;
    const overdue = tasks.filter((t) => isOverdue(t)).length;
    return { active, done, overdue, total: tasks.length };
  }, [tasks]);

  const handleSave = (e: React.FormEvent<HTMLFormElement>, status: TaskStatus) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const dueRaw = String(formData.get('dueDate') || '').trim();
    const { assigneeId, assigneeName } = resolveAssignee(formData, users);
    const createdAt = new Date().toISOString();
    const newTask: Task = {
      id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 11),
      title: String(formData.get('title') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      status,
      createdAt,
      dueDate: dueRaw ? vancouverDateInputToIso(dueRaw) : null,
      priority: (formData.get('priority') as TaskPriority) || 'medium',
      labels: parseLabelsInput(String(formData.get('labels') || '')),
      assigneeId,
      assigneeName,
      assigneeSince: assigneeId ? createdAt : null,
    };
    if (!newTask.title) return;
    persist([newTask, ...tasks]);
    setIsAdding(null);
    e.currentTarget.reset();
  };

  const handleDetailSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!detailTask) return;
    const formData = new FormData(e.currentTarget);
    const dueRaw = String(formData.get('dueDate') || '').trim();
    const { assigneeId, assigneeName } = resolveAssignee(formData, users);
    const assigneeChanged = detailTask.assigneeId !== assigneeId;
    const assigneeSince =
      !assigneeId
        ? null
        : assigneeChanged
          ? new Date().toISOString()
          : detailTask.assigneeSince ?? detailTask.createdAt;
    const updated: Task = {
      ...detailTask,
      title: String(formData.get('title') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      status: formData.get('status') as TaskStatus,
      priority: (formData.get('priority') as TaskPriority) || 'medium',
      dueDate: dueRaw ? vancouverDateInputToIso(dueRaw) : null,
      labels: parseLabelsInput(String(formData.get('labels') || '')),
      assigneeId,
      assigneeName,
      assigneeSince,
    };
    if (!updated.title) return;
    persist(tasks.map((t) => (t.id === updated.id ? updated : t)));
    setDetailTask(updated);
  };

  const moveTask = (id: string, newStatus: TaskStatus) => {
    persist(tasks.map((t) => (t.id === id ? { ...t, status: newStatus } : t)));
    setDetailTask((d) => (d && d.id === id ? { ...d, status: newStatus } : d));
  };

  const handleKanbanDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleKanbanDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const newStatus = resolveDropColumn(String(over.id), tasks);
    if (!newStatus) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    moveTask(taskId, newStatus);
  };

  const executeDeleteTask = (id: string) => {
    persist(tasks.filter((t) => t.id !== id));
    setDetailTask((d) => (d?.id === id ? null : d));
    setTaskDeleteId(null);
  };

  const columns: { id: TaskStatus; label: string; icon: typeof Circle }[] = [
    { id: 'todo', label: 'To do', icon: Circle },
    { id: 'in-progress', label: 'In progress', icon: Loader2 },
    { id: 'done', label: 'Done', icon: CheckCircle2 },
  ];

  const taskPendingDelete = taskDeleteId ? tasks.find((t) => t.id === taskDeleteId) : null;

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

      <p className="page-kicker">Operations</p>
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <h1 className="mb-2">Tasks</h1>
          <p>
            Assign work to people from <strong>Team &amp; access</strong> (not generic roles). New assignments surface
            in the banner below and in the sidebar; optional browser alerts when you allow notifications.
          </p>
        </div>
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleKanbanDragStart}
        onDragEnd={handleKanbanDragEnd}
      >
        <div className="kanban-board">
          {columns.map((column) => {
            const Icon = column.icon;
            const list = sortedInColumn(column.id);
            return (
              <div key={column.id} className="kanban-column">
                <div className="kanban-column__head">
                  <div className="kanban-column__title">
                    <Icon size={16} strokeWidth={2.25} />
                    {column.label}
                    <span className="kanban-count">{list.length}</span>
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
                      <input id={`qt-${column.id}-due`} name="dueDate" type="date" />
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
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.45rem 1rem' }}>
                      Add card
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
                    <option value="todo">To do</option>
                    <option value="in-progress">In progress</option>
                    <option value="done">Done</option>
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
                  <button type="submit" className="btn btn-primary">
                    Save
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
