import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  X,
  ShieldCheck,
} from 'lucide-react';
import { useJobs } from '@/hooks/useJobs';
import type { Job } from '@/lib/jobsTypes';
import {
  createCalendarEvent,
  loadCalendarEvents,
  saveCalendarEvents,
  type CalendarEvent,
  type CalendarEventCategory,
} from '@/lib/calendarEvents';
import { loadAssets } from '@/lib/fleetStore';
import type { FleetAsset } from '@/lib/fleetTypes';
import { assetDisplayName } from '@/lib/fleetStore';
import { vancouverDateInputFromIso } from '@/lib/vancouverTime';
import ConfirmDialog from '@/components/ConfirmDialog';

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'outline'> = {
  Active: 'default',
  Late: 'outline',
  'Requires Invoicing': 'secondary',
  Completed: 'secondary',
  Archived: 'outline',
};

const CATEGORY_LABELS: Record<CalendarEventCategory, string> = {
  general: 'Event',
  meeting: 'Meeting',
  maintenance: 'Maintenance',
  reminder: 'Reminder',
};

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function formatWeekRange(startDate: Date): string {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);

  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
}

function getDayName(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
}

function dateInputFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateFromInput(value: string): Date {
  const [y, m, d] = value.split('-').map((s) => parseInt(s, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

interface DayColumn {
  date: Date;
  dayName: string;
  dayNumber: number;
  jobs: Job[];
  events: CalendarEvent[];
  cvips: Array<{ asset: FleetAsset; date: string }>;
}

const basePath = '/v3';

export default function Schedule() {
  const navigate = useNavigate();
  const { data: jobs, isLoading, error } = useJobs();
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [assets, setAssets] = useState<FleetAsset[]>([]);
  const [adding, setAdding] = useState<{ date: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setEvents(loadCalendarEvents());
    setAssets(loadAssets());
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const persistEvents = (next: CalendarEvent[]) => {
    setEvents(next);
    saveCalendarEvents(next);
  };

  const weekDays = useMemo(() => {
    const days: DayColumn[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      date.setHours(0, 0, 0, 0);
      days.push({
        date,
        dayName: getDayName(date),
        dayNumber: date.getDate(),
        jobs: [],
        events: [],
        cvips: [],
      });
    }
    return days;
  }, [weekStart]);

  const weekFilled = useMemo(() => {
    return weekDays.map((day) => {
      const dayKey = dateInputFromDate(day.date);
      const dayJobs =
        jobs?.filter((job) => {
          if (!job.start_date) return false;
          const jobStartDate = new Date(job.start_date);
          jobStartDate.setHours(0, 0, 0, 0);
          return isSameDay(jobStartDate, day.date);
        }) ?? [];
      const dayEvents = events.filter((e) => e.date === dayKey);
      const dayCvips: Array<{ asset: FleetAsset; date: string }> = [];
      for (const a of assets) {
        if (!a.cvip.enabled || !a.cvip.nextDueDate) continue;
        const due = vancouverDateInputFromIso(a.cvip.nextDueDate);
        if (due === dayKey) dayCvips.push({ asset: a, date: due });
      }
      return { ...day, jobs: dayJobs, events: dayEvents, cvips: dayCvips };
    });
  }, [weekDays, jobs, events, assets]);

  const hasAnythingThisWeek = weekFilled.some(
    (day) => day.jobs.length > 0 || day.events.length > 0 || day.cvips.length > 0
  );

  const handlePrevWeek = () => {
    setWeekStart((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 7);
      return newDate;
    });
  };

  const handleNextWeek = () => {
    setWeekStart((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 7);
      return newDate;
    });
  };

  const handleToday = () => {
    setWeekStart(getMonday(today));
  };

  const handleJobClick = (jobId: string) => {
    navigate(`${basePath}/jobs/${jobId}`);
  };

  const openAdd = (initialDate?: string) => {
    setAdding({ date: initialDate ?? dateInputFromDate(today) });
  };

  const handleSubmitNew = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') || '').trim();
    const date = String(fd.get('date') || '').trim();
    if (!title || !date) return;
    const description = String(fd.get('description') || '');
    const category = (String(fd.get('category') || 'general') as CalendarEventCategory) || 'general';
    const ev = createCalendarEvent({ title, description, date, category });
    persistEvents([ev, ...events]);
    setAdding(null);
    // Snap the visible week to the date the user just added if it's outside.
    const target = dateFromInput(date);
    const start = getMonday(target);
    setWeekStart(start);
  };

  const executeDelete = (id: string) => {
    persistEvents(events.filter((e) => e.id !== id));
    setDeleteId(null);
  };

  const eventPendingDelete = deleteId ? events.find((e) => e.id === deleteId) : null;

  return (
    <div className="min-h-screen bg-[var(--background-color)]">
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete this event?"
        message={
          eventPendingDelete
            ? `Permanently remove “${eventPendingDelete.title}”?`
            : 'Permanently remove this event?'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => deleteId && executeDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="page-kicker">Operations</p>

        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-3">
            <Calendar className="w-8 h-8 text-[var(--primary-green)]" />
            <h1 className="text-4xl font-bold text-[var(--text-primary)]">Schedule</h1>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => openAdd()}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New event
          </Button>
        </div>

        <p className="text-[var(--text-muted)] mb-8">
          Jobs, custom events, and CVIP due dates on a weekly calendar.
        </p>

        {/* Week Navigation */}
        <div className="flex items-center justify-between gap-4 mb-8 bg-[var(--surface-color)] rounded-lg p-4 border border-[var(--border-color)]">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevWeek}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="w-5 h-5" />
            Previous
          </Button>

          <div className="flex-1 text-center">
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              Week of {formatWeekRange(weekStart)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNextWeek}
              className="flex items-center gap-2"
            >
              Next
              <ChevronRight className="w-5 h-5" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleToday}
            >
              Today
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--primary-green)]" />
            <span className="ml-2 text-[var(--text-muted)]">Loading schedule...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">Failed to load jobs. Please try again.</p>
          </div>
        )}

        {!isLoading && !error && (
          <>
            {/* Desktop View - 7-column grid */}
            <div className="hidden lg:grid grid-cols-7 gap-4 mb-8">
              {weekFilled.map((day) => {
                const isToday = isSameDay(day.date, today);
                const dayKey = dateInputFromDate(day.date);
                return (
                  <div
                    key={day.date.toISOString()}
                    className={`rounded-lg border border-[var(--border-color)] p-4 min-h-[200px] flex flex-col ${
                      isToday ? 'bg-[var(--surface-hover)]' : 'bg-[var(--surface-color)]'
                    }`}
                  >
                    <div className="mb-3 pb-3 border-b border-[var(--border-color)] flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-muted)]">
                          {day.dayName}
                        </p>
                        <p className="text-2xl font-bold text-[var(--text-primary)]">
                          {day.dayNumber}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openAdd(dayKey)}
                        className="text-[var(--text-muted)] hover:text-[var(--primary-green)] transition-colors p-1 rounded"
                        title="Add event on this day"
                        aria-label={`Add event on ${day.dayName} ${day.dayNumber}`}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-2 flex-1">
                      {day.jobs.length === 0 && day.events.length === 0 && day.cvips.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] italic">
                          Nothing scheduled
                        </p>
                      ) : (
                        <>
                          {day.jobs.map((job) => (
                            <button
                              key={`job-${job.id}`}
                              onClick={() => handleJobClick(job.id)}
                              className="block w-full text-left p-2 rounded border border-[var(--border-color)] hover:bg-[var(--surface-hover)] hover:border-[var(--primary-green)] transition-colors"
                            >
                              <p className="text-xs font-mono font-bold text-[var(--text-primary)] mb-1">
                                Job #{String(job.job_number).padStart(4, '0')}
                              </p>
                              <p className="text-sm font-medium text-[var(--text-primary)] truncate mb-2">
                                {job.title}
                              </p>
                              <Badge
                                variant={STATUS_COLORS[job.status as JobStatus] || 'default'}
                                className="text-xs"
                              >
                                {job.status}
                              </Badge>
                            </button>
                          ))}

                          {day.cvips.map(({ asset }) => (
                            <button
                              key={`cvip-${asset.id}`}
                              onClick={() => navigate(`${basePath}/assets`)}
                              className="block w-full text-left p-2 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors dark:bg-amber-900/20 dark:border-amber-800 dark:hover:bg-amber-900/30"
                              title="Open Assets page"
                            >
                              <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1 flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" /> CVIP due
                              </p>
                              <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                                {assetDisplayName(asset)}
                              </p>
                            </button>
                          ))}

                          {day.events.map((evt) => (
                            <div
                              key={`evt-${evt.id}`}
                              className="block w-full text-left p-2 rounded border border-[var(--border-color)] bg-[var(--surface-raised)]"
                            >
                              <div className="flex items-start justify-between gap-1 mb-1">
                                <p className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wide">
                                  {CATEGORY_LABELS[evt.category]}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setDeleteId(evt.id)}
                                  className="text-[var(--text-muted)] hover:text-red-600 transition-colors"
                                  title="Delete event"
                                  aria-label="Delete event"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              <p className="text-sm font-medium text-[var(--text-primary)]">
                                {evt.title}
                              </p>
                              {evt.description && (
                                <p className="text-xs text-[var(--text-muted)] mt-1 whitespace-pre-wrap">
                                  {evt.description}
                                </p>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile View - Vertical list grouped by day */}
            <div className="lg:hidden space-y-4">
              {weekFilled.map((day) => {
                const isToday = isSameDay(day.date, today);
                const dayKey = dateInputFromDate(day.date);
                const empty = day.jobs.length === 0 && day.events.length === 0 && day.cvips.length === 0;
                return (
                  <div key={day.date.toISOString()}>
                    <div className={`rounded-t-lg border border-b-0 border-[var(--border-color)] p-4 flex justify-between items-center ${
                      isToday ? 'bg-[var(--surface-hover)]' : 'bg-[var(--surface-color)]'
                    }`}>
                      <p className="text-sm font-semibold text-[var(--text-muted)]">
                        {day.dayName}, {day.dayNumber}
                      </p>
                      <button
                        type="button"
                        onClick={() => openAdd(dayKey)}
                        className="text-[var(--text-muted)] hover:text-[var(--primary-green)] transition-colors p-1 rounded"
                        title="Add event"
                        aria-label="Add event"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {empty ? (
                      <div className="rounded-b-lg border border-[var(--border-color)] p-4 bg-[var(--surface-color)]">
                        <p className="text-sm text-[var(--text-muted)] italic">
                          Nothing scheduled
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-0 border border-t-0 border-[var(--border-color)] rounded-b-lg overflow-hidden">
                        {day.jobs.map((job, idx) => (
                          <button
                            key={`job-${job.id}`}
                            onClick={() => handleJobClick(job.id)}
                            className={`block w-full text-left p-4 hover:bg-[var(--surface-hover)] transition-colors ${
                              idx < day.jobs.length - 1 ||
                              day.cvips.length > 0 ||
                              day.events.length > 0
                                ? 'border-b border-[var(--border-color)]'
                                : ''
                            }`}
                          >
                            <p className="text-xs font-mono font-bold text-[var(--text-primary)] mb-1">
                              Job #{String(job.job_number).padStart(4, '0')}
                            </p>
                            <p className="text-sm font-medium text-[var(--text-primary)] mb-2">
                              {job.title}
                            </p>
                            <Badge
                              variant={STATUS_COLORS[job.status as JobStatus] || 'default'}
                              className="text-xs"
                            >
                              {job.status}
                            </Badge>
                          </button>
                        ))}

                        {day.cvips.map(({ asset }, idx) => (
                          <button
                            key={`cvip-${asset.id}`}
                            onClick={() => navigate(`${basePath}/assets`)}
                            className={`block w-full text-left p-4 bg-amber-50 hover:bg-amber-100 transition-colors dark:bg-amber-900/20 dark:hover:bg-amber-900/30 ${
                              idx < day.cvips.length - 1 || day.events.length > 0
                                ? 'border-b border-[var(--border-color)]'
                                : ''
                            }`}
                          >
                            <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> CVIP due
                            </p>
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                              {assetDisplayName(asset)}
                            </p>
                          </button>
                        ))}

                        {day.events.map((evt, idx) => (
                          <div
                            key={`evt-${evt.id}`}
                            className={`p-4 bg-[var(--surface-raised)] flex justify-between gap-3 ${
                              idx < day.events.length - 1 ? 'border-b border-[var(--border-color)]' : ''
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wide mb-1">
                                {CATEGORY_LABELS[evt.category]}
                              </p>
                              <p className="text-sm font-medium text-[var(--text-primary)]">
                                {evt.title}
                              </p>
                              {evt.description && (
                                <p className="text-xs text-[var(--text-muted)] mt-1 whitespace-pre-wrap">
                                  {evt.description}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setDeleteId(evt.id)}
                              className="text-[var(--text-muted)] hover:text-red-600 transition-colors flex-shrink-0"
                              title="Delete event"
                              aria-label="Delete event"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!hasAnythingThisWeek && (
              <div className="rounded-lg border border-dashed border-[var(--border-color)] p-8 text-center">
                <Calendar className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
                <p className="text-[var(--text-muted)] mb-3">Nothing scheduled this week.</p>
                <Button variant="default" size="sm" onClick={() => openAdd()}>
                  <Plus className="w-4 h-4" /> Add an event
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {adding && (
        <div className="modal-overlay" role="presentation" onClick={() => setAdding(null)}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-event-title"
            onClick={(ev) => ev.stopPropagation()}
          >
            <button
              type="button"
              className="btn-icon"
              style={{ float: 'right', margin: '-0.5rem -0.5rem 0 0' }}
              onClick={() => setAdding(null)}
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <p className="page-kicker" style={{ marginBottom: '0.35rem' }}>
              Schedule
            </p>
            <h2 id="new-event-title" className="modal-panel__title">
              New event
            </h2>
            <form onSubmit={handleSubmitNew} className="flex flex-col gap-4" style={{ marginTop: '1rem' }}>
              <div>
                <label htmlFor="ne-title">Title</label>
                <input id="ne-title" name="title" required autoFocus placeholder="e.g. Crew safety meeting" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label htmlFor="ne-date">Date</label>
                  <input id="ne-date" name="date" type="date" required defaultValue={adding.date} />
                </div>
                <div>
                  <label htmlFor="ne-cat">Category</label>
                  <select id="ne-cat" name="category" defaultValue="general">
                    <option value="general">Event</option>
                    <option value="meeting">Meeting</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="reminder">Reminder</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="ne-desc">Description (optional)</label>
                <textarea id="ne-desc" name="description" rows={3} placeholder="Details, attendees, notes…" />
              </div>
              <div className="modal-panel__foot" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setAdding(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Add to schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

type JobStatus = 'Active' | 'Late' | 'Requires Invoicing' | 'Completed' | 'Archived';
