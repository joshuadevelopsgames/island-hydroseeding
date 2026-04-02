import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, CreditCard, DollarSign, Clock, CheckCircle } from 'lucide-react';

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
  const res = await fetch('/api/invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'payments.list' }),
  });
  if (!res.ok) throw new Error('Failed to load payments');
  return res.json() as Promise<PaymentsResponse>;
}

const METHOD_COLORS: Record<string, string> = {
  stripe:       'bg-purple-100 text-purple-700',
  'credit card':'bg-purple-100 text-purple-700',
  card:         'bg-purple-100 text-purple-700',
  'e-transfer': 'bg-blue-100 text-blue-700',
  cash:         'bg-green-100 text-green-700',
  cheque:       'bg-amber-100 text-amber-700',
  other:        'bg-slate-100 text-slate-600',
};

function methodBadge(method: string | null) {
  const m = (method ?? 'other').toLowerCase();
  const cls = METHOD_COLORS[m] ?? METHOD_COLORS.other;
  const label = method === 'stripe' ? 'Card (Stripe)'
    : method ? method.charAt(0).toUpperCase() + method.slice(1)
    : 'Other';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {(m === 'stripe' || m === 'credit card' || m === 'card') && <CreditCard className="h-3 w-3" />}
      {label}
    </span>
  );
}

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
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

  // All unique methods for the filter dropdown
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
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
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
      <div className="mb-6 flex gap-0 border-b border-slate-200">
        {(['overview', 'payouts'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-green-600 text-green-700'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'payouts' ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-400">
          Payout reporting coming soon.
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">

            {/* Total collected */}
            <StatCard title="Total collected" subtitle="All time">
              <p className="text-3xl font-bold text-slate-900">{CAD.format(stats?.total_collected ?? 0)}</p>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <DollarSign className="h-4 w-4 text-green-500" />
                <span>{CAD.format(stats?.total_this_month ?? 0)}</span>
                <span className="text-slate-400">this month</span>
              </div>
            </StatCard>

            {/* Invoice payment time */}
            <StatCard title="Invoice payment time" subtitle="Past 30 days">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-slate-900">
                      {stats?.avg_days_residential != null ? `${stats.avg_days_residential} day${stats.avg_days_residential === 1 ? '' : 's'}` : '—'}
                    </p>
                    <p className="text-xs text-slate-500">Residential</p>
                  </div>
                  <Clock className="h-5 w-5 text-slate-300" />
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <div>
                    <p className="text-2xl font-bold text-slate-900">
                      {stats?.avg_days_commercial != null ? `${stats.avg_days_commercial} day${stats.avg_days_commercial === 1 ? '' : 's'}` : '—'}
                    </p>
                    <p className="text-xs text-slate-500">Commercial</p>
                  </div>
                  <Clock className="h-5 w-5 text-slate-300" />
                </div>
              </div>
            </StatCard>

            {/* Invoices paid on time */}
            <StatCard title="Invoices paid on time" subtitle="Last 60 days">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-slate-900">
                      {stats?.paid_on_time_residential != null ? `${stats.paid_on_time_residential}%` : '—'}
                    </p>
                    <p className="text-xs text-slate-500">Residential</p>
                  </div>
                  <CheckCircle className="h-5 w-5 text-slate-300" />
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <div>
                    <p className="text-2xl font-bold text-slate-900">
                      {stats?.paid_on_time_commercial != null ? `${stats.paid_on_time_commercial}%` : '—'}
                    </p>
                    <p className="text-xs text-slate-500">Commercial</p>
                  </div>
                  <CheckCircle className="h-5 w-5 text-slate-300" />
                </div>
              </div>
            </StatCard>
          </div>

          {/* Table header */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-800">
              All payments
              <span className="ml-2 text-sm font-normal text-slate-400">({filtered.length} results)</span>
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              {/* Status filter */}
              <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm">
                <span className="font-medium text-slate-600">Status</span>
                <span className="text-slate-300">|</span>
                {(['All', 'Succeeded', 'Pending'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${statusFilter === s ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Method filter */}
              <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm">
                <span className="font-medium text-slate-600">Method</span>
                <span className="text-slate-300">|</span>
                <select
                  value={methodFilter}
                  onChange={e => setMethodFilter(e.target.value)}
                  className="bg-transparent text-xs font-medium text-slate-700 outline-none"
                >
                  {allMethods.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search payments..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-40 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400">
                No payments found.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Client</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Payment date</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Reference</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Method</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(payment => (
                    <tr
                      key={payment.id}
                      className="group transition-colors hover:bg-slate-50"
                    >
                      {/* Client + Invoice */}
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800">
                          {payment.account?.name ?? '—'}
                        </p>
                        {payment.invoice && (
                          <button
                            onClick={() => navigate(`/invoices/${payment.invoice!.id}`)}
                            className="mt-0.5 text-xs text-green-600 hover:underline"
                          >
                            Invoice #{String(payment.invoice.invoice_number).padStart(4, '0')}
                            {payment.invoice.title ? ` — ${payment.invoice.title}` : ''}
                          </button>
                        )}
                      </td>

                      {/* Payment date */}
                      <td className="px-5 py-4 text-slate-600">
                        {fmtDate(payment.payment_date)}
                      </td>

                      {/* Reference */}
                      <td className="px-5 py-4 text-slate-500">
                        {payment.reference_number
                          ? <span className="font-mono text-xs">{payment.reference_number}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          Succeeded
                        </span>
                      </td>

                      {/* Method */}
                      <td className="px-5 py-4">
                        {methodBadge(payment.payment_method)}
                      </td>

                      {/* Amount */}
                      <td className="px-5 py-4 text-right font-semibold text-slate-800">
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
