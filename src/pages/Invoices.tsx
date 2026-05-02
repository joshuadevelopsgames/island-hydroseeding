import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useInvoices } from '@/hooks/useInvoices';
import { formatInVancouver } from '@/lib/vancouverTime';
import type { Invoice, InvoiceStatus } from '@/lib/invoicesTypes';

const STATUS_COLORS: Record<InvoiceStatus, 'default' | 'secondary' | 'outline'> = {
  Draft: 'outline',
  Sent: 'secondary',
  Viewed: 'secondary',
  Paid: 'default',
  Overdue: 'outline',
  'Bad Debt': 'outline',
};

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  return STATUS_COLORS[status as InvoiceStatus] ?? 'outline';
}

const INVOICE_FILTER_SELECT_CLASS =
  'h-10 w-full min-w-0 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-color)] px-3 text-sm text-[var(--text-primary)]';

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

function StatusBreakdownCard({ invoices, isLoading }: { invoices: Invoice[]; isLoading: boolean }) {
  const stats = useMemo(() => {
    if (isLoading) return null;
    const counts = {
      Draft: invoices.filter((i) => i.status === 'Draft').length,
      Sent: invoices.filter((i) => i.status === 'Sent').length,
      Overdue: invoices.filter((i) => i.status === 'Overdue').length,
      Paid: invoices.filter((i) => i.status === 'Paid').length,
    };
    return counts;
  }, [invoices, isLoading]);

  return (
    <div className="rounded-lg bg-[var(--surface-color)] p-5 border border-[var(--border-color)]">
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">Overview by Status</p>
      {isLoading || !stats ? (
        <Loader2 className="h-5 w-5 animate-spin text-[var(--primary-green)]" aria-hidden />
      ) : (
        <div className="space-y-2.5">
          {[
            { status: 'Draft', count: stats.Draft, color: 'bg-slate-400' },
            { status: 'Sent', count: stats.Sent, color: 'bg-amber-400' },
            { status: 'Overdue', count: stats.Overdue, color: 'bg-red-500' },
            { status: 'Paid', count: stats.Paid, color: 'bg-green-500' },
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

export default function Invoices() {
  const navigate = useNavigate();
  const { data: invoices = [], isLoading, error } = useInvoices();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const filtered = useMemo(() => {
    let result = invoices;

    if (statusFilter !== 'All') {
      result = result.filter((i) => i.status === statusFilter);
    }

    const q = search.trim().toLowerCase();
    if (!q) return result;

    return result.filter(
      (invoice) =>
        String(invoice.invoice_number).toLowerCase().includes(q) ||
        (invoice.title?.toLowerCase().includes(q) ?? false)
    );
  }, [invoices, search, statusFilter]);

  const stats = useMemo(() => {
    const outstanding = invoices.filter((i) => i.status !== 'Paid');
    const outstandingBalance = outstanding.reduce((sum, i) => sum + (i.balance_due || 0), 0);

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const paidThisMonth = invoices.filter(
      (i) => i.status === 'Paid' && new Date(i.updated_at) >= thisMonthStart
    );
    const paidThisMonthTotal = paidThisMonth.reduce((sum, i) => sum + (i.amount_paid || 0), 0);

    const totalRevenue = invoices.reduce((sum, i) => sum + (i.amount_paid || 0), 0);

    return {
      outstandingBalance,
      paidThisMonthTotal,
      totalRevenue,
    };
  }, [invoices]);

  return (
    <div>
      <p className="page-kicker">Revenue</p>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="mb-2 flex items-center gap-2">
            <Receipt size={28} aria-hidden className="shrink-0 text-[var(--primary-green)]" />
            Invoices
          </h1>
          <p className="text-secondary mb-0">Create, send, and track invoices for completed work.</p>
        </div>
        <Button
          onClick={() => navigate('/invoices/new')}
          className="btn btn-primary page-toolbar__cta"
        >
          New Invoice
        </Button>
      </div>

      {error && (
        <div className="card mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="min-w-0 max-w-full break-words text-sm">
            <span className="font-semibold text-[var(--color-danger)]">Error loading invoices</span>
            <span className="text-secondary ml-1">Please try again later.</span>
          </p>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 mb-8 md:grid-cols-2 lg:grid-cols-4">
        <StatusBreakdownCard invoices={invoices} isLoading={isLoading} />
        <DashboardCard
          title="Outstanding Balance"
          value={formatCurrency(stats.outstandingBalance)}
          isLoading={isLoading}
        />
        <DashboardCard
          title="Paid This Month"
          value={formatCurrency(stats.paidThisMonthTotal)}
          isLoading={isLoading}
        />
        <DashboardCard
          title="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          isLoading={isLoading}
        />
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mb-0.5 flex items-center gap-2 text-lg font-semibold">
            <Receipt size={20} aria-hidden className="shrink-0 text-[var(--primary-green)]" />
            All Invoices
          </h2>
          <p className="mb-0 text-sm text-[var(--text-secondary)]">
            {isLoading ? 'Loading…' : `${filtered.length} shown · ${invoices.length} total`}
          </p>
        </div>
      </div>

      <Card className="mb-4 min-w-0 p-4">
        <div className="flex w-full min-w-0 flex-row flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 max-w-md">
            <Search
              size={18}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <Input
              type="search"
              className="w-full min-w-0 pl-10"
              placeholder="Invoice #, title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search invoices"
            />
          </div>
          <div className="w-44 shrink-0 min-w-0 sm:w-48">
            <select
              className={INVOICE_FILTER_SELECT_CLASS}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option>All</option>
              <option>Draft</option>
              <option>Sent</option>
              <option>Viewed</option>
              <option>Paid</option>
              <option>Overdue</option>
              <option>Bad Debt</option>
            </select>
          </div>
        </div>
      </Card>

      <Card className="min-w-0 overflow-hidden p-0">
        <div className="max-h-[min(70vh,640px)] overflow-auto">
          {isLoading && invoices.length === 0 ? (
            <div className="flex items-center justify-center gap-3 px-6 py-20 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
              <span>Loading invoices…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-[var(--text-secondary)]">
              {invoices.length === 0
                ? 'No invoices yet. Create one with New Invoice.'
                : 'No invoices match your search or filter.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
                <thead className="sticky top-0 z-[1] border-b border-[var(--border-color)] bg-[var(--surface-raised)]">
                  <tr className="text-left text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-4 py-3 sm:px-6 w-[42%]">Invoice</th>
                    <th className="px-3 py-3 w-[16%]">Status</th>
                    <th className="px-3 py-3 w-[18%]">Issued</th>
                    <th className="px-4 py-3 text-right sm:px-6 w-[24%]">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)] bg-[var(--surface-color)]">
                  {filtered.map((invoice) => (
                    <tr
                      key={invoice.id}
                      tabIndex={0}
                      role="button"
                      onClick={() => navigate(`/invoices/${invoice.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/invoices/${invoice.id}`);
                        }
                      }}
                      className="cursor-pointer transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-green)] focus-visible:ring-inset"
                    >
                      <td className="px-4 py-3 sm:px-6 align-middle">
                        <div className="min-w-0 font-semibold text-[var(--text-primary)]">
                          Invoice #{String(invoice.invoice_number).padStart(4, '0')}
                        </div>
                        {invoice.title ? (
                          <div className="mt-0.5 truncate text-[var(--text-secondary)]">{invoice.title}</div>
                        ) : null}
                        {invoice.property_id ? (
                          <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">Property: TBD</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <Badge variant={getStatusBadgeVariant(invoice.status)}>{invoice.status}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 align-middle text-[var(--text-secondary)]">
                        {formatInVancouver(new Date(invoice.issue_date), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3 text-right align-middle sm:px-6">
                        <div className="font-semibold text-[var(--text-primary)]">{formatCurrency(invoice.total)}</div>
                        {invoice.balance_due > 0 ? (
                          <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                            Due: {formatCurrency(invoice.balance_due)}
                          </div>
                        ) : null}
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
