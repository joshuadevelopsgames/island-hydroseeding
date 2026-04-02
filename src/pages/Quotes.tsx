import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQuotes } from '@/hooks/useQuotes';
import { formatInVancouver } from '@/lib/vancouverTime';
import type { Quote, QuoteStatus } from '@/lib/quotesTypes';

const STATUS_COLORS: Record<QuoteStatus, 'default' | 'secondary' | 'outline'> = {
  Draft: 'outline',
  Sent: 'secondary',
  'Awaiting Response': 'secondary',
  'Changes Requested': 'outline',
  Approved: 'default',
  Converted: 'default',
};

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  return STATUS_COLORS[status as QuoteStatus] ?? 'outline';
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

function StatusBreakdownCard({ quotes, isLoading }: { quotes: Quote[]; isLoading: boolean }) {
  const stats = useMemo(() => {
    if (isLoading) return null;
    const counts = {
      Draft: quotes.filter((q) => q.status === 'Draft').length,
      Sent: quotes.filter((q) => q.status === 'Sent').length,
      'Awaiting Response': quotes.filter((q) => q.status === 'Awaiting Response').length,
      Approved: quotes.filter((q) => q.status === 'Approved').length,
      Converted: quotes.filter((q) => q.status === 'Converted').length,
    };
    return counts;
  }, [quotes, isLoading]);

  return (
    <div className="rounded-lg bg-[var(--surface-color)] p-5 border border-[var(--border-color)] shadow-sm dark:bg-slate-900">
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">Overview by Status</p>
      {isLoading || !stats ? (
        <Loader2 className="h-5 w-5 animate-spin text-[var(--primary-green)]" aria-hidden />
      ) : (
        <div className="space-y-2.5">
          {[
            { status: 'Draft', count: stats.Draft, color: 'bg-slate-400' },
            { status: 'Awaiting Response', count: stats['Awaiting Response'], color: 'bg-amber-400' },
            { status: 'Approved', count: stats.Approved, color: 'bg-green-500' },
            { status: 'Converted', count: stats.Converted, color: 'bg-emerald-700' },
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

export default function Quotes() {
  const navigate = useNavigate();
  const { data: quotes = [], isLoading, error } = useQuotes();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const filtered = useMemo(() => {
    let result = quotes;

    if (statusFilter !== 'All') {
      result = result.filter((q) => q.status === statusFilter);
    }

    const q = search.trim().toLowerCase();
    if (!q) return result;

    return result.filter(
      (quote) =>
        String(quote.quote_number).toLowerCase().includes(q) ||
        (quote.title?.toLowerCase().includes(q) ?? false)
    );
  }, [quotes, search, statusFilter]);

  const stats = useMemo(() => {
    const sent = quotes.filter((q) => q.status !== 'Draft');
    const converted = quotes.filter((q) => q.status === 'Converted');
    const sentTotal = sent.reduce((sum, q) => sum + q.total, 0);
    const convertedTotal = converted.reduce((sum, q) => sum + q.total, 0);

    return {
      sentCount: sent.length,
      sentTotal,
      convertedCount: converted.length,
      convertedTotal,
      conversionRate: sent.length > 0 ? ((converted.length / sent.length) * 100).toFixed(1) : '0.0',
    };
  }, [quotes]);

  return (
    <div>
      <p className="page-kicker">Revenue</p>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="mb-2 flex items-center gap-2">
            <FileText size={28} aria-hidden className="shrink-0 text-[var(--primary-green)]" />
            Quotes
          </h1>
          <p className="text-secondary mb-0">Create, send, and track quotes for your projects.</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => navigate('/quotes/templates')}
            variant="secondary"
          >
            Templates
          </Button>
          <Button
            onClick={() => navigate('/quotes/new')}
            className="btn btn-primary page-toolbar__cta"
          >
            New Quote
          </Button>
        </div>
      </div>

      {error && (
        <div className="card mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="min-w-0 max-w-full break-words text-sm">
            <span className="font-semibold text-[var(--color-danger)]">Error loading quotes</span>
            <span className="text-secondary ml-1">Please try again later.</span>
          </p>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 mb-8 md:grid-cols-2 lg:grid-cols-5">
        <StatusBreakdownCard quotes={quotes} isLoading={isLoading} />
        <DashboardCard
          title="Conversion Rate"
          value={`${stats.conversionRate}%`}
          subtitle={`${stats.convertedCount} of ${stats.sentCount} sent`}
          isLoading={isLoading}
        />
        <DashboardCard
          title="Sent"
          value={stats.sentCount}
          subtitle={formatCurrency(stats.sentTotal)}
          isLoading={isLoading}
        />
        <DashboardCard
          title="Converted"
          value={stats.convertedCount}
          subtitle={formatCurrency(stats.convertedTotal)}
          isLoading={isLoading}
        />
      </div>

      <div className="card min-w-0 overflow-hidden p-0">
        <div className="flex flex-col gap-4 border-b border-[var(--border-color)] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="mb-1 flex items-center gap-2 text-[1.125rem] font-semibold">
              <FileText size={20} aria-hidden className="shrink-0 text-[var(--primary-green)]" />
              All Quotes
            </h3>
            <p className="mb-0 text-sm text-secondary">
              {isLoading ? 'Loading…' : `${filtered.length} shown · ${quotes.length} total`}
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
                placeholder="Quote #, title…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search quotes"
              />
            </div>
            <select
              className="flex h-10 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-color)] px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option>All</option>
              <option>Draft</option>
              <option>Sent</option>
              <option>Awaiting Response</option>
              <option>Changes Requested</option>
              <option>Approved</option>
              <option>Converted</option>
            </select>
          </div>
        </div>

        <div className="max-h-[min(60vh,520px)] overflow-y-auto">
          <div className="divide-y divide-[var(--border-color)]">
            {isLoading && quotes.length === 0 && (
              <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-secondary">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                <span>Loading quotes…</span>
              </div>
            )}
            {filtered.map((quote) => (
              <div
                key={quote.id}
                onClick={() => navigate(`/quotes/${quote.id}`)}
                className="flex flex-col gap-3 px-6 py-4 transition-colors hover:bg-[var(--surface-hover)] cursor-pointer sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <p className="font-semibold text-[var(--text-primary)]">
                      Quote #{String(quote.quote_number).padStart(4, '0')}
                    </p>
                    {quote.title && (
                      <p className="text-sm text-[var(--text-muted)] truncate">— {quote.title}</p>
                    )}
                  </div>
                  {quote.property_id && (
                    <p className="text-sm text-[var(--text-muted)] truncate">Property: TBD</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 justify-between sm:gap-4">
                  <p className="text-sm text-secondary">
                    {formatInVancouver(new Date(quote.created_at), 'MMM d, yyyy')}
                  </p>
                  <Badge variant={getStatusBadgeVariant(quote.status)}>{quote.status}</Badge>
                  <p className="font-semibold text-[var(--text-primary)] w-24 text-right">
                    {formatCurrency(quote.total)}
                  </p>
                </div>
              </div>
            ))}
            {!isLoading && filtered.length === 0 && (
              <div className="px-6 py-16 text-center text-sm text-secondary">
                {quotes.length === 0
                  ? 'No quotes yet. Create one with New Quote.'
                  : 'No quotes match your search or filter.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
