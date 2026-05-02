import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchReportJson } from '@/lib/reportsApi';
import { formatInVancouver } from '@/lib/vancouverTime';
import { downloadXlsx } from '@/lib/xlsxExport';

const REPORTS = [
  { id: 'aged_receivables', label: 'Aged receivables' },
  { id: 'projected_income', label: 'Projected income' },
  { id: 'lead_source_revenue', label: 'Lead source revenue' },
  { id: 'revenue_by_service', label: 'Revenue by service' },
  { id: 'client_reengagement', label: 'Client re-engagement' },
  { id: 'products_services_usage', label: 'Products & services usage' },
] as const;

type ReportId = (typeof REPORTS)[number]['id'];

const today = () => formatInVancouver(new Date(), 'yyyy-MM-dd');

// Range picker — same vocabulary as Insights so cross-links flow naturally.
type RangeKey = 'this_month' | 'last_30' | 'last_90' | 'ytd' | 'last_year' | 'all';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_30', label: 'Last 30 days' },
  { key: 'last_90', label: 'Last 90 days' },
  { key: 'ytd', label: 'Year to date' },
  { key: 'last_year', label: 'Last 12 months' },
  { key: 'all', label: 'All time' },
];

function rangeBounds(r: RangeKey): { from: string; to: string } | null {
  if (r === 'all') return null;
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  if (r === 'this_month') from.setDate(1);
  else if (r === 'last_30') from.setDate(now.getDate() - 30);
  else if (r === 'last_90') from.setDate(now.getDate() - 90);
  else if (r === 'ytd') {
    from.setMonth(0);
    from.setDate(1);
  } else if (r === 'last_year') from.setFullYear(now.getFullYear() - 1);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Reports that pay attention to the from/to range. The others ignore it. */
const RANGE_AWARE: Record<ReportId, boolean> = {
  aged_receivables: false, // point-in-time
  projected_income: false, // point-in-time future-looking
  lead_source_revenue: true,
  revenue_by_service: true,
  client_reengagement: false,
  products_services_usage: true,
};

export default function Reports() {
  // URL params let Insights tiles deep-link into a specific report + range.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialReport = (searchParams.get('report') as ReportId) || 'aged_receivables';
  const initialRange = (searchParams.get('range') as RangeKey) || 'last_90';

  const [active, setActive] = useState<ReportId>(
    REPORTS.some((r) => r.id === initialReport) ? initialReport : 'aged_receivables'
  );
  const [range, setRange] = useState<RangeKey>(
    RANGE_OPTIONS.some((o) => o.key === initialRange) ? initialRange : 'last_90'
  );

  // Reflect picker state back into the URL so refresh / share preserves it.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('report', active);
    next.set('range', range);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // We deliberately omit setSearchParams from deps — react-router gives a
    // new identity each render which would loop forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, range]);

  const bounds = useMemo(() => rangeBounds(range), [range]);
  const rangeParams: Record<string, string> = bounds ? { from: bounds.from, to: bounds.to } : {};
  const rangeKey = bounds ? `${bounds.from}_${bounds.to}` : 'all';

  const aged = useQuery({
    queryKey: ['reports', 'aged_receivables'],
    queryFn: () => fetchReportJson<{ rows: Record<string, unknown>[] }>('aged_receivables'),
    enabled: active === 'aged_receivables',
  });

  const projected = useQuery({
    queryKey: ['reports', 'projected_income'],
    queryFn: () => fetchReportJson<{ rows: { month: string; amount: number }[] }>('projected_income'),
    enabled: active === 'projected_income',
  });

  const leadSrc = useQuery({
    queryKey: ['reports', 'lead_source_revenue', rangeKey],
    queryFn: () =>
      fetchReportJson<{ rows: { id: string | null; name: string; amount: number }[] }>(
        'lead_source_revenue',
        rangeParams
      ),
    enabled: active === 'lead_source_revenue',
  });

  const revBySvc = useQuery({
    queryKey: ['reports', 'revenue_by_service', rangeKey],
    queryFn: () =>
      fetchReportJson<{ rows: { category: string; revenue: number; line_items: number }[] }>(
        'revenue_by_service',
        rangeParams
      ),
    enabled: active === 'revenue_by_service',
  });

  const reengage = useQuery({
    queryKey: ['reports', 'client_reengagement', 12],
    queryFn: () =>
      fetchReportJson<{ rows: { id: string; name: string }[]; months: number }>('client_reengagement', {
        months: '12',
      }),
    enabled: active === 'client_reengagement',
  });

  const products = useQuery({
    queryKey: ['reports', 'products_services_usage', rangeKey],
    queryFn: () =>
      fetchReportJson<{ rows: { product_service_name: string; quantity: number; revenue: number }[] }>(
        'products_services_usage',
        rangeParams
      ),
    enabled: active === 'products_services_usage',
  });

  const cad = useMemo(
    () => (n: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n),
    []
  );

  /** Build [headers, rows] for the active report — used by the XLSX export. */
  const exportTable = useMemo(() => {
    if (active === 'aged_receivables') {
      const data = aged.data?.rows ?? [];
      return {
        headers: ['Invoice #', 'Title', 'Account', 'Due', 'Balance', 'Bucket', 'Days late', 'Status'],
        rows: data.map((r) => [
          (r.invoice_number as string | number | null) ?? null,
          (r.title as string | null) ?? null,
          (r.account_name as string | null) ?? null,
          (r.due_date as string | null) ?? null,
          Number(r.balance_due ?? 0),
          (r.aging_bucket as string | null) ?? null,
          Number(r.days_past_due ?? 0),
          (r.status as string | null) ?? null,
        ]),
        filename: `aged-receivables-${today()}`,
      };
    }
    if (active === 'projected_income') {
      const data = projected.data?.rows ?? [];
      return {
        headers: ['Due month', 'Open balance'],
        rows: data.map((r) => [r.month, Number(r.amount)]),
        filename: `projected-income-${today()}`,
      };
    }
    if (active === 'lead_source_revenue') {
      const data = leadSrc.data?.rows ?? [];
      return {
        headers: ['Lead source', 'Paid revenue'],
        rows: data.map((r) => [r.name, Number(r.amount)]),
        filename: `lead-source-revenue-${today()}`,
      };
    }
    if (active === 'revenue_by_service') {
      const data = revBySvc.data?.rows ?? [];
      return {
        headers: ['Service category', 'Revenue', 'Line items'],
        rows: data.map((r) => [r.category, Number(r.revenue), Number(r.line_items)]),
        filename: `revenue-by-service-${today()}`,
      };
    }
    if (active === 'client_reengagement') {
      const data = reengage.data?.rows ?? [];
      return {
        headers: ['Account'],
        rows: data.map((r) => [r.name]),
        filename: `client-reengagement-${today()}`,
      };
    }
    if (active === 'products_services_usage') {
      const data = products.data?.rows ?? [];
      return {
        headers: ['Product / service', 'Quantity', 'Revenue'],
        rows: data.map((r) => [r.product_service_name, Number(r.quantity), Number(r.revenue)]),
        filename: `products-usage-${today()}`,
      };
    }
    return { headers: [], rows: [] as (string | number | null)[][], filename: 'report' };
  }, [active, aged.data, projected.data, leadSrc.data, revBySvc.data, reengage.data, products.data]);

  const handleExport = () => {
    if (exportTable.rows.length === 0) return;
    downloadXlsx(exportTable.filename, exportTable.headers, exportTable.rows);
  };

  return (
    <div className="flex min-h-[60vh] flex-col gap-6 lg:flex-row">
      <nav className="lg:w-56 shrink-0 rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] p-2">
        <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Reports</p>
        <ul className="space-y-1">
          {REPORTS.map((r) => {
            const isActive = active === r.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setActive(r.id)}
                  className={`group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                    isActive
                      ? 'bg-[var(--surface-raised)] font-semibold text-[var(--text-primary)] border-l-2 border-[var(--primary-green)] pl-[10px]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] border-l-2 border-transparent pl-[10px]'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <FileText className="h-4 w-4 shrink-0 opacity-80" />
                  {r.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            {REPORTS.find((r) => r.id === active)?.label}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {RANGE_AWARE[active] && (
              <RangePicker value={range} onChange={setRange} />
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={exportTable.rows.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export Excel
            </Button>
          </div>
        </div>

        {RANGE_AWARE[active] && bounds && (
          <p className="text-xs text-[var(--text-muted)]">
            {bounds.from} — {bounds.to}
          </p>
        )}

        {active === 'aged_receivables' && (
          <ReportTable
            isLoading={aged.isLoading}
            error={aged.error}
            empty={{ message: 'No outstanding balances.', cta: 'Send your first invoice', href: '/invoices/new' }}
            headers={['Account', 'Invoice', 'Due', 'Balance', 'Bucket', 'Days late']}
            rows={(aged.data?.rows ?? []).map((r) => ({
              cells: [
                String(r.account_name ?? '—'),
                `#${r.invoice_number} ${r.title ?? ''}`.trim(),
                String(r.due_date ?? '—'),
                cad(Number(r.balance_due ?? 0)),
                String(r.aging_bucket ?? '—'),
                String(r.days_past_due ?? ''),
              ],
            }))}
          />
        )}

        {active === 'projected_income' && (
          <ReportTable
            isLoading={projected.isLoading}
            error={projected.error}
            empty={{ message: 'No unpaid invoices.', cta: 'Create an invoice', href: '/invoices/new' }}
            headers={['Due month', 'Open balance']}
            rows={(projected.data?.rows ?? []).map((r) => ({
              cells: [r.month, cad(r.amount)],
            }))}
          />
        )}

        {active === 'lead_source_revenue' && (
          <ReportTable
            isLoading={leadSrc.isLoading}
            error={leadSrc.error}
            empty={{ message: 'No paid invoice revenue in this range.', cta: 'View invoices', href: '/invoices' }}
            headers={['Lead source', 'Paid revenue']}
            rows={(leadSrc.data?.rows ?? []).map((r) => ({
              cells: [r.name, cad(r.amount)],
            }))}
          />
        )}

        {active === 'revenue_by_service' && (
          <ReportTable
            isLoading={revBySvc.isLoading}
            error={revBySvc.error}
            empty={{ message: 'No invoiced revenue in this range.', cta: 'Manage products & services', href: '/quotes/templates' }}
            headers={['Service category', 'Revenue', 'Line items']}
            rows={(revBySvc.data?.rows ?? []).map((r) => ({
              cells: [r.category, cad(r.revenue), String(r.line_items)],
            }))}
          />
        )}

        {active === 'client_reengagement' && (
          <div className="space-y-2">
            <p className="text-sm text-[var(--text-secondary)]">
              Accounts with no completed job in the last {reengage.data?.months ?? 12} months.
            </p>
            <ReportTable
              isLoading={reengage.isLoading}
              error={reengage.error}
              empty={{ message: 'Every account had recent work — nice.', cta: 'View accounts', href: '/crm' }}
              headers={['Account']}
              rows={(reengage.data?.rows ?? []).map((r) => ({
                cells: [r.name],
              }))}
            />
          </div>
        )}

        {active === 'products_services_usage' && (
          <ReportTable
            isLoading={products.isLoading}
            error={products.error}
            empty={{ message: 'No job line items yet for this range.', cta: 'View jobs', href: '/jobs' }}
            headers={['Product / service', 'Qty', 'Revenue']}
            rows={(products.data?.rows ?? []).map((r) => ({
              cells: [r.product_service_name, String(r.quantity), cad(r.revenue)],
            }))}
          />
        )}
      </section>
    </div>
  );
}

function RangePicker({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return (
    <div
      className="inline-flex flex-wrap gap-1 rounded-md border border-[var(--border-color)] bg-[var(--surface-color)] p-1"
      role="group"
      aria-label="Date range"
    >
      {RANGE_OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded px-3 py-1 text-xs font-medium transition ${
            value === o.key
              ? 'bg-[var(--primary-green)] text-white'
              : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
          }`}
          aria-pressed={value === o.key}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e ?? '');
}

function ReportTable({
  isLoading,
  error,
  empty,
  headers,
  rows,
}: {
  isLoading: boolean;
  error: unknown;
  empty: { message: string; cta?: string; href?: string } | string;
  headers: string[];
  rows: { cells: string[] }[];
}) {
  if (isLoading) {
    // Skeleton rows so the user sees the table shape while data loads.
    return (
      <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="border-b border-[var(--border-color)] bg-[var(--surface-raised)]">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}>
                {headers.map((_h, j) => (
                  <td key={j} className="px-4 py-2.5">
                    <div
                      className="h-4 rounded bg-[var(--border-color)] opacity-50"
                      style={{ width: j === 0 ? '70%' : '40%' }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-[var(--text-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      </div>
    );
  }
  if (error) {
    return <p className="text-sm text-[var(--color-danger)]">{errMsg(error)}</p>;
  }
  if (rows.length === 0) {
    const e = typeof empty === 'string' ? { message: empty } : empty;
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--surface-color)] p-8 text-center">
        <p className="text-sm text-[var(--text-secondary)]">{e.message}</p>
        {e.cta && e.href && (
          <a
            href={e.href}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--primary-green)] hover:underline"
          >
            {e.cta} →
          </a>
        )}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
      {/* Desktop table */}
      <table className="hidden w-full text-sm sm:table">
        <thead className="border-b border-[var(--border-color)] bg-[var(--surface-raised)]">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-color)]">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-[var(--surface-hover)]">
              {r.cells.map((c, j) => (
                <td key={j} className="px-4 py-2 text-[var(--text-primary)]">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {/* Mobile cards — same data, stacked label/value pairs. */}
      <ul className="divide-y divide-[var(--border-color)] sm:hidden">
        {rows.map((r, i) => (
          <li key={i} className="space-y-1 px-4 py-3">
            {r.cells.map((c, j) => (
              <div key={j} className="flex items-baseline justify-between gap-3">
                <span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{headers[j]}</span>
                <span className={j === 0 ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}>
                  {c}
                </span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
