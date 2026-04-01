import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useJobs } from '@/hooks/useJobs';
import { formatInVancouver } from '@/lib/vancouverTime';
import type { Job, JobStatus } from '@/lib/jobsTypes';

const STATUS_COLORS: Record<JobStatus, 'default' | 'secondary' | 'outline'> = {
  Active: 'default',
  Late: 'outline',
  'Requires Invoicing': 'secondary',
  Completed: 'secondary',
  Archived: 'outline',
};

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  return STATUS_COLORS[status as JobStatus] ?? 'outline';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(amount);
}

function DashboardCard({
  title,
  value,
  subtitle,
  isLoading,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  isLoading?: boolean;
}) {
  return (
    <div className="rounded-lg bg-[var(--surface-color)] p-5 border border-[var(--border-color)] shadow-sm dark:bg-slate-900">
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">{title}</p>
      <div className="min-h-8">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-[var(--primary-green)]" aria-hidden />
        ) : (
          <>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
            {subtitle && <p className="text-sm text-[var(--text-muted)] mt-1">{subtitle}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function StatusBreakdownCard({ jobs, isLoading }: { jobs: Job[]; isLoading: boolean }) {
  const stats = useMemo(() => {
    if (isLoading) return null;
    const counts = {
      Active: jobs.filter((j) => j.status === 'Active').length,
      Late: jobs.filter((j) => j.status === 'Late').length,
      'Requires Invoicing': jobs.filter((j) => j.status === 'Requires Invoicing').length,
      Completed: jobs.filter((j) => j.status === 'Completed').length,
    };
    return counts;
  }, [jobs, isLoading]);

  return (
    <div className="rounded-lg bg-[var(--surface-color)] p-5 border border-[var(--border-color)] shadow-sm dark:bg-slate-900">
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">Overview by Status</p>
      {isLoading || !stats ? (
        <Loader2 className="h-5 w-5 animate-spin text-[var(--primary-green)]" aria-hidden />
      ) : (
        <div className="space-y-2.5">
          {[
            { status: 'Active', count: stats.Active, color: 'bg-green-500' },
            { status: 'Late', count: stats.Late, color: 'bg-red-500' },
            { status: 'Requires Invoicing', count: stats['Requires Invoicing'], color: 'bg-amber-400' },
            { status: 'Completed', count: stats.Completed, color: 'bg-emerald-700' },
          ].map((item) => (
            <div key={item.status} className="flex items-center gap-3 text-sm">
              <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
              <span className="text-[var(--text-muted)] flex-1">{item.status}</span>
              <span className="font-semibold text-[var(--text-primary)]">{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Jobs() {
  const navigate = useNavigate();
  const { data: jobs = [], isLoading, error } = useJobs();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const filtered = useMemo(() => {
    let result = jobs;

    if (statusFilter !== 'All') {
      result = result.filter((j) => j.status === statusFilter);
    }

    const q = search.trim().toLowerCase();
    if (!q) return result;

    return result.filter(
      (job) =>
        String(job.job_number).toLowerCase().includes(q) ||
        (job.title?.toLowerCase().includes(q) ?? false)
    );
  }, [jobs, search, statusFilter]);

  const stats = useMemo(() => {
    const active = jobs.filter((j) => j.status === 'Active');
    const nonArchived = jobs.filter((j) => j.status !== 'Archived');
    const completedThisMonth = jobs.filter((j) => {
      if (j.status !== 'Completed') return false;
      const jobDate = new Date(j.updated_at);
      const now = new Date();
      return jobDate.getMonth() === now.getMonth() && jobDate.getFullYear() === now.getFullYear();
    });

    const totalRevenue = nonArchived.reduce((sum, j) => sum + (j.total_price || 0), 0);

    return {
      activeCount: active.length,
      totalRevenue,
      completedThisMonthCount: completedThisMonth.length,
    };
  }, [jobs]);

  return (
    <div>
      <p className="page-kicker">Operations</p>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="mb-2 flex items-center gap-2">
            <Briefcase size={28} aria-hidden className="shrink-0 text-[var(--primary-green)]" />
            Jobs
          </h1>
          <p className="text-secondary mb-0">Manage active jobs, track visits, and monitor profitability.</p>
        </div>
        <Button
          onClick={() => navigate('/jobs/new')}
          className="btn btn-primary page-toolbar__cta"
        >
          New Job
        </Button>
      </div>

      {error && (
        <div className="card mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="min-w-0 max-w-full break-words text-sm">
            <span className="font-semibold text-[var(--color-danger)]">Error loading jobs</span>
            <span className="text-secondary ml-1">Please try again later.</span>
          </p>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 mb-8 md:grid-cols-2 lg:grid-cols-4">
        <StatusBreakdownCard jobs={jobs} isLoading={isLoading} />
        <DashboardCard
          title="Active Jobs"
          value={stats.activeCount}
          isLoading={isLoading}
        />
        <DashboardCard
          title="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          isLoading={isLoading}
        />
        <DashboardCard
          title="Completed This Month"
          value={stats.completedThisMonthCount}
          isLoading={isLoading}
        />
      </div>

      <div className="card min-w-0 overflow-hidden p-0">
        <div className="flex flex-col gap-4 border-b border-[var(--border-color)] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="mb-1 flex items-center gap-2 text-[1.125rem] font-semibold">
              <Briefcase size={20} aria-hidden className="shrink-0 text-[var(--primary-green)]" />
              All Jobs
            </h3>
            <p className="mb-0 text-sm text-secondary">
              {isLoading ? 'Loading…' : `${filtered.length} shown · ${jobs.length} total`}
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search
                size={18}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                type="search"
                className="w-full pl-10 h-10"
                placeholder="Job #, title…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search jobs"
              />
            </div>
            <select
              className="flex h-10 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-color)] px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option>All</option>
              <option>Active</option>
              <option>Late</option>
              <option>Requires Invoicing</option>
              <option>Completed</option>
              <option>Archived</option>
            </select>
          </div>
        </div>

        <div className="max-h-[min(60vh,520px)] overflow-y-auto">
          <div className="divide-y divide-[var(--border-color)]">
            {isLoading && jobs.length === 0 && (
              <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-secondary">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                <span>Loading jobs…</span>
              </div>
            )}
            {filtered.map((job) => (
              <div
                key={job.id}
                onClick={() => navigate(`/jobs/${job.id}`)}
                className="flex flex-col gap-3 px-6 py-4 transition-colors hover:bg-[var(--surface-hover)] cursor-pointer sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <p className="font-semibold text-[var(--text-primary)]">
                      Job #{String(job.job_number).padStart(4, '0')}
                    </p>
                    {job.title && (
                      <p className="text-sm text-[var(--text-muted)] truncate">— {job.title}</p>
                    )}
                  </div>
                  {job.job_type && (
                    <p className="text-sm text-[var(--text-muted)] truncate">{job.job_type}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 justify-between sm:gap-4">
                  <p className="text-sm text-secondary">
                    {formatInVancouver(new Date(job.created_at), 'MMM d, yyyy')}
                  </p>
                  <Badge variant={getStatusBadgeVariant(job.status)}>{job.status}</Badge>
                  <p className="font-semibold text-[var(--text-primary)] w-24 text-right">
                    {formatCurrency(job.total_price || 0)}
                  </p>
                </div>
              </div>
            ))}
            {!isLoading && filtered.length === 0 && (
              <div className="px-6 py-16 text-center text-sm text-secondary">
                {jobs.length === 0
                  ? 'No jobs yet. Create one with New Job.'
                  : 'No jobs match your search or filter.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
