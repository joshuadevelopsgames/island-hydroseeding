import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Loader2, Search, Phone, Mail, Globe, UserPlus, LayoutGrid, List } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requestsKeys, useRequests } from '@/hooks/useRequests';
import { formatInVancouver } from '@/lib/vancouverTime';
import type { WorkRequest, RequestStatus } from '@/lib/requestsTypes';
import { requestsPost } from '@/lib/requestsApi';
import { StatusKanban } from '@/components/StatusKanban';
import { fetchWorkflowSnapshot } from '@/lib/reportsApi';

const REQUEST_COLUMNS: RequestStatus[] = [
  'New',
  'Assessment Scheduled',
  'Assessment Complete',
  'Converted',
  'Archived',
];

const STATUS_COLORS: Record<RequestStatus, 'default' | 'secondary' | 'outline'> = {
  'New': 'default',
  'Assessment Scheduled': 'secondary',
  'Assessment Complete': 'secondary',
  'Converted': 'outline',
  'Archived': 'outline',
};

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  return STATUS_COLORS[status as RequestStatus] ?? 'outline';
}

function getSourceIcon(source: string) {
  switch (source) {
    case 'phone':
      return <Phone size={16} aria-hidden className="shrink-0" />;
    case 'email':
      return <Mail size={16} aria-hidden className="shrink-0" />;
    case 'website':
      return <Globe size={16} aria-hidden className="shrink-0" />;
    case 'referral':
      return <UserPlus size={16} aria-hidden className="shrink-0" />;
    case 'other':
    default:
      return <Inbox size={16} aria-hidden className="shrink-0" />;
  }
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

function StatusBreakdownCard({ requests, isLoading }: { requests: WorkRequest[]; isLoading: boolean }) {
  const stats = useMemo(() => {
    if (isLoading) return null;
    const counts = {
      'New': requests.filter((r) => r.status === 'New').length,
      'Assessment Scheduled': requests.filter((r) => r.status === 'Assessment Scheduled').length,
      'Assessment Complete': requests.filter((r) => r.status === 'Assessment Complete').length,
      'Converted': requests.filter((r) => r.status === 'Converted').length,
    };
    return counts;
  }, [requests, isLoading]);

  return (
    <div className="rounded-lg bg-[var(--surface-color)] p-5 border border-[var(--border-color)]">
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">Overview by Status</p>
      {isLoading || !stats ? (
        <Loader2 className="h-5 w-5 animate-spin text-[var(--primary-green)]" aria-hidden />
      ) : (
        <div className="space-y-2.5">
          {[
            { status: 'New', count: stats['New'], color: 'bg-blue-500' },
            { status: 'Assessment Scheduled', count: stats['Assessment Scheduled'], color: 'bg-amber-400' },
            { status: 'Assessment Complete', count: stats['Assessment Complete'], color: 'bg-purple-500' },
            { status: 'Converted', count: stats['Converted'], color: 'bg-emerald-700' },
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

export default function Requests() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: requests = [], isLoading, error } = useRequests();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');

  const filtered = useMemo(() => {
    let result = requests;

    if (statusFilter !== 'All') {
      result = result.filter((r) => r.status === statusFilter);
    }

    const q = search.trim().toLowerCase();
    if (!q) return result;

    return result.filter(
      (request) =>
        (request.title?.toLowerCase().includes(q) ?? false) ||
        (request.contact_name?.toLowerCase().includes(q) ?? false)
    );
  }, [requests, search, statusFilter]);

  const requestStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      requestsPost({ action: 'request.update', id, status }),
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: requestsKeys.list() });
      const prev = qc.getQueryData<WorkRequest[]>(requestsKeys.list());
      qc.setQueryData(requestsKeys.list(), (old: WorkRequest[] | undefined) =>
        old?.map((r) => (r.id === variables.id ? { ...r, status: variables.status } : r))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(requestsKeys.list(), ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: requestsKeys.all }),
  });

  const stats = useMemo(() => {
    const newRequests = requests.filter((r) => r.status === 'New');
    const awaitingAssessment = requests.filter((r) => r.status === 'Assessment Scheduled');
    const converted = requests.filter((r) => r.status === 'Converted');

    return {
      newCount: newRequests.length,
      awaitingAssessmentCount: awaitingAssessment.length,
      convertedCount: converted.length,
    };
  }, [requests]);

  const wfSnap = useQuery({
    queryKey: ['reports', 'workflow_snapshot', 'requests-page'],
    queryFn: fetchWorkflowSnapshot,
    staleTime: 60_000,
  });

  return (
    <div>
      <p className="page-kicker">Lead Intake</p>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="mb-2 flex items-center gap-2">
            <Inbox size={28} aria-hidden className="shrink-0 text-[var(--primary-green)]" />
            Requests
          </h1>
          <p className="text-secondary mb-0">Track incoming work requests and convert them to quotes.</p>
        </div>
        <Button
          onClick={() => navigate('/requests/new')}
          className="btn btn-primary page-toolbar__cta"
        >
          New Request
        </Button>
      </div>

      {error && (
        <div className="card mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="min-w-0 max-w-full break-words text-sm">
            <span className="font-semibold text-[var(--color-danger)]">Error loading requests</span>
            <span className="text-secondary ml-1">Please try again later.</span>
          </p>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 mb-8 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatusBreakdownCard requests={requests} isLoading={isLoading} />
        <DashboardCard
          title="New This Week"
          value={stats.newCount}
          isLoading={isLoading}
        />
        <DashboardCard
          title="Awaiting Assessment"
          value={stats.awaitingAssessmentCount}
          isLoading={isLoading}
        />
        <DashboardCard
          title="Converted"
          value={stats.convertedCount}
          isLoading={isLoading}
        />
        <DashboardCard
          title="Quote conversion (30d)"
          value={wfSnap.data ? `${wfSnap.data.quotes_conversion_30d.rate}%` : '—'}
          subtitle={
            wfSnap.data
              ? `${wfSnap.data.quotes_conversion_30d.converted} won / ${wfSnap.data.quotes_conversion_30d.pool} sent (non-draft)`
              : undefined
          }
          isLoading={wfSnap.isLoading}
        />
      </div>

      <div className="card min-w-0 overflow-hidden p-0">
        <div className="flex flex-col gap-4 border-b border-[var(--border-color)] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="mb-1 flex items-center gap-2 text-[1.125rem] font-semibold">
              <Inbox size={20} aria-hidden className="shrink-0 text-[var(--primary-green)]" />
              All Requests
            </h3>
            <p className="mb-0 text-sm text-secondary">
              {isLoading ? 'Loading…' : `${filtered.length} shown · ${requests.length} total`}
            </p>
          </div>
          <div className="flex w-full min-w-0 flex-row flex-wrap items-center gap-3 sm:w-auto sm:max-w-[min(100%,44rem)] sm:justify-end">
            <div className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--border-color)] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
                  viewMode === 'list'
                    ? 'bg-[var(--primary-green)] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <List className="h-3.5 w-3.5" /> List
              </button>
              <button
                type="button"
                onClick={() => setViewMode('board')}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
                  viewMode === 'board'
                    ? 'bg-[var(--primary-green)] text-white'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Board
              </button>
            </div>
            <div className="relative min-w-0 flex-1 max-w-md">
              <Search
                size={18}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                type="search"
                className="w-full pl-10 h-10"
                placeholder="Title, contact…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search requests"
              />
            </div>
            <select
              className="h-10 w-56 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-color)] px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option>All</option>
              <option>New</option>
              <option>Assessment Scheduled</option>
              <option>Assessment Complete</option>
              <option>Converted</option>
              <option>Archived</option>
            </select>
          </div>
        </div>

        {viewMode === 'board' && (
          <div className="border-b border-[var(--border-color)] px-6 py-4">
            <StatusKanban<WorkRequest>
              columns={REQUEST_COLUMNS}
              items={filtered}
              getStatus={(r) => r.status}
              onStatusChange={(id, status) => requestStatusMutation.mutate({ id, status })}
              renderCard={(req) => (
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => navigate(`/requests/${req.id}`)}
                >
                  <p className="font-semibold text-[var(--text-primary)]">{req.title || 'Untitled'}</p>
                  {req.contact_name && (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{req.contact_name}</p>
                  )}
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    {formatInVancouver(new Date(req.requested_at), 'MMM d, yyyy')}
                  </p>
                </button>
              )}
            />
          </div>
        )}

        <div className={`max-h-[min(60vh,520px)] overflow-y-auto ${viewMode === 'board' ? 'hidden' : ''}`}>
          <div className="divide-y divide-[var(--border-color)]">
            {isLoading && requests.length === 0 && (
              <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-secondary">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                <span>Loading requests…</span>
              </div>
            )}
            {filtered.map((request) => (
              <div
                key={request.id}
                onClick={() => navigate(`/requests/${request.id}`)}
                className="flex flex-col gap-3 px-6 py-4 transition-colors hover:bg-[var(--surface-hover)] cursor-pointer sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <p className="font-semibold text-[var(--text-primary)]">
                      {request.title || 'Untitled Request'}
                    </p>
                  </div>
                  {request.contact_name && (
                    <p className="text-sm text-[var(--text-muted)] truncate">{request.contact_name}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 justify-between sm:gap-4">
                  <div className="flex items-center gap-2 text-[var(--text-muted)]">
                    {getSourceIcon(request.source)}
                  </div>
                  <p className="text-sm text-secondary">
                    {formatInVancouver(new Date(request.requested_at), 'MMM d, yyyy')}
                  </p>
                  <Badge variant={getStatusBadgeVariant(request.status)}>{request.status}</Badge>
                </div>
              </div>
            ))}
            {!isLoading && filtered.length === 0 && (
              <div className="px-6 py-16 text-center text-sm text-secondary">
                {requests.length === 0
                  ? 'No requests yet. Create one with New Request.'
                  : 'No requests match your search or filter.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
