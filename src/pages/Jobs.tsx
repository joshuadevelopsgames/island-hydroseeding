import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useJobs } from '@/hooks/useJobs';
import { formatInVancouver } from '@/lib/vancouverTime';
import type { Job, JobStatus } from '@/lib/jobsTypes';

const FILTER_SELECT_CLASS =
  'h-10 w-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-color)] px-3 text-sm text-[var(--text-primary)]';

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
    <div className="rounded-lg bg-[var(--surface-color)] p-5 border border-[var(--border-color)]">
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
    <div className="rounded-lg bg-[var(--surface-color)] p-5 border border-[var(--border-color)]">
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

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mb-0.5 flex items-center gap-2 text-lg font-semibold">
            <Briefcase size={20} aria-hidden className="shrink-0 text-[var(--primary-green)]" />
            All Jobs
          </h2>
          <p className="mb-0 text-sm text-[var(--text-secondary)]">
            {isLoading ? 'Loading…' : `${filtered.length} shown · ${jobs.length} total`}
          </p>
        </div>
      </div>

      <Card className="mb-4 min-w-0 p-4">
        <div className="flex w-full min-w-0 flex-wrap items-end gap-3">
          <div className="relative min-w-0 w-full basis-full sm:basis-[min(100%,18rem)] sm:max-w-md sm:grow">
            <Search
              size={18}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <Input
              type="search"
              className="w-full min-w-0 pl-10"
              placeholder="Job #, title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search jobs"
            />
          </div>
          <div className="w-full min-w-0 sm:w-44 sm:max-w-none sm:shrink-0">
            <select
              className={FILTER_SELECT_CLASS}
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
      </Card>

      <Card className="min-w-0 overflow-hidden p-0">
        <div className="max-h-[min(70vh,640px)] overflow-auto">
          {isLoading && jobs.length === 0 ? (
            <div className="flex items-center justify-center gap-3 px-6 py-20 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
              <span>Loading jobs…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-[var(--text-secondary)]">
              {jobs.length === 0
                ? 'No jobs yet. Create one with New Job.'
                : 'No jobs match your search or filter.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
                <thead className="sticky top-0 z-[1] border-b border-[var(--border-color)] bg-[var(--surface-raised)]">
                  <tr className="text-left text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-4 py-3 sm:px-6 w-[38%]">Job</th>
                    <th className="px-3 py-3 w-[14%]">Type</th>
                    <th className="px-3 py-3 w-[16%]">Status</th>
                    <th className="px-3 py-3 w-[14%]">Created</th>
                    <th className="px-4 py-3 text-right sm:px-6 w-[18%]">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)] bg-[var(--surface-color)]">
                  {filtered.map((job) => (
                    <tr
                      key={job.id}
                      tabIndex={0}
                      role="button"
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/jobs/${job.id}`);
                        }
                      }}
                      className="cursor-pointer transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-green)] focus-visible:ring-inset"
                    >
                      <td className="px-4 py-3 sm:px-6 align-middle">
                        <div className="min-w-0 font-medium text-[var(--text-primary)]">
                          Job #{String(job.job_number).padStart(4, '0')}
                          {job.title ? (
                            <span className="font-normal text-[var(--text-secondary)]"> — {job.title}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle text-[var(--text-secondary)]">
                        {job.job_type || '—'}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <Badge variant={getStatusBadgeVariant(job.status)}>{job.status}</Badge>
                      </td>
                      <td className="px-3 py-3 align-middle whitespace-nowrap text-[var(--text-secondary)]">
                        {formatInVancouver(new Date(job.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[var(--text-primary)] sm:px-6 align-middle">
                        {formatCurrency(job.total_price || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
