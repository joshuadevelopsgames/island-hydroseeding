import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  Play,
  Square,
  Calendar as CalendarIcon,
  History,
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  format,
  differenceInMinutes,
  parseISO,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  startOfMonth,
  endOfMonth,
  isSameMonth,
  addMonths,
  subMonths,
} from 'date-fns';
import AlertDialog from '../components/AlertDialog';
import ConfirmDialog from '../components/ConfirmDialog';

const LOGS_KEY = 'timeLogs';
const EMPLOYEES_KEY = 'timeEmployees';
const LAST_EMPLOYEE_KEY = 'timeLastEmployeeId';

type Employee = {
  id: string;
  name: string;
};

type TimeLog = {
  id: string;
  employeeId: string | null;
  employeeName: string;
  clockIn: string;
  clockOut: string | null;
};

function normalizeLog(raw: unknown): TimeLog {
  const o = raw as Record<string, unknown>;
  return {
    id: String(o.id ?? ''),
    employeeId: o.employeeId != null && o.employeeId !== '' ? String(o.employeeId) : null,
    employeeName: String(o.employeeName ?? ''),
    clockIn: String(o.clockIn ?? new Date().toISOString()),
    clockOut: o.clockOut == null || o.clockOut === '' ? null : String(o.clockOut),
  };
}

function toDatetimeLocalValue(iso: string) {
  return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm");
}

function fromDatetimeLocalValue(s: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function Time() {
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeLog, setActiveLog] = useState<TimeLog | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [editingLog, setEditingLog] = useState<TimeLog | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingMemberName, setEditingMemberName] = useState('');
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [alertDialog, setAlertDialog] = useState<{ title: string; message: string } | null>(null);
  const [confirmDeleteMemberId, setConfirmDeleteMemberId] = useState<string | null>(null);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);

  const persistLogs = useCallback((next: TimeLog[]) => {
    setLogs(next);
    localStorage.setItem(LOGS_KEY, JSON.stringify(next));
  }, []);

  const persistEmployees = useCallback((next: Employee[]) => {
    setEmployees(next);
    localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    const rawLogs = localStorage.getItem(LOGS_KEY);
    let logsData: TimeLog[] = [];
    if (rawLogs) {
      try {
        const parsed = JSON.parse(rawLogs) as unknown[];
        logsData = parsed.map(normalizeLog);
      } catch {
        logsData = [];
      }
    }
    setLogs(logsData);
    const active = logsData.find((log) => log.clockOut === null);
    if (active) setActiveLog(active);

    const rawEmp = localStorage.getItem(EMPLOYEES_KEY);
    let empData: Employee[] = [];
    if (rawEmp) {
      try {
        const parsed = JSON.parse(rawEmp) as Employee[];
        empData = Array.isArray(parsed)
          ? parsed.filter((e) => e && typeof e.name === 'string').map((e) => ({ id: String(e.id), name: e.name }))
          : [];
      } catch {
        empData = [];
      }
    }
    if (!rawEmp) {
      localStorage.setItem(EMPLOYEES_KEY, JSON.stringify([]));
    }
    setEmployees(empData);

    const lastId = localStorage.getItem(LAST_EMPLOYEE_KEY);
    if (lastId && empData.some((e) => e.id === lastId)) {
      setSelectedEmployeeId(lastId);
    } else if (empData.length === 1) {
      setSelectedEmployeeId(empData[0].id);
    }
  }, []);

  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => parseISO(b.clockIn).getTime() - parseISO(a.clockIn).getTime()),
    [logs]
  );

  const resolveName = useCallback(
    (employeeId: string | null, fallback: string) => {
      if (!employeeId) return fallback || '—';
      const e = employees.find((x) => x.id === employeeId);
      return e?.name ?? fallback ?? '—';
    },
    [employees]
  );

  const handleAddEmployee = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('newEmployeeName') || '').trim();
    if (!name) return;
    const row: Employee = { id: Math.random().toString(36).slice(2, 11), name };
    const next = [...employees, row];
    persistEmployees(next);
    setSelectedEmployeeId(row.id);
    localStorage.setItem(LAST_EMPLOYEE_KEY, row.id);
    e.currentTarget.reset();
  };

  const saveMemberName = (id: string) => {
    const trimmed = editingMemberName.trim();
    if (!trimmed) return;
    const next = employees.map((x) => (x.id === id ? { ...x, name: trimmed } : x));
    persistEmployees(next);
    setEditingMemberId(null);
    persistLogs(
      logs.map((log) =>
        log.employeeId === id ? { ...log, employeeName: trimmed } : log
      )
    );
  };

  const executeDeleteEmployee = (id: string) => {
    const next = employees.filter((x) => x.id !== id);
    persistEmployees(next);
    if (selectedEmployeeId === id) setSelectedEmployeeId(next[0]?.id ?? '');
    setEditingMemberId(null);
    setConfirmDeleteMemberId(null);
  };

  const handleClockIn = () => {
    if (!selectedEmployeeId || !employees.some((e) => e.id === selectedEmployeeId)) {
      setAlertDialog({
        title: 'Select a team member',
        message: 'Choose who is punching in before starting the clock.',
      });
      return;
    }
    const emp = employees.find((e) => e.id === selectedEmployeeId)!;
    const newLog: TimeLog = {
      id: Math.random().toString(36).slice(2, 11),
      employeeId: emp.id,
      employeeName: emp.name,
      clockIn: new Date().toISOString(),
      clockOut: null,
    };
    localStorage.setItem(LAST_EMPLOYEE_KEY, emp.id);
    const updated = [newLog, ...logs];
    persistLogs(updated);
    setActiveLog(newLog);
  };

  const handleClockOut = () => {
    if (!activeLog) return;
    const clockOutTime = new Date().toISOString();
    const updated = logs.map((log) =>
      log.id === activeLog.id ? { ...log, clockOut: clockOutTime } : log
    );
    persistLogs(updated);
    setActiveLog(null);
  };

  const saveEditedLog = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingLog) return;
    const fd = new FormData(e.currentTarget);
    const empId = String(fd.get('editEmployeeId') || '');
    const emp = employees.find((x) => x.id === empId);
    const clockInIso = fromDatetimeLocalValue(String(fd.get('editClockIn') || ''));
    let clockOutIso: string | null = fromDatetimeLocalValue(String(fd.get('editClockOut') || ''));
    const outEmpty = String(fd.get('editClockOut') || '').trim() === '';

    if (!clockInIso) {
      setAlertDialog({
        title: 'Invalid clock-in',
        message: 'Clock-in time is not valid. Check the date and time.',
      });
      return;
    }
    if (outEmpty) {
      clockOutIso = null;
    } else if (!clockOutIso) {
      setAlertDialog({
        title: 'Invalid clock-out',
        message: 'Clock-out time is not valid. Check the date and time.',
      });
      return;
    }
    if (clockOutIso && parseISO(clockOutIso) <= parseISO(clockInIso)) {
      setAlertDialog({
        title: 'Invalid times',
        message: 'Clock-out must be after clock-in.',
      });
      return;
    }

    const otherActive = logs.some((l) => l.id !== editingLog.id && l.clockOut === null);
    if (clockOutIso === null && otherActive) {
      setAlertDialog({
        title: 'Open shift already exists',
        message: 'Another shift is already open. Close it first or set a clock-out on this entry.',
      });
      return;
    }

    let nextId: string | null = editingLog.employeeId;
    let nextName = editingLog.employeeName;
    if (emp) {
      nextId = emp.id;
      nextName = emp.name;
    } else if (employees.length > 0) {
      if (!empId) {
        setAlertDialog({
          title: 'Select a person',
          message: 'Choose a team member for this time entry.',
        });
        return;
      }
      if (empId === editingLog.employeeId) {
        nextId = editingLog.employeeId;
        nextName = editingLog.employeeName;
      }
    }

    const updatedRow: TimeLog = {
      ...editingLog,
      employeeId: nextId,
      employeeName: nextName,
      clockIn: clockInIso,
      clockOut: clockOutIso,
    };

    const updated = logs.map((l) => (l.id === editingLog.id ? updatedRow : l));
    persistLogs(updated);
    if (activeLog?.id === editingLog.id) {
      setActiveLog(clockOutIso === null ? updatedRow : null);
    }
    setEditingLog(null);
  };

  const executeDeleteLog = (id: string) => {
    const next = logs.filter((l) => l.id !== id);
    persistLogs(next);
    if (activeLog?.id === id) setActiveLog(null);
    if (editingLog?.id === id) setEditingLog(null);
    setConfirmDeleteLogId(null);
  };

  const calculateHours = (inTime: string, outTime: string | null) => {
    if (!outTime) return 'In progress';
    const mins = differenceInMinutes(parseISO(outTime), parseISO(inTime));
    return (mins / 60).toFixed(2) + ' hrs';
  };

  const weekTotal = useMemo(() => {
    const ref = new Date();
    const ws = startOfWeek(ref, { weekStartsOn: 1 });
    const we = endOfWeek(ref, { weekStartsOn: 1 });
    return logs
      .filter((log) => log.clockOut)
      .reduce((acc, log) => {
        const cin = parseISO(log.clockIn);
        if (cin < ws || cin > we) return acc;
        return acc + differenceInMinutes(parseISO(log.clockOut!), cin) / 60;
      }, 0);
  }, [logs]);

  const weekBars = useMemo(() => {
    const ref = new Date();
    const start = startOfWeek(ref, { weekStartsOn: 1 });
    const end = endOfWeek(ref, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });
    return days.map((day) => {
      let hours = 0;
      for (const log of logs) {
        if (!log.clockOut) continue;
        const cin = parseISO(log.clockIn);
        if (!isSameDay(cin, day)) continue;
        hours += differenceInMinutes(parseISO(log.clockOut), cin) / 60;
      }
      return { day: format(day, 'EEE'), hours: Math.round(hours * 10) / 10 };
    });
  }, [logs]);

  const chartMaxHours = useMemo(() => {
    const maxDay = Math.max(1, ...weekBars.map((b) => b.hours), weekTotal / 5);
    return Math.min(12, Math.ceil(maxDay * 1.15) || 10);
  }, [weekBars, weekTotal]);

  const monthDayRange = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) }),
    [viewMonth]
  );

  const monthBars = useMemo(() => {
    return monthDayRange.map((day) => {
      let hours = 0;
      for (const log of logs) {
        if (!log.clockOut) continue;
        const cin = parseISO(log.clockIn);
        if (!isSameDay(cin, day)) continue;
        hours += differenceInMinutes(parseISO(log.clockOut), cin) / 60;
      }
      return {
        date: day,
        dayNum: format(day, 'd'),
        weekday: format(day, 'EEE'),
        hours: Math.round(hours * 100) / 100,
      };
    });
  }, [logs, monthDayRange]);

  const monthChartMax = useMemo(() => {
    const maxH = Math.max(0.5, ...monthBars.map((b) => b.hours));
    return Math.min(14, Math.ceil(maxH * 1.2));
  }, [monthBars]);

  const monthTotalHours = useMemo(() => {
    return monthBars.reduce((a, b) => a + b.hours, 0);
  }, [monthBars]);

  const monthLogsSorted = useMemo(() => {
    return sortedLogs.filter((log) => isSameMonth(parseISO(log.clockIn), viewMonth));
  }, [sortedLogs, viewMonth]);

  const activeEmployeeLabel = activeLog
    ? resolveName(activeLog.employeeId, activeLog.employeeName)
    : null;

  return (
    <div>
      <AlertDialog
        open={alertDialog !== null}
        title={alertDialog?.title ?? ''}
        message={alertDialog?.message ?? ''}
        onClose={() => setAlertDialog(null)}
      />
      <ConfirmDialog
        open={confirmDeleteMemberId !== null}
        title="Remove team member?"
        message="Remove this person from the team list? Past time entries keep their saved names."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() =>
          confirmDeleteMemberId ? executeDeleteEmployee(confirmDeleteMemberId) : undefined
        }
        onCancel={() => setConfirmDeleteMemberId(null)}
      />
      <ConfirmDialog
        open={confirmDeleteLogId !== null}
        title="Delete time entry?"
        message="Remove this clock entry permanently? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => (confirmDeleteLogId ? executeDeleteLog(confirmDeleteLogId) : undefined)}
        onCancel={() => setConfirmDeleteLogId(null)}
      />

      <p className="page-kicker">Workforce</p>
      <div className="flex justify-between items-start mb-8 flex-wrap gap-4">
        <div>
          <h1 className="mb-2">Time tracking</h1>
          <p>Punch in by person, manage the team list, and correct entries when needed.</p>
        </div>
      </div>

      <div className="time-layout">
        <div className="flex flex-col gap-4">
          <div className="card flex flex-col items-stretch p-8">
            <div className="text-center mb-6">
              <Clock size={44} className="mb-3" style={{ color: 'var(--lawn-green)', margin: '0 auto' }} />
              <h2 className="mb-1" style={{ fontSize: '2rem', fontWeight: 700 }}>
                {format(new Date(), 'h:mm a')}
              </h2>
              <p className="text-secondary">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
            </div>

            {activeLog ? (
              <div className="w-full">
                <div
                  className="badge badge-gray mb-4 w-full justify-center p-3 status-live"
                  style={{ fontSize: '0.9375rem', background: 'linear-gradient(135deg, #e8f4fc, #f0f7ff)', color: '#0369a1', border: '1px solid rgba(3, 105, 161, 0.15)' }}
                >
                  <span className="status-live-dot" aria-hidden />
                  <span className="w-full text-left">
                    <strong>{activeEmployeeLabel}</strong>
                    <span className="text-secondary font-normal"> · in since {format(parseISO(activeLog.clockIn), 'h:mm a')}</span>
                  </span>
                </div>
                <button className="btn btn-danger w-full btn-lg" type="button" onClick={handleClockOut}>
                  <Square size={20} fill="currentColor" /> Clock out
                </button>
              </div>
            ) : (
              <>
                <label htmlFor="punch-employee">Who is clocking in?</label>
                <select
                  id="punch-employee"
                  value={selectedEmployeeId}
                  onChange={(ev) => {
                    setSelectedEmployeeId(ev.target.value);
                    if (ev.target.value) localStorage.setItem(LAST_EMPLOYEE_KEY, ev.target.value);
                  }}
                  style={{ marginBottom: '1rem' }}
                  disabled={employees.length === 0}
                >
                  {employees.length === 0 ? (
                    <option value="">Add team members first ↓</option>
                  ) : (
                    <>
                      <option value="">Select…</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <button
                  className="btn btn-primary w-full btn-lg"
                  type="button"
                  onClick={handleClockIn}
                  disabled={employees.length === 0}
                >
                  <Play size={20} fill="currentColor" /> Clock in
                </button>
              </>
            )}
          </div>

          <div className="card">
            <h3 className="mb-4 flex items-center gap-2">
              <Users size={20} /> Team
            </h3>
            <p className="text-sm text-secondary mb-4">People who can be selected for punches. Names sync onto each time entry.</p>
            <form onSubmit={handleAddEmployee} className="flex flex-col gap-2 mb-4">
              <div className="flex gap-2">
                <input name="newEmployeeName" placeholder="Full name" aria-label="New employee name" />
                <button type="submit" className="btn btn-secondary" style={{ flexShrink: 0 }} title="Add">
                  <Plus size={18} />
                </button>
              </div>
            </form>
            <div className="team-list">
              {employees.length === 0 && (
                <p className="text-sm text-muted">No team members yet — add at least one to use the clock.</p>
              )}
              {employees.map((emp) => (
                <div key={emp.id} className="team-row">
                  <div className="flex items-center gap-2 min-w-0" style={{ flex: 1 }}>
                    <span className="avatar-dot">{emp.name.slice(0, 1).toUpperCase()}</span>
                    {editingMemberId === emp.id ? (
                      <input
                        value={editingMemberName}
                        onChange={(ev) => setEditingMemberName(ev.target.value)}
                        onBlur={() => saveMemberName(emp.id)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') saveMemberName(emp.id);
                          if (ev.key === 'Escape') setEditingMemberId(null);
                        }}
                        autoFocus
                        style={{ flex: 1, minWidth: 0 }}
                      />
                    ) : (
                      <span className="font-semibold text-sm truncate">{emp.name}</span>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      type="button"
                      className="btn-icon"
                      title="Rename"
                      onClick={() => {
                        setEditingMemberId(emp.id);
                        setEditingMemberName(emp.name);
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn-icon btn-icon--danger"
                      title="Remove"
                      onClick={() => setConfirmDeleteMemberId(emp.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="card">
            <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
              <h3 className="flex items-center gap-2">
                <CalendarIcon size={20} /> This week
              </h3>
              <span className="font-semibold text-primary" style={{ fontSize: '1.125rem' }}>
                {weekTotal.toFixed(2)} h this week
              </span>
            </div>
            <p className="text-sm text-secondary mb-4">Mon–Sun · bars are completed time only.</p>
            <div className="flex items-end justify-between chart-bars-wrap">
              {weekBars.map((data) => {
                const heightPct = Math.min(
                  100,
                  Math.max(data.hours > 0 ? 8 : 4, (data.hours / chartMaxHours) * 100)
                );
                return (
                  <div key={data.day} className="flex flex-col items-center" style={{ width: '13%' }}>
                    <span className="text-xs text-secondary font-semibold mb-2">{data.hours}h</span>
                    <div
                      style={{
                        width: '100%',
                        height: `${heightPct}%`,
                        background: data.hours > 0 ? 'linear-gradient(180deg, var(--lawn-green), var(--primary-green))' : 'var(--border-color)',
                        borderRadius: '6px 6px 0 0',
                        transition: 'height var(--transition-smooth)',
                        minHeight: '4px',
                      }}
                    />
                    <span className="text-sm font-semibold mt-2">{data.day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="flex justify-between items-center mb-2 flex-wrap gap-3">
              <h3 className="flex items-center gap-2" style={{ margin: 0 }}>
                <CalendarIcon size={20} /> Month view
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.65rem' }}
                  onClick={() => setViewMonth((m) => startOfMonth(subMonths(m, 1)))}
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="font-semibold" style={{ minWidth: '10rem', textAlign: 'center' }}>
                  {format(viewMonth, 'MMMM yyyy')}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.65rem' }}
                  onClick={() => setViewMonth((m) => startOfMonth(addMonths(m, 1)))}
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <p className="text-sm text-secondary mb-4">
              <strong className="text-primary">{monthTotalHours.toFixed(2)} h</strong> completed in this calendar month ·{' '}
              {monthLogsSorted.length} {monthLogsSorted.length === 1 ? 'entry' : 'entries'} (incl. open shifts)
            </p>
            <div
              className="month-bars-scroll"
              style={{
                display: 'flex',
                gap: '6px',
                overflowX: 'auto',
                paddingBottom: '0.75rem',
                marginBottom: '1rem',
                borderBottom: '1px solid var(--border-color)',
              }}
            >
              {monthBars.map((cell) => {
                const isToday = isSameDay(cell.date, new Date());
                const hPct = Math.min(
                  100,
                  Math.max(cell.hours > 0 ? 10 : 6, (cell.hours / monthChartMax) * 100)
                );
                return (
                  <div
                    key={cell.date.toISOString()}
                    className="flex flex-col items-center"
                    style={{ flex: '0 0 auto', width: '36px' }}
                    title={`${format(cell.date, 'MMM d')}: ${cell.hours}h worked (completed)`}
                  >
                    <span className="text-xs text-secondary font-semibold mb-1" style={{ fontSize: '0.65rem' }}>
                      {cell.hours > 0 ? `${cell.hours}` : '—'}
                    </span>
                    <div
                      style={{
                        width: '100%',
                        height: '72px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: `${hPct}%`,
                          background:
                            cell.hours > 0
                              ? 'linear-gradient(180deg, var(--lawn-green), var(--primary-green))'
                              : 'var(--border-color)',
                          borderRadius: '6px 6px 0 0',
                          minHeight: '4px',
                        }}
                      />
                    </div>
                    <span
                      className="text-xs font-semibold mt-1"
                      style={{
                        color: isToday ? 'var(--primary-green)' : 'var(--text-secondary)',
                      }}
                    >
                      {cell.dayNum}
                    </span>
                    <span className="text-muted" style={{ fontSize: '0.6rem' }}>
                      {cell.weekday}
                    </span>
                  </div>
                );
              })}
            </div>

            <h4 className="text-sm font-semibold mb-2" style={{ letterSpacing: '0.02em' }}>
              Shifts in {format(viewMonth, 'MMMM')}
            </h4>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Date</th>
                    <th>In</th>
                    <th>Out</th>
                    <th>Total</th>
                    <th style={{ width: '108px' }}> </th>
                  </tr>
                </thead>
                <tbody>
                  {monthLogsSorted.map((log) => (
                    <tr key={log.id} className="row-hover">
                      <td className="font-semibold">{resolveName(log.employeeId, log.employeeName)}</td>
                      <td>{format(parseISO(log.clockIn), 'MMM d, yyyy')}</td>
                      <td>{format(parseISO(log.clockIn), 'h:mm a')}</td>
                      <td>
                        {log.clockOut ? format(parseISO(log.clockOut), 'h:mm a') : (
                          <span className="text-primary italic">In progress</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{calculateHours(log.clockIn, log.clockOut)}</td>
                      <td>
                        <div className="flex gap-1 justify-end">
                          <button
                            type="button"
                            className="btn-icon"
                            title="Edit entry"
                            onClick={() => setEditingLog(log)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon btn-icon--danger"
                            title="Delete entry"
                            onClick={() => setConfirmDeleteLogId(log.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {monthLogsSorted.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-secondary">
                        No entries with clock-in during this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3 className="mb-2 flex items-center gap-2">
              <History size={20} /> All entries
            </h3>
            <p className="text-sm text-secondary mb-4">Edit times or delete mistakes. Open shifts show “In progress”.</p>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Date</th>
                    <th>In</th>
                    <th>Out</th>
                    <th>Total</th>
                    <th style={{ width: '108px' }}> </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLogs.map((log) => (
                    <tr key={log.id} className="row-hover">
                      <td className="font-semibold">{resolveName(log.employeeId, log.employeeName)}</td>
                      <td>{format(parseISO(log.clockIn), 'MMM d, yyyy')}</td>
                      <td>{format(parseISO(log.clockIn), 'h:mm a')}</td>
                      <td>
                        {log.clockOut ? format(parseISO(log.clockOut), 'h:mm a') : (
                          <span className="text-primary italic">In progress</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{calculateHours(log.clockIn, log.clockOut)}</td>
                      <td>
                        <div className="flex gap-1 justify-end">
                          <button
                            type="button"
                            className="btn-icon"
                            title="Edit entry"
                            onClick={() => setEditingLog(log)}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon btn-icon--danger"
                            title="Delete entry"
                            onClick={() => setConfirmDeleteLogId(log.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sortedLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-secondary">
                        No time entries yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {editingLog && (
        <div className="modal-overlay" role="presentation" onClick={() => setEditingLog(null)}>
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="edit-entry-title" onClick={(ev) => ev.stopPropagation()}>
            <button
              type="button"
              className="btn-icon"
              style={{ float: 'right', margin: '-0.5rem -0.5rem 0 0' }}
              onClick={() => setEditingLog(null)}
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <h2 id="edit-entry-title" className="modal-panel__title">
              Edit entry
            </h2>
            <p className="text-sm text-secondary mb-4">Adjust person and punch times. Clear clock-out to mark shift as open again.</p>
            <form onSubmit={saveEditedLog} className="flex flex-col gap-4">
              <div>
                <label htmlFor="editEmployeeId">Person</label>
                <select
                  id="editEmployeeId"
                  name="editEmployeeId"
                  defaultValue={editingLog.employeeId ?? ''}
                  required={employees.length > 0}
                >
                  {employees.length === 0 ? (
                    <option value="">{editingLog.employeeName || 'Unassigned'}</option>
                  ) : (
                    <>
                      <option value="">Select person…</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                      {editingLog.employeeId &&
                        !employees.some((e) => e.id === editingLog.employeeId) && (
                          <option value={editingLog.employeeId}>
                            {editingLog.employeeName} (removed from team)
                          </option>
                        )}
                    </>
                  )}
                </select>
              </div>
              <div>
                <label htmlFor="editClockIn">Clock in</label>
                <input id="editClockIn" name="editClockIn" type="datetime-local" required defaultValue={toDatetimeLocalValue(editingLog.clockIn)} step={60} />
              </div>
              <div>
                <label htmlFor="editClockOut">Clock out (leave empty if still on shift)</label>
                <input
                  id="editClockOut"
                  name="editClockOut"
                  type="datetime-local"
                  defaultValue={editingLog.clockOut ? toDatetimeLocalValue(editingLog.clockOut) : ''}
                  step={60}
                />
              </div>
              <div className="modal-panel__foot">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingLog(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
