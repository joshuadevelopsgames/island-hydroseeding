import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useJobs } from '@/hooks/useJobs';
import type { Job } from '@/lib/jobsTypes';

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'outline'> = {
  Active: 'default',
  Late: 'outline',
  'Requires Invoicing': 'secondary',
  Completed: 'secondary',
  Archived: 'outline',
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

interface DayColumn {
  date: Date;
  dayName: string;
  dayNumber: number;
  jobs: Job[];
}

export default function Schedule() {
  const navigate = useNavigate();
  const { data: jobs, isLoading, error } = useJobs();
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
      });
    }
    return days;
  }, [weekStart]);

  const weekWithJobs = useMemo(() => {
    if (!jobs) return weekDays;

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return weekDays.map((day) => {
      const dayJobs = jobs.filter((job) => {
        if (!job.start_date) return false;
        const jobStartDate = new Date(job.start_date);
        jobStartDate.setHours(0, 0, 0, 0);
        return isSameDay(jobStartDate, day.date);
      });
      return {
        ...day,
        jobs: dayJobs,
      };
    });
  }, [weekDays, jobs]);

  const hasJobsThisWeek = weekWithJobs.some((day) => day.jobs.length > 0);

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

  const basePath = '/v3';

  return (
    <div className="min-h-screen bg-[var(--background-color)]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Kicker */}
        <p className="page-kicker">Operations</p>

        {/* Title */}
        <div className="flex items-center gap-3 mb-2">
          <Calendar className="w-8 h-8 text-[var(--primary-green)]" />
          <h1 className="text-4xl font-bold text-[var(--text-primary)]">Schedule</h1>
        </div>

        {/* Subtitle */}
        <p className="text-[var(--text-muted)] mb-8">
          View your jobs and visits on a weekly calendar.
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

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--primary-green)]" />
            <span className="ml-2 text-[var(--text-muted)]">Loading schedule...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">Failed to load jobs. Please try again.</p>
          </div>
        )}

        {/* Week Grid */}
        {!isLoading && !error && (
          <>
            {/* Desktop View - 7-column grid */}
            <div className="hidden lg:grid grid-cols-7 gap-4 mb-8">
              {weekWithJobs.map((day) => {
                const isToday = isSameDay(day.date, today);
                return (
                  <div
                    key={day.date.toISOString()}
                    className={`rounded-lg border border-[var(--border-color)] p-4 min-h-[200px] ${
                      isToday ? 'bg-[var(--surface-hover)]' : 'bg-[var(--surface-color)]'
                    }`}
                  >
                    {/* Day Header */}
                    <div className="mb-4 pb-3 border-b border-[var(--border-color)]">
                      <p className="text-sm font-semibold text-[var(--text-muted)]">
                        {day.dayName}
                      </p>
                      <p className="text-2xl font-bold text-[var(--text-primary)]">
                        {day.dayNumber}
                      </p>
                    </div>

                    {/* Jobs List */}
                    <div className="space-y-2">
                      {day.jobs.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] italic">
                          No jobs
                        </p>
                      ) : (
                        day.jobs.map((job) => (
                          <button
                            key={job.id}
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
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Mobile View - Vertical list grouped by day */}
            <div className="lg:hidden space-y-4">
              {weekWithJobs.map((day) => {
                const isToday = isSameDay(day.date, today);
                return (
                  <div key={day.date.toISOString()}>
                    {/* Day Header */}
                    <div className={`rounded-t-lg border border-b-0 border-[var(--border-color)] p-4 ${
                      isToday ? 'bg-[var(--surface-hover)]' : 'bg-[var(--surface-color)]'
                    }`}>
                      <p className="text-sm font-semibold text-[var(--text-muted)]">
                        {day.dayName}, {day.dayNumber}
                      </p>
                    </div>

                    {/* Jobs */}
                    {day.jobs.length === 0 ? (
                      <div className="rounded-b-lg border border-[var(--border-color)] p-4 bg-[var(--surface-color)]">
                        <p className="text-sm text-[var(--text-muted)] italic">
                          No jobs scheduled
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-0 border border-t-0 border-[var(--border-color)] rounded-b-lg overflow-hidden">
                        {day.jobs.map((job, idx) => (
                          <button
                            key={job.id}
                            onClick={() => handleJobClick(job.id)}
                            className={`block w-full text-left p-4 hover:bg-[var(--surface-hover)] transition-colors ${
                              idx < day.jobs.length - 1
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* No Jobs Message */}
            {!hasJobsThisWeek && (
              <div className="rounded-lg border border-dashed border-[var(--border-color)] p-8 text-center">
                <Calendar className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
                <p className="text-[var(--text-muted)]">No jobs scheduled this week.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

type JobStatus = 'Active' | 'Late' | 'Requires Invoicing' | 'Completed' | 'Archived';
