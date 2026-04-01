/** Tracks which task assignments each user has acknowledged (for inbox + notifications). */

export const TASKS_STORAGE_KEY = 'tasksBoard';

const ackStorageKey = (userId: string) => `taskAssigneeAck:${userId}`;

export type TaskAssignmentFields = {
  id: string;
  assigneeId: string | null;
  assigneeSince: string | null;
  status: string;
};

function parseAcks(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function readAssignmentAcks(userId: string): Record<string, string> {
  return parseAcks(localStorage.getItem(ackStorageKey(userId)));
}

export function writeAssignmentAcks(userId: string, map: Record<string, string>) {
  localStorage.setItem(ackStorageKey(userId), JSON.stringify(map));
}

export function acknowledgeAssignment(userId: string, taskId: string, assigneeSince: string | null) {
  if (!assigneeSince) return;
  const m = readAssignmentAcks(userId);
  m[taskId] = assigneeSince;
  writeAssignmentAcks(userId, m);
}

export function acknowledgeAllAssignments(userId: string, tasks: TaskAssignmentFields[]) {
  const m = readAssignmentAcks(userId);
  for (const t of tasks) {
    if (t.assigneeId === userId && t.assigneeSince && t.status !== 'done') {
      m[t.id] = t.assigneeSince;
    }
  }
  writeAssignmentAcks(userId, m);
}

export function isUnacknowledgedAssignment(task: TaskAssignmentFields, userId: string, acks: Record<string, string>) {
  if (task.status === 'done') return false;
  if (task.assigneeId !== userId) return false;
  if (!task.assigneeSince) return false;
  return acks[task.id] !== task.assigneeSince;
}

export function parseTasksFromStorage(raw: string | null): TaskAssignmentFields[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr.map((row) => {
      const o = row as Record<string, unknown>;
      const assigneeId =
        o.assigneeId != null && String(o.assigneeId).trim() !== '' ? String(o.assigneeId) : null;
      let assigneeSince: string | null = null;
      if (o.assigneeSince != null && String(o.assigneeSince).trim() !== '') {
        assigneeSince = String(o.assigneeSince);
      } else if (assigneeId) {
        assigneeSince = String(o.createdAt ?? new Date().toISOString());
      }
      const st = String(o.status ?? 'todo');
      return {
        id: String(o.id ?? ''),
        assigneeId,
        assigneeSince,
        status: st,
      };
    });
  } catch {
    return [];
  }
}

export function countUnacknowledgedForUser(userId: string | null): number {
  if (!userId) return 0;
  const tasks = parseTasksFromStorage(localStorage.getItem(TASKS_STORAGE_KEY));
  const acks = readAssignmentAcks(userId);
  return tasks.filter((t) => isUnacknowledgedAssignment(t, userId, acks)).length;
}

export function listUnacknowledgedForUser(userId: string | null): TaskAssignmentFields[] {
  if (!userId) return [];
  const tasks = parseTasksFromStorage(localStorage.getItem(TASKS_STORAGE_KEY));
  const acks = readAssignmentAcks(userId);
  return tasks.filter((t) => isUnacknowledgedAssignment(t, userId, acks));
}
