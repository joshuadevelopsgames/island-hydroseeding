import { useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, MoreHorizontal, ChevronUp, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuotes } from '@/hooks/useQuotes';
import { formatInVancouver } from '@/lib/vancouverTime';
import type { QuoteStatus } from '@/lib/quotesTypes';

/* ─── status badge color map ─── */
const STATUS_COLORS: Record<QuoteStatus, 'default' | 'secondary' | 'outline'> = {
  Draft: 'outline',
  Sent: 'secondary',
  'Awaiting Response': 'secondary',
  'Changes Requested': 'outline',
  Approved: 'default',
  Converted: 'default',
};

/* Jobber-style dot colors for the overview card */
const STATUS_DOT: Record<string, string> = {
  Draft: 'bg-slate-400',
  Sent: 'bg-blue-400',
  'Awaiting Response': 'bg-amber-400',
  'Changes Requested': 'bg-rose-400',
  Approved: 'bg-green-500',
  Converted: 'bg-emerald-700',
};

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  return STATUS_COLORS[status as QuoteStatus] ?? 'outline';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);
}

function compactCurrency(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`;
  }
  return formatCurrency(amount);
}

type SortKey = 'quote_number' | 'created_at' | 'status' | 'total';
type SortDir = 'asc' | 'desc';

export default function Quotes() {
  const navigate = useNavigate();
  const { data: quotes = [], isLoading, error } = useQuotes();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  /* ─── filtering ─── */
  const filtered = useMemo(() => {
    let result = quotes;
    if (statusFilter !== 'All') {
      result = result.filter((q) => q.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (quote) =>
          String(quote.quote_number).toLowerCase().includes(q) ||
          (quote.title?.toLowerCase().includes(q) ?? false)
      );
    }
    return result;
  }, [quotes, search, statusFilter]);

  /* ─── sorting ─── */
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'quote_number') cmp = a.quote_number - b.quote_number;
      else if (sortKey === 'created_at') cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortKey === 'total') cmp = a.total - b.total;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  /* ─── stats ─── */
  const stats = useMemo(() => {
    const draft = quotes.filter((q) => q.status === 'Draft');
    const awaiting = quotes.filter((q) => q.status === 'Awaiting Response');
    const changesReq = quotes.filter((q) => q.status === 'Changes Requested');
    const approved = quotes.filter((q) => q.status === 'Approved');
    const sent = quotes.filter((q) => q.status !== 'Draft');
    const converted = quotes.filter((q) => q.status === 'Converted');
    const sentTotal = sent.reduce((sum, q) => sum + q.total, 0);
    const convertedTotal = converted.reduce((sum, q) => sum + q.total, 0);
    return {
      draftCount: draft.length,
      awaitingCount: awaiting.length,
      changesReqCount: changesReq.length,
      approvedCount: approved.length,
      sentCount: sent.length,
      sentTotal,
      convertedCount: converted.length,
      convertedTotal,
      conversionRate: sent.length > 0 ? ((converted.length / sent.length) * 100).toFixed(0) : '0',
    };
  }, [quotes]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="h-3.5 w-3.5 opacity-30" />;
    return sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />;
  };

  return (
    <div>
      {/* ═══════════ HEADER (matches Jobber) ═══════════ */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Quotes</h1>

        <div className="flex items-center gap-2">
          <Button onClick={() => navigate('/quotes/new')}>
            New Quote
          </Button>

          {/* ••• More Actions dropdown */}
          <div className="relative" ref={moreRef}>
            <Button
              variant="secondary"
              onClick={() => setMoreOpen(!moreOpen)}
              className="gap-1.5"
            >
              <MoreHorizontal className="h-4 w-4" />
              More Actions
            </Button>
            {moreOpen && (
              <>
                {/* backdrop to close on outside click */}
                <div className="fixed inset-0 z-[40]" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-[50] w-48 rounded-md border border-[var(--border-color)] bg-[var(--surface-color)] py-1 shadow-lg">
                  <button
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                    onClick={() => { setMoreOpen(false); navigate('/quotes/templates'); }}
                  >
                    Templates
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
          Error loading quotes. <button className="underline ml-1" onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {/* ═══════════ DASHBOARD CARDS ROW (matches Jobber) ═══════════ */}
      <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Overview card — matches Jobber's status dot list */}
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] p-5">
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">Overview</p>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-[var(--primary-green)]" />
          ) : (
            <div className="space-y-2">
              {[
                { label: 'Draft', count: stats.draftCount, dot: STATUS_DOT.Draft },
                { label: 'Awaiting response', count: stats.awaitingCount, dot: STATUS_DOT['Awaiting Response'] },
                { label: 'Changes requested', count: stats.changesReqCount, dot: STATUS_DOT['Changes Requested'] },
                { label: 'Approved', count: stats.approvedCount, dot: STATUS_DOT.Approved },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-2 text-sm">
                  <span className={`inline-block h-2 w-2 rounded-full ${row.dot}`} />
                  <span className="text-[var(--text-secondary)] flex-1">{row.label} ({row.count})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conversion rate card */}
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] p-5">
          <div className="flex items-start justify-between mb-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Conversion rate</p>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-2">Past 30 days</p>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-[var(--primary-green)]" />
          ) : (
            <p className="text-3xl font-bold text-[var(--text-primary)]">{stats.conversionRate}%</p>
          )}
        </div>

        {/* Sent card */}
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] p-5">
          <div className="flex items-start justify-between mb-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Sent</p>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-2">Past 30 days</p>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-[var(--primary-green)]" />
          ) : (
            <>
              <p className="text-3xl font-bold text-[var(--text-primary)]">{stats.sentCount}</p>
              <p className="text-sm text-[var(--text-muted)]">{compactCurrency(stats.sentTotal)}</p>
            </>
          )}
        </div>

        {/* Converted card */}
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] p-5">
          <div className="flex items-start justify-between mb-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Converted</p>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-2">Past 30 days</p>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-[var(--primary-green)]" />
          ) : (
            <>
              <p className="text-3xl font-bold text-[var(--text-primary)]">{stats.convertedCount}</p>
              <p className="text-sm text-[var(--text-muted)]">{compactCurrency(stats.convertedTotal)}</p>
            </>
          )}
        </div>
      </div>

      {/* ═══════════ TABLE SECTION (matches Jobber) ═══════════ */}
      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] overflow-hidden">

        {/* "All quotes (N results)" header + filters + search */}
        <div className="border-b border-[var(--border-color)] px-5 py-4">
          <p className="text-base font-bold text-[var(--text-primary)] mb-3">
            All quotes{' '}
            <span className="font-normal text-[var(--text-muted)]">
              ({isLoading ? '…' : `${filtered.length} results`})
            </span>
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Pill filters */}
            <div className="flex flex-wrap gap-2">
              {['All', 'Draft', 'Sent', 'Awaiting Response', 'Approved', 'Converted'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? 'bg-[var(--primary-green)] text-white'
                      : 'bg-[var(--surface-raised,var(--surface-hover))] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  Status | {s}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="search"
                className="w-full rounded-md border border-[var(--border-color)] bg-[var(--surface-color)] py-2 pl-9 pr-3 text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-green)] focus:ring-opacity-40"
                placeholder="Search quotes..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Data table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--surface-raised,var(--surface-hover))]">
                <th className="whitespace-nowrap px-5 py-3 text-left font-medium text-[var(--text-secondary)]">
                  <button className="inline-flex items-center gap-1" onClick={() => handleSort('quote_number')}>
                    Quote number <SortIcon col="quote_number" />
                  </button>
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-left font-medium text-[var(--text-secondary)]">
                  Title
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-left font-medium text-[var(--text-secondary)]">
                  <button className="inline-flex items-center gap-1" onClick={() => handleSort('created_at')}>
                    Created <SortIcon col="created_at" />
                  </button>
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-left font-medium text-[var(--text-secondary)]">
                  <button className="inline-flex items-center gap-1" onClick={() => handleSort('status')}>
                    Status <SortIcon col="status" />
                  </button>
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-right font-medium text-[var(--text-secondary)]">
                  <button className="inline-flex items-center gap-1 ml-auto" onClick={() => handleSort('total')}>
                    Total <SortIcon col="total" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && quotes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center text-[var(--text-muted)]">
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Loading quotes…
                    </div>
                  </td>
                </tr>
              )}
              {sorted.map((quote) => (
                <tr
                  key={quote.id}
                  onClick={() => navigate(`/quotes/${quote.id}`)}
                  className="border-b border-[var(--border-color)] transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
                >
                  <td className="whitespace-nowrap px-5 py-3.5 font-medium text-[var(--text-primary)]">
                    #{String(quote.quote_number).padStart(4, '0')}
                  </td>
                  <td className="max-w-xs truncate px-5 py-3.5 text-[var(--text-primary)]">
                    {quote.title || '—'}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-[var(--text-secondary)]">
                    {formatInVancouver(new Date(quote.created_at), 'MMM d, yyyy')}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    <Badge variant={getStatusBadgeVariant(quote.status)}>{quote.status}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 text-right font-semibold text-[var(--text-primary)]">
                    {formatCurrency(quote.total)}
                  </td>
                </tr>
              ))}
              {!isLoading && sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center text-[var(--text-muted)]">
                    {quotes.length === 0
                      ? 'No quotes yet. Create one with New Quote.'
                      : 'No quotes match your search or filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
