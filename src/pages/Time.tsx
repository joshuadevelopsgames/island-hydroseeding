import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  Play,
  Square,
  Calendar as CalendarIcon,
  History,
  Users,
  Pencil,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
import {
  formatInVancouver,
  isSameVancouverDay,
  toVancouverDate,
  vancouverDatetimeLocalToIso,
  vancouverNow,
} from '../lib/vancouverTime';

const LOGS_KEY = 'timeLogs';
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
  return formatInVancouver(iso, "yyyy-MM-dd'T'HH:mm");
}

function fromDatetimeLocalValue(s: string) {
  return vancouverDatetimeLocalToIso(s);
}

export default function Time() {
  const { users } = useAuth();
  // Derive employees list directly from app users (no separate local storage list needed)
  const employees = useMemo<Employee[]>(
    () => users.map((u) => ({ id: u.id, name: u.name })),
    [users]
  );

  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [activeLog, setActiveLog] = useState<TimeLog | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [editingLog, setEditingLog] = useState<TimeLog | null>(null);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(vancouverNow()));
  const [alertDialog, setAlertDialog] = useState<{ title: string; message: string } | null>(null);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<string | null>(null);

  const persistLogs = useCallback((next: TimeLog[]) => {
    setLogs(next);
    localStorage.setItem(LOGS_KEY, JSON.stringify(next));
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
  }, []);

  // Keep selectedEmployeeId in sync if users change
  useEffect(() => {
    const lastId = localStorage.getItem(LAST_EMPLOYEE_KEY);
    if (lastId && employees.some((e) => e.id === lastId)) {
      setSelectedEmployeeId(lastId);
    } else if (employees.length === 1) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees]);

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
    const ref = vancouverNow();
    const ws = startOfWeek(ref, { weekStartsOn: 1 });
    const we = endOfWeek(ref, { weekStartsOn: 1 });
    return logs
      .filter((log) => log.clockOut)
      .reduce((acc, log) => {
        const cin = toVancouverDate(parseISO(log.clockIn));
        if (cin < ws || cin > we) return acc;
        return acc + differenceInMinutes(parseISO(log.clockOut!), cin) / 60;
      }, 0);
  }, [logs]);

  const weekBars = useMemo(() => {
    const ref = vancouverNow();
    const start = startOfWeek(ref, { weekStartsOn: 1 });
    const end = endOfWeek(ref, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });
    return days.map((day) => {
      let hours = 0;
      for (const log of logs) {
        if (!log.clockOut) continue;
        const cin = toVancouverDate(parseISO(log.clockIn));
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
        const cin = toVancouverDate(parseISO(log.clockIn));
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
    return sortedLogs.filter((log) => isSameMonth(toVancouverDate(parseISO(log.clockIn)), viewMonth));
  }, [sortedLogs, viewMonth]);

  const activeEmployeeLabel = activeLog
    ? resolveName(activeLog.employeeId, activeLog.employeeName)
    : null;

  return (
    <div className="time-page">
      <AlertDialog
        open={alertDialog !== null}
        title={alertDialog?.title ?? ''}
        message={alertDialog?.message ?? ''}
        onClose={() => setAlertDialog(null)}
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
      <div className="flex justify-between items-start mb-4 sm:mb-8 flex-wrap gap-3 sm:gap-4">
        <div className="min-w-0 max-w-full">
          <h1 className="mb-1 sm:mb-2 text-[1.5rem] sm:text-[1.75rem] lg:text-[2.25rem] leading-tight">
            Time tracking
          </h1>
          <p className="time-intro text-[0.9375rem] sm:text-base leading-snug">
            Punch in by person and correct entries when needed.
          </p>
        </div>
      </div>

      <div className="time-layout">
        <div className="flex flex-col gap-4">
          <div className="card flex flex-col items-stretch p-3.5 sm:p-6 lg:p-8">
            <div className="text-center mb-3 sm:mb-6">
              <Clock
                className="mb-2 sm:mb-3 w-9 h-9 sm:w-11 sm:h-11 mx-auto"
                style={{ color: 'var(--lawn-green)' }}
              />
              <h2 className="mb-1 text-[1.625rem] sm:text-[1.875rem] lg:text-[2rem] font-bold tabular-nums">
                {formatInVancouver(new Date(), 'h:mm a')}
              </h2>
              <p className="text-secondary">{formatInVancouver(new Date(), 'EEEE, MMMM d, yyyy')}</p>
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
                    <span className="text-secondary font-normal"> · in since {formatInVancouver(activeLog.clockIn, 'h:mm a')}</span>
                  </span>
                </div>
                <button className="btn btn-danger w-full btn-lg time-punch-primary" type="button" onClick={handleClockOut}>
                  <Square size={20} fill="currentColor" className="flex-shrink-0" aria-hidden />
                  <span>Clock out</span>
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
                    <option value="">No users found</option>
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
                  className="btn btn-primary w-full btn-lg time-punch-primary"
                  type="button"
                  onClick={handleClockIn}
                  disabled={employees.length === 0}
                >
                  <Play size={20} fill="currentColor" className="flex-shrink-0" aria-hidden />
                  <span>Clock in</span>
                </button>
              </>
            )}
          </div>

          <div className="card min-w-0">
            <h3 className="mb-3 sm:mb-4 flex items-center gap-2 min-w-0">
              <Users size={20} className="flex-shrink-0" /> Team
            </h3>
            <p className="time-team-help text-sm text-secondary mb-3 sm:mb-4">
              Pulled from your team roster. Add or remove people under{' '}
              <Link to="/team" className="font-semibold" style={{ color: 'var(--primary-green)' }}>
                Team &amp; access <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />
              </Link>.
            </p>
            <div className="team-list">
              {employees.length === 0 && (
                <p className="text-sm text-muted">No users found. Add team members under Team &amp; access.</p>
              )}
              {employees.map((emp) => (
                <div key={emp.id} className="team-row">
                  <div className="flex items-center gap-2 min-w-0" style={{ flex: 1 }}>
                    <span className="avatar-dot">{emp.name.slice(0, 1).toUpperCase()}</span>
                    <span className="font-semibold text-sm truncate">{emp.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="card">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center mb-2">
              <h3 className="flex items-center gap-2 m-0 text-base">
                <CalendarIcon size={20} className="flex-shrink-0" /> This week
              </h3>
              <span className="font-semibold text-primary text-[1.0625rem] sm:text-[1.125rem] tabular-nums">
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
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-2">
              <h3 className="flex items-center gap-2 m-0 text-base">
                <CalendarIcon size={20} className="flex-shrink-0" /> Month view
              </h3>
              <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto min-w-0">
                <button
                  type="button"
                  className="btn btn-secondary time-month-nav-btn flex-shrink-0"
                  onClick={() => setViewMonth((m) => startOfMonth(subMonths(m, 1)))}
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="font-semibold text-center flex-1 sm:flex-none sm:min-w-[10rem] tabular-nums truncate px-1">
                  {format(viewMonth, 'MMMM yyyy')}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary time-month-nav-btn flex-shrink-0"
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
            <div className="month-bars-scroll time-month-bars-scroll">
              {monthBars.map((cell) => {
                const isToday = isSameVancouverDay(cell.date, vancouverNow());
                const hPct = Math.min(
                  100,
                  Math.max(cell.hours > 0 ? 10 : 6, (cell.hours / monthChartMax) * 100)
                );
                return (
                  <div
                    key={cell.date.toISOString()}
                    className="flex flex-col items-center"
                    style={{ flex: '0 0 auto', width: '36px' }}
                    title={`${formatInVancouver(cell.date, 'MMM d')}: ${cell.hours}h worked (completed)`}
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
                      <td>{formatInVancouver(log.clockIn, 'MMM d, yyyy')}</td>
                      <td>{formatInVancouver(log.clockIn, 'h:mm a')}</td>
                      <td>
                        {log.clockOut ? formatInVancouver(log.clockOut, 'h:mm a') : (
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
                      <td>{formatInVancouver(log.clockIn, 'MMM d, yyyy')}</td>
                      <td>{formatInVancouver(log.clockIn, 'h:mm a')}</td>
                      <td>
                        {log.clockOut ? formatInVancouver(log.clockOut, 'h:mm a') : (
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
          <div
          className="modal-panel time-edit-modal max-w-[min(440px,calc(100vw-1rem))] sm:max-w-[440px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-entry-title"
          onClick={(ev) => ev.stopPropagation()}
        >
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
              <div className="modal-panel__foot time-edit-modal__foot">
                <button type="button" className="btn btn-secondary w-full sm:w-auto" onClick={() => setEditingLog(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary w-full sm:w-auto">
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
