import { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { format, isBefore, startOfDay, isToday, parseISO } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';

const STORAGE_KEY = 'tasksBoard';

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
    dueDate = d.includes('T') ? d : `${d}T12:00:00.000Z`;
  }
  const aid = o.assigneeId != null && String(o.assigneeId).trim() !== '' ? String(o.assigneeId) : null;
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
  };
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
    return isBefore(startOfDay(parseISO(task.dueDate)), startOfDay(new Date()));
  } catch {
    return false;
  }
}

function resolveAssignee(formData: FormData, users: { id: string; name: string }[]) {
  const aid = String(formData.get('assigneeId') || '').trim();
  if (!aid) return { assigneeId: null as string | null, assigneeName: '' };
  const u = users.find((x) => x.id === aid);
  return { assigneeId: aid, assigneeName: u?.name ?? '' };
}

export default function Tasks() {
  const { users, currentUser } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isAdding, setIsAdding] = useState<TaskStatus | null>(null);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [dueFilter, setDueFilter] = useState<'all' | 'overdue' | 'has' | 'none'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<'all' | 'me' | 'none'>('all');
  const [taskDeleteId, setTaskDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as unknown[];
      setTasks(parsed.map(normalizeTask));
    } catch {
      setTasks([]);
    }
  }, []);

  const persist = (next: Task[]) => {
    setTasks(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (q) {
        const inText =
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.labels.some((l) => l.toLowerCase().includes(q)) ||
          t.assigneeName.toLowerCase().includes(q);
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
      }
      return true;
    });
  }, [tasks, search, priorityFilter, dueFilter, assigneeFilter, currentUser]);

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
    const newTask: Task = {
      id: Math.random().toString(36).slice(2, 11),
      title: String(formData.get('title') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      status,
      createdAt: new Date().toISOString(),
      dueDate: dueRaw ? `${dueRaw}T12:00:00.000Z` : null,
      priority: (formData.get('priority') as TaskPriority) || 'medium',
      labels: parseLabelsInput(String(formData.get('labels') || '')),
      assigneeId,
      assigneeName,
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
    const updated: Task = {
      ...detailTask,
      title: String(formData.get('title') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      status: formData.get('status') as TaskStatus,
      priority: (formData.get('priority') as TaskPriority) || 'medium',
      dueDate: dueRaw ? `${dueRaw}T12:00:00.000Z` : null,
      labels: parseLabelsInput(String(formData.get('labels') || '')),
      assigneeId,
      assigneeName,
    };
    if (!updated.title) return;
    persist(tasks.map((t) => (t.id === updated.id ? updated : t)));
    setDetailTask(updated);
  };

  const moveTask = (id: string, newStatus: TaskStatus) => {
    persist(tasks.map((t) => (t.id === id ? { ...t, status: newStatus } : t)));
    setDetailTask((d) => (d && d.id === id ? { ...d, status: newStatus } : d));
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
          <p>Assign work to team members, priorities, and due dates — board-style workflow.</p>
        </div>
      </div>

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
            onChange={(ev) => setAssigneeFilter(ev.target.value as typeof assigneeFilter)}
            style={{ width: 'auto', minWidth: '10rem', margin: 0 }}
          >
            <option value="all">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
          </select>
        </div>
      </div>

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

              <div className="kanban-column__body">
                {list.map((task) => {
                  const overdue = isOverdue(task);
                  const accent = priorityAccent(task.priority);
                  return (
                    <div
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      className={`kanban-card${overdue ? ' kanban-card--overdue' : ''}`}
                      style={{ ['--task-accent' as string]: accent }}
                      onClick={() => setDetailTask(task)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          setDetailTask(task);
                        }
                      }}
                    >
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
                              {isToday(parseISO(task.dueDate)) ? 'Today' : format(parseISO(task.dueDate), 'MMM d')}
                              {overdue ? ' · Overdue' : ''}
                            </span>
                          )}
                          <span className="kanban-card__meta">
                            <Flag size={12} />
                            {task.priority}
                          </span>
                        </div>
                        <div className="kanban-card__actions" onClick={(ev) => ev.stopPropagation()}>
                          {column.id !== 'todo' && (
                            <button
                              type="button"
                              className="kanban-card__move"
                              title="Move back"
                              onClick={() => moveTask(task.id, column.id === 'done' ? 'in-progress' : 'todo')}
                            >
                              <ChevronLeft size={14} style={{ verticalAlign: 'middle' }} />
                            </button>
                          )}
                          {column.id !== 'done' && (
                            <button
                              type="button"
                              className="kanban-card__move"
                              title="Move forward"
                              onClick={() => moveTask(task.id, column.id === 'todo' ? 'in-progress' : 'done')}
                            >
                              <ChevronRight size={14} style={{ verticalAlign: 'middle' }} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

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
                          {u.name}
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
                      {u.name}
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
                  defaultValue={detailTask.dueDate ? format(parseISO(detailTask.dueDate), 'yyyy-MM-dd') : ''}
                />
              </div>
              <div>
                <label htmlFor="dt-labels">Labels (comma-separated)</label>
                <input id="dt-labels" name="labels" defaultValue={detailTask.labels.join(', ')} />
              </div>
              <p className="text-xs text-muted">Created {format(parseISO(detailTask.createdAt), 'PPp')}</p>
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
