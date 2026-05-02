import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useQuotes } from '@/hooks/useQuotes';
import { useInvoices } from '@/hooks/useInvoices';
import { useJobs } from '@/hooks/useJobs';

const CAD = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });

type RangeKey = 'this_month' | 'last_30' | 'last_90' | 'ytd' | 'last_year' | 'all';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_30', label: 'Last 30 days' },
  { key: 'last_90', label: 'Last 90 days' },
  { key: 'ytd', label: 'Year to date' },
  { key: 'last_year', label: 'Last 12 months' },
  { key: 'all', label: 'All time' },
];

function rangeBounds(r: RangeKey): { from: Date; to: Date } {
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
  else from.setFullYear(2000); // 'all'
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function priorRange(r: RangeKey): { from: Date; to: Date } {
  const { from, to } = rangeBounds(r);
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - span), to: new Date(from.getTime()) };
}

function inRange(iso: string | null | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function pct(curr: number, prev: number): number | null {
  if (prev === 0 && curr === 0) return 0;
  if (prev === 0) return null; // can't compute % from a zero base
  return ((curr - prev) / prev) * 100;
}

export default function Insights() {
  const [range, setRange] = useState<RangeKey>('this_month');
  const { data: quotes = [] } = useQuotes();
  const { data: invoices = [] } = useInvoices();
  const { data: jobs = [] } = useJobs();

  const { from, to } = useMemo(() => rangeBounds(range), [range]);
  const prior = useMemo(() => priorRange(range), [range]);

  // ─── Overview KPIs ─────────────────────────────────────────
  const overview = useMemo(() => {
    const newQuotesCurr = quotes.filter((q) => inRange(q.created_at, from, to)).length;
    const newQuotesPrev = quotes.filter((q) => inRange(q.created_at, prior.from, prior.to)).length;

    const convertedCurr = quotes.filter(
      (q) => q.converted_at && inRange(q.converted_at, from, to)
    ).length;
    const convertedPrev = quotes.filter(
      (q) => q.converted_at && inRange(q.converted_at, prior.from, prior.to)
    ).length;

    const newInvoicesCurr = invoices.filter((i) => inRange(i.created_at, from, to));
    const newInvoicesPrev = invoices.filter((i) => inRange(i.created_at, prior.from, prior.to));

    const invoicedCurr = newInvoicesCurr.reduce((s, i) => s + Number(i.total ?? 0), 0);
    const invoicedPrev = newInvoicesPrev.reduce((s, i) => s + Number(i.total ?? 0), 0);

    const paidCurr = newInvoicesCurr.reduce((s, i) => s + Number(i.amount_paid ?? 0), 0);
    const paidPrev = newInvoicesPrev.reduce((s, i) => s + Number(i.amount_paid ?? 0), 0);

    return {
      newQuotes: { curr: newQuotesCurr, change: pct(newQuotesCurr, newQuotesPrev) },
      converted: { curr: convertedCurr, change: pct(convertedCurr, convertedPrev) },
      newInvoices: { curr: newInvoicesCurr.length, change: pct(newInvoicesCurr.length, newInvoicesPrev.length) },
      invoiced: { curr: invoicedCurr, change: pct(invoicedCurr, invoicedPrev) },
      collected: { curr: paidCurr, change: pct(paidCurr, paidPrev) },
    };
  }, [quotes, invoices, from, to, prior.from, prior.to]);

  // ─── Revenue YoY (monthly bars) ────────────────────────────
  const revenueYoY = useMemo(() => {
    const now = new Date();
    const thisYear = now.getFullYear();
    const lastYear = thisYear - 1;
    const monthly = (year: number) => {
      const out = new Array(12).fill(0);
      for (const inv of invoices) {
        const d = new Date(inv.issue_date || inv.created_at);
        if (d.getFullYear() !== year) continue;
        out[d.getMonth()] += Number(inv.total ?? 0);
      }
      return out;
    };
    return { thisYear, lastYear, current: monthly(thisYear), prev: monthly(lastYear) };
  }, [invoices]);

  // ─── Cashflow tiles ────────────────────────────────────────
  const cashflow = useMemo(() => {
    const outstanding = invoices
      .filter((i) => i.status !== 'Paid' && Number(i.balance_due) > 0)
      .reduce((s, i) => s + Number(i.balance_due), 0);

    // Average days from issue to paid (for invoices that have closed in the range).
    const closedInRange = invoices.filter(
      (i) => i.status === 'Paid' && inRange(i.updated_at, from, to)
    );
    const avgDaysToPaid =
      closedInRange.length === 0
        ? null
        : closedInRange.reduce((s, i) => {
            const issued = new Date(i.issue_date).getTime();
            const closed = new Date(i.updated_at).getTime();
            return s + (closed - issued) / 86400000;
          }, 0) / closedInRange.length;

    // Projected income = sum of accepted/converted quote totals not yet invoiced.
    const invoicedQuoteIds = new Set(invoices.map((i) => i.quote_id).filter(Boolean));
    const projected = quotes
      .filter((q) => (q.status === 'Approved' || q.status === 'Converted') && !invoicedQuoteIds.has(q.id))
      .reduce((s, q) => s + Number(q.total ?? 0), 0);

    return { outstanding, avgDaysToPaid, projected };
  }, [invoices, quotes, from, to]);

  // ─── Funnel & quote conversion ─────────────────────────────
  const funnel = useMemo(() => {
    const sentInRange = quotes.filter(
      (q) => (q.status === 'Sent' || q.status === 'Approved' || q.status === 'Converted') && inRange(q.created_at, from, to)
    );
    const approved = sentInRange.filter((q) => q.status === 'Approved' || q.status === 'Converted').length;
    const converted = sentInRange.filter((q) => q.status === 'Converted').length;

    const sentValue = sentInRange.reduce((s, q) => s + Number(q.total ?? 0), 0);
    const approvedValue = sentInRange
      .filter((q) => q.status === 'Approved' || q.status === 'Converted')
      .reduce((s, q) => s + Number(q.total ?? 0), 0);

    const conversionRate = sentInRange.length === 0 ? 0 : (approved / sentInRange.length) * 100;

    return { sent: sentInRange.length, approved, converted, sentValue, approvedValue, conversionRate };
  }, [quotes, from, to]);

  // ─── Jobs section ──────────────────────────────────────────
  const jobsSummary = useMemo(() => {
    type J = { status?: string; created_at?: string };
    const inRangeJobs = (jobs as J[]).filter((j) => inRange(j.created_at, from, to));
    const total = inRangeJobs.length;
    const active = (jobs as J[]).filter((j) => j.status && j.status !== 'Completed' && j.status !== 'Archived').length;
    return { total, active };
  }, [jobs, from, to]);

  return (
    <div className="page">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="flex items-center gap-3 mb-2">
            <BarChart3 size={28} style={{ color: 'var(--primary-green)' }} />
            Insights
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            How the business is moving. Numbers update from your quotes, invoices, and payments.
          </p>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      {/* Overview band */}
      <Section title="Overview" subtitle={rangeLabel(range)}>
        <div className="ins-kpi-grid">
          <KpiTile label="New quotes" value={String(overview.newQuotes.curr)} change={overview.newQuotes.change} />
          <KpiTile label="Converted" value={String(overview.converted.curr)} change={overview.converted.change} />
          <KpiTile label="New invoices" value={String(overview.newInvoices.curr)} change={overview.newInvoices.change} />
          <KpiTile label="Invoiced" value={CAD.format(overview.invoiced.curr)} change={overview.invoiced.change} />
          <KpiTile label="Collected" value={CAD.format(overview.collected.curr)} change={overview.collected.change} />
        </div>
      </Section>

      {/* Revenue YoY */}
      <Section title="Revenue" subtitle="By month, this year vs last">
        <div className="ins-yoy-totals">
          <div>
            <div className="ins-yoy-num">{CAD.format(revenueYoY.current.reduce((s, n) => s + n, 0))}</div>
            <div className="ins-yoy-lbl"><span className="ins-swatch ins-swatch--curr" /> {revenueYoY.thisYear}</div>
          </div>
          <div>
            <div className="ins-yoy-num ins-yoy-num--muted">
              {CAD.format(revenueYoY.prev.reduce((s, n) => s + n, 0))}
            </div>
            <div className="ins-yoy-lbl"><span className="ins-swatch ins-swatch--prev" /> {revenueYoY.lastYear}</div>
          </div>
        </div>
        <YoYBars current={revenueYoY.current} prev={revenueYoY.prev} />
      </Section>

      {/* Cashflow */}
      <Section title="Cashflow" subtitle="Outstanding, projected, and how fast you're paid">
        <div className="ins-kpi-grid ins-kpi-grid--3">
          <KpiTile label="Outstanding" value={CAD.format(cashflow.outstanding)} sub="Unpaid invoices" />
          <KpiTile
            label="Avg time to paid"
            value={cashflow.avgDaysToPaid == null ? '—' : `${cashflow.avgDaysToPaid.toFixed(1)} days`}
            sub="Issued → cleared"
          />
          <KpiTile label="Projected income" value={CAD.format(cashflow.projected)} sub="Accepted quotes not yet invoiced" />
        </div>
      </Section>

      {/* Funnel + conversion */}
      <Section title="Quotes" subtitle="Sent, accepted, converted to invoice">
        <div className="ins-funnel-row">
          <div className="ins-funnel-card">
            <div className="ins-funnel-step">
              <div className="ins-funnel-num">{funnel.sent}</div>
              <div className="ins-funnel-lbl">Sent</div>
              <div className="ins-funnel-sub">{CAD.format(funnel.sentValue)}</div>
            </div>
            <div className="ins-funnel-arrow">→</div>
            <div className="ins-funnel-step">
              <div className="ins-funnel-num">{funnel.approved}</div>
              <div className="ins-funnel-lbl">Accepted</div>
              <div className="ins-funnel-sub">{CAD.format(funnel.approvedValue)}</div>
            </div>
            <div className="ins-funnel-arrow">→</div>
            <div className="ins-funnel-step">
              <div className="ins-funnel-num">{funnel.converted}</div>
              <div className="ins-funnel-lbl">Invoiced</div>
              <div className="ins-funnel-sub">&nbsp;</div>
            </div>
          </div>
          <div className="ins-conv-card">
            <div className="ins-conv-num">{funnel.conversionRate.toFixed(0)}%</div>
            <div className="ins-conv-lbl">Conversion rate</div>
            <ConversionDonut pct={funnel.conversionRate} />
          </div>
        </div>
      </Section>

      {/* Jobs */}
      <Section title="Jobs" subtitle="Work in progress">
        <div className="ins-kpi-grid ins-kpi-grid--2">
          <KpiTile label="New jobs" value={String(jobsSummary.total)} sub={rangeLabel(range)} />
          <KpiTile label="Active jobs" value={String(jobsSummary.active)} sub="Open right now" />
        </div>
      </Section>

      <style>{INSIGHTS_CSS}</style>
    </div>
  );
}

function rangeLabel(r: RangeKey): string {
  return RANGE_OPTIONS.find((o) => o.key === r)?.label ?? '';
}

function RangePicker({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return (
    <div className="ins-range-picker">
      {RANGE_OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={'ins-range-btn ' + (value === o.key ? 'is-active' : '')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="ins-section">
      <div className="ins-section-head">
        <h2 className="ins-section-title">{title}</h2>
        {subtitle && <span className="ins-section-sub">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function KpiTile({
  label,
  value,
  change,
  sub,
}: {
  label: string;
  value: string;
  change?: number | null;
  sub?: string;
}) {
  const changeDisplay =
    change == null ? null : (
      <span className={'ins-kpi-change ' + (change >= 0 ? 'is-up' : 'is-down')}>
        {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(0)}%
      </span>
    );
  return (
    <div className="ins-kpi">
      <div className="ins-kpi-label">{label}</div>
      <div className="ins-kpi-value">{value}</div>
      <div className="ins-kpi-meta">
        {changeDisplay}
        {sub && <span className="ins-kpi-sub">{sub}</span>}
      </div>
    </div>
  );
}

/** Year-over-year monthly bar chart. Side-by-side bars per month. */
function YoYBars({ current, prev }: { current: number[]; prev: number[] }) {
  const max = Math.max(1, ...current, ...prev);
  const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const W = 720;
  const H = 220;
  const padX = 28;
  const padY = 28;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const groupW = innerW / 12;
  const barW = (groupW - 6) / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ins-yoy-svg" role="img" aria-label="Monthly revenue, this year vs last">
      <line x1={padX} y1={padY + innerH} x2={W - padX} y2={padY + innerH} stroke="var(--border-color)" />
      {current.map((c, i) => {
        const p = prev[i] ?? 0;
        const x = padX + i * groupW + 3;
        const cH = (c / max) * innerH;
        const pH = (p / max) * innerH;
        return (
          <g key={i}>
            <rect x={x} y={padY + innerH - pH} width={barW} height={pH} fill="var(--accent-soft, #d9e9dd)" rx="2" />
            <rect x={x + barW + 2} y={padY + innerH - cH} width={barW} height={cH} fill="var(--primary-green, #2a7a3a)" rx="2" />
            <text
              x={x + barW + 1}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="var(--text-muted)"
            >
              {months[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ConversionDonut({ pct }: { pct: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg viewBox="0 0 100 100" width="92" height="92" className="ins-donut">
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border-color)" strokeWidth="10" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="var(--primary-green, #2a7a3a)"
        strokeWidth="10"
        strokeDasharray={`${dash} ${c - dash}`}
        strokeDashoffset={c / 4}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
      />
    </svg>
  );
}

const INSIGHTS_CSS = `
  .ins-range-picker { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 8px; }
  .ins-range-btn { background: transparent; border: 0; padding: 6px 12px; font-size: 13px; color: var(--text-muted); border-radius: 6px; cursor: pointer; }
  .ins-range-btn.is-active { background: var(--primary-green); color: #fff; }
  .ins-range-btn:hover:not(.is-active) { background: var(--surface-hover); color: var(--text-primary); }

  .ins-section { background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px 22px; margin-bottom: 20px; }
  .ins-section-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; }
  .ins-section-title { font-size: 18px; font-weight: 600; margin: 0; }
  .ins-section-sub { font-size: 12px; color: var(--text-muted); }

  .ins-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .ins-kpi-grid--2 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .ins-kpi-grid--3 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }

  .ins-kpi { padding: 14px 16px; background: var(--bg-secondary, #fafafa); border-radius: 8px; border: 1px solid var(--border-color); }
  .ins-kpi-label { font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px; }
  .ins-kpi-value { font-size: 26px; font-weight: 600; line-height: 1.1; color: var(--text-primary); }
  .ins-kpi-meta { display: flex; gap: 8px; align-items: center; margin-top: 6px; min-height: 18px; }
  .ins-kpi-change { font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 999px; }
  .ins-kpi-change.is-up { background: rgba(42, 122, 58, 0.1); color: var(--primary-green); }
  .ins-kpi-change.is-down { background: rgba(176, 51, 55, 0.1); color: #b03337; }
  .ins-kpi-sub { font-size: 11px; color: var(--text-muted); }

  .ins-yoy-totals { display: flex; gap: 32px; margin-bottom: 12px; }
  .ins-yoy-num { font-size: 26px; font-weight: 600; line-height: 1.1; color: var(--text-primary); }
  .ins-yoy-num--muted { color: var(--text-muted); }
  .ins-yoy-lbl { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); margin-top: 4px; letter-spacing: 0.5px; text-transform: uppercase; }
  .ins-swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .ins-swatch--curr { background: var(--primary-green, #2a7a3a); }
  .ins-swatch--prev { background: var(--accent-soft, #d9e9dd); }
  .ins-yoy-svg { width: 100%; height: auto; max-height: 240px; }

  .ins-funnel-row { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 16px; align-items: stretch; }
  @media (max-width: 720px) { .ins-funnel-row { grid-template-columns: 1fr; } }
  .ins-funnel-card { display: flex; align-items: center; gap: 16px; padding: 18px; background: var(--bg-secondary, #fafafa); border: 1px solid var(--border-color); border-radius: 8px; flex-wrap: wrap; }
  .ins-funnel-step { flex: 1; min-width: 100px; text-align: center; }
  .ins-funnel-num { font-size: 32px; font-weight: 600; color: var(--text-primary); line-height: 1; }
  .ins-funnel-lbl { font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-muted); margin-top: 6px; }
  .ins-funnel-sub { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
  .ins-funnel-arrow { color: var(--text-muted); font-size: 20px; user-select: none; }
  .ins-conv-card { padding: 18px; background: var(--bg-secondary, #fafafa); border: 1px solid var(--border-color); border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
  .ins-conv-num { font-size: 28px; font-weight: 600; color: var(--text-primary); }
  .ins-conv-lbl { font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-muted); }
  .ins-donut { margin-top: 6px; }
`;
