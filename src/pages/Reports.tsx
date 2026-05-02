import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchReportJson } from '@/lib/reportsApi';
import { formatInVancouver } from '@/lib/vancouverTime';
import { downloadXlsx } from '@/lib/xlsxExport';

const REPORTS = [
  { id: 'aged_receivables', label: 'Aged receivables' },
  { id: 'projected_income', label: 'Projected income' },
  { id: 'lead_source_revenue', label: 'Lead source revenue' },
  { id: 'client_reengagement', label: 'Client re-engagement' },
  { id: 'products_services_usage', label: 'Products & services usage' },
] as const;

type ReportId = (typeof REPORTS)[number]['id'];

const today = () => formatInVancouver(new Date(), 'yyyy-MM-dd');

export default function Reports() {
  const [active, setActive] = useState<ReportId>('aged_receivables');

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
    queryKey: ['reports', 'lead_source_revenue'],
    queryFn: () => fetchReportJson<{ rows: { id: string | null; name: string; amount: number }[] }>(
      'lead_source_revenue',
      {}
    ),
    enabled: active === 'lead_source_revenue',
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
    queryKey: ['reports', 'products_services_usage'],
    queryFn: () =>
      fetchReportJson<{ rows: { product_service_name: string; quantity: number; revenue: number }[] }>(
        'products_services_usage'
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
  }, [active, aged.data, projected.data, leadSrc.data, reengage.data, products.data]);

  const handleExport = () => {
    if (exportTable.rows.length === 0) return;
    downloadXlsx(exportTable.filename, exportTable.headers, exportTable.rows);
  };

  return (
    <div className="flex min-h-[60vh] flex-col gap-6 lg:flex-row">
      <nav className="lg:w-56 shrink-0 rounded-lg border border-[var(--border-color)] bg-[var(--surface-color)] p-2">
        <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Reports</p>
        <ul className="space-y-1">
          {REPORTS.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setActive(r.id)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                  active === r.id
                    ? 'bg-[var(--primary-green)] font-medium text-white'
                    : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <FileText className="h-4 w-4 shrink-0 opacity-80" />
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            {REPORTS.find((r) => r.id === active)?.label}
          </h1>
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

        {active === 'aged_receivables' && (
          <ReportTable
            isLoading={aged.isLoading}
            error={aged.error}
            empty="No outstanding balances."
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
            empty="No unpaid invoices."
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
            empty="No paid invoice revenue in range."
            headers={['Lead source', 'Paid revenue']}
            rows={(leadSrc.data?.rows ?? []).map((r) => ({
              cells: [r.name, cad(r.amount)],
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
              empty="No accounts match."
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
            empty="No job line items yet."
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
  empty: string;
  headers: string[];
  rows: { cells: string[] }[];
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-[var(--text-muted)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }
  if (error) {
    return <p className="text-sm text-[var(--color-danger)]">{errMsg(error)}</p>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{empty}</p>;
  }
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
    </div>
  );
}
