import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, CreditCard, DollarSign, Clock, CheckCircle } from 'lucide-react';
import { apiFetch } from '../lib/apiClient';

// ── types ─────────────────────────────────────────────────────────────────────

interface PaymentRow {
  id: string;
  invoice_id: string;
  amount: number;
  payment_method: string | null;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  invoice: {
    id: string;
    invoice_number: number;
    title: string | null;
    due_date: string;
    account_id: string;
  } | null;
  account: {
    id: string;
    name: string;
    account_type: string | null;
  } | null;
}

interface PaymentsStats {
  total_collected: number;
  total_this_month: number;
  avg_days_residential: number | null;
  avg_days_commercial: number | null;
  paid_on_time_residential: number | null;
  paid_on_time_commercial: number | null;
}

interface PaymentsResponse {
  payments: PaymentRow[];
  stats: PaymentsStats;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const CAD = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function fetchPayments(): Promise<PaymentsResponse> {
  const res = await apiFetch('/api/invoices', {
    method: 'POST',
    body: JSON.stringify({ action: 'payments.list' }),
  });
  if (!res.ok) throw new Error('Failed to load payments');
  return res.json() as Promise<PaymentsResponse>;
}

// Method badge — uses border + muted bg so it works in both light and dark mode
function methodBadge(method: string | null) {
  const m = (method ?? 'other').toLowerCase();
  const label = m === 'stripe' ? 'Card (Stripe)'
    : method ? method.charAt(0).toUpperCase() + method.slice(1)
    : 'Other';
  const showCard = m === 'stripe' || m === 'credit card' || m === 'card';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--surface-raised)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-primary)]">
      {showCard && <CreditCard className="h-3 w-3 text-[var(--text-muted)]" />}
      {label}
    </span>
  );
}

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] p-6">
      <div className="mb-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function Payments() {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['payments', 'list'],
    queryFn: fetchPayments,
  });

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Succeeded' | 'Pending'>('All');
  const [methodFilter, setMethodFilter] = useState('All');
  const [activeTab,    setActiveTab]    = useState<'overview' | 'payouts'>('overview');

  const payments = data?.payments ?? [];
  const stats    = data?.stats;

  const allMethods = useMemo(() => {
    const s = new Set(payments.map(p => p.payment_method ?? 'Other'));
    return ['All', ...Array.from(s)];
  }, [payments]);

  const filtered = useMemo(() => {
    return payments.filter(p => {
      const q = search.toLowerCase();
      const matchSearch = !q
        || (p.account?.name ?? '').toLowerCase().includes(q)
        || String(p.invoice?.invoice_number ?? '').includes(q)
        || (p.payment_method ?? '').toLowerCase().includes(q)
        || CAD.format(p.amount).includes(q);
      const matchMethod = methodFilter === 'All' || (p.payment_method ?? 'Other').toLowerCase() === methodFilter.toLowerCase();
      return matchSearch && matchMethod;
    });
  }, [payments, search, methodFilter]);

  // ── loading / error ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-sm text-[var(--text-muted)]">
        Failed to load payments.
      </div>
    );
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">

      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Payments</h1>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-0 border-b border-[var(--border-color)]">
        {(['overview', 'payouts'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-[var(--primary-green)] text-[var(--primary-green)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'payouts' ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--surface-color)] text-sm text-[var(--text-muted)]">
          Payout reporting coming soon.
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">

            {/* Total collected */}
            <StatCard title="Total collected" subtitle="All time">
              <p className="text-3xl font-bold text-[var(--text-primary)]">{CAD.format(stats?.total_collected ?? 0)}</p>
              <div className="mt-3 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <DollarSign className="h-4 w-4 text-[var(--primary-green)]" />
                <span className="text-[var(--text-primary)]">{CAD.format(stats?.total_this_month ?? 0)}</span>
                <span>this month</span>
              </div>
            </StatCard>

            {/* Invoice payment time */}
            <StatCard title="Invoice payment time" subtitle="Past 30 days">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">
                      {stats?.avg_days_residential != null
                        ? `${stats.avg_days_residential} day${stats.avg_days_residential === 1 ? '' : 's'}`
                        : '—'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">Residential</p>
                  </div>
                  <Clock className="h-5 w-5 text-[var(--text-muted)] opacity-40" />
                </div>
                <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
                  <div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">
                      {stats?.avg_days_commercial != null
                        ? `${stats.avg_days_commercial} day${stats.avg_days_commercial === 1 ? '' : 's'}`
                        : '—'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">Commercial</p>
                  </div>
                  <Clock className="h-5 w-5 text-[var(--text-muted)] opacity-40" />
                </div>
              </div>
            </StatCard>

            {/* Invoices paid on time */}
            <StatCard title="Invoices paid on time" subtitle="Last 60 days">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">
                      {stats?.paid_on_time_residential != null ? `${stats.paid_on_time_residential}%` : '—'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">Residential</p>
                  </div>
                  <CheckCircle className="h-5 w-5 text-[var(--text-muted)] opacity-40" />
                </div>
                <div className="flex items-center justify-between border-t border-[var(--border-color)] pt-3">
                  <div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">
                      {stats?.paid_on_time_commercial != null ? `${stats.paid_on_time_commercial}%` : '—'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">Commercial</p>
                  </div>
                  <CheckCircle className="h-5 w-5 text-[var(--text-muted)] opacity-40" />
                </div>
              </div>
            </StatCard>
          </div>

          {/* Table header */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              All payments
              <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">({filtered.length} results)</span>
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              {/* Status filter */}
              <div className="flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--surface-color)] px-3 py-1.5 text-sm">
                <span className="font-medium text-[var(--text-primary)]">Status</span>
                <span className="text-[var(--border-color)]">|</span>
                {(['All', 'Succeeded', 'Pending'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
                      statusFilter === s
                        ? 'bg-[var(--border-color)] text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Method filter */}
              <div className="flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--surface-color)] px-3 py-1.5 text-sm">
                <span className="font-medium text-[var(--text-primary)]">Method</span>
                <span className="text-[var(--border-color)]">|</span>
                <select
                  value={methodFilter}
                  onChange={e => setMethodFilter(e.target.value)}
                  className="bg-transparent text-xs font-medium text-[var(--text-primary)] outline-none"
                >
                  {allMethods.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="flex items-center gap-2 rounded-full border border-[var(--border-color)] bg-[var(--surface-color)] px-3 py-1.5">
                <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Search payments..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-40 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)]">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-[var(--text-muted)]">
                No payments found.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Client</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Payment date</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Reference</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Method</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(payment => (
                    <tr
                      key={payment.id}
                      className="border-b border-[var(--border-color)] last:border-0 transition-colors hover:bg-[var(--surface-raised)]"
                    >
                      {/* Client + Invoice */}
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[var(--text-primary)]">
                          {payment.account?.name ?? '—'}
                        </p>
                        {payment.invoice && (
                          <button
                            onClick={() => navigate(`/invoices/${payment.invoice!.id}`)}
                            className="mt-0.5 text-xs text-[var(--primary-green)] hover:underline"
                          >
                            Invoice #{String(payment.invoice.invoice_number).padStart(4, '0')}
                            {payment.invoice.title ? ` — ${payment.invoice.title}` : ''}
                          </button>
                        )}
                      </td>

                      {/* Payment date */}
                      <td className="px-5 py-4 text-[var(--text-muted)]">
                        {fmtDate(payment.payment_date)}
                      </td>

                      {/* Reference */}
                      <td className="px-5 py-4 text-[var(--text-muted)]">
                        {payment.reference_number
                          ? <span className="font-mono text-xs">{payment.reference_number}</span>
                          : <span className="opacity-30">—</span>}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Succeeded
                        </span>
                      </td>

                      {/* Method */}
                      <td className="px-5 py-4">
                        {methodBadge(payment.payment_method)}
                      </td>

                      {/* Amount */}
                      <td className="px-5 py-4 text-right font-semibold text-[var(--text-primary)]">
                        {CAD.format(payment.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
