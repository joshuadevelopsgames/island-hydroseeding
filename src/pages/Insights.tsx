import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useQuotes } from '@/hooks/useQuotes';
import { useInvoices } from '@/hooks/useInvoices';
import { useJobs } from '@/hooks/useJobs';
import { useRequests } from '@/hooks/useRequests';
import { useCrmAccounts } from '@/hooks/useCrm';

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
  else from.setFullYear(2000);
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
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function avgDaysBetween(starts: (string | null | undefined)[], ends: (string | null | undefined)[]): number | null {
  const pairs: number[] = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    const e = ends[i];
    if (!s || !e) continue;
    const a = new Date(s).getTime();
    const b = new Date(e).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) pairs.push((b - a) / 86400000);
  }
  return pairs.length === 0 ? null : pairs.reduce((s, n) => s + n, 0) / pairs.length;
}

export default function Insights() {
  const [range, setRange] = useState<RangeKey>('this_month');
  const { data: quotes = [] } = useQuotes();
  const { data: invoices = [] } = useInvoices();
  const { data: jobs = [] } = useJobs();
  const { data: requests = [] } = useRequests();
  const { data: accounts = [] } = useCrmAccounts();

  const { from, to } = useMemo(() => rangeBounds(range), [range]);
  const prior = useMemo(() => priorRange(range), [range]);

  const accountName = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) m.set(a.id, a.name);
    return (id: string | null) => (id ? m.get(id) ?? 'Unknown' : 'Unknown');
  }, [accounts]);

  // ─── Overview ─────────────────────────────────────────────
  const overview = useMemo(() => {
    const newQuotesCurr = quotes.filter((q) => inRange(q.created_at, from, to)).length;
    const newQuotesPrev = quotes.filter((q) => inRange(q.created_at, prior.from, prior.to)).length;

    const convertedCurr = quotes.filter((q) => q.converted_at && inRange(q.converted_at, from, to)).length;
    const convertedPrev = quotes.filter((q) => q.converted_at && inRange(q.converted_at, prior.from, prior.to)).length;

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

  // ─── Revenue YoY ──────────────────────────────────────────
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

  // ─── Cashflow ─────────────────────────────────────────────
  const cashflow = useMemo(() => {
    const unpaid = invoices.filter((i) => i.status !== 'Paid' && Number(i.balance_due) > 0);
    const outstanding = unpaid.reduce((s, i) => s + Number(i.balance_due), 0);

    const closedInRange = invoices.filter((i) => i.status === 'Paid' && inRange(i.updated_at, from, to));
    const avgDaysToPaid =
      closedInRange.length === 0
        ? null
        : closedInRange.reduce((s, i) => s + (new Date(i.updated_at).getTime() - new Date(i.issue_date).getTime()) / 86400000, 0) / closedInRange.length;

    const invoicedQuoteIds = new Set(invoices.map((i) => i.quote_id).filter(Boolean));
    const projected = quotes
      .filter((q) => (q.status === 'Approved' || q.status === 'Converted') && !invoicedQuoteIds.has(q.id))
      .reduce((s, q) => s + Number(q.total ?? 0), 0);

    // Top debtors — group unpaid balance by account
    const byAccount = new Map<string, number>();
    for (const inv of unpaid) {
      if (!inv.account_id) continue;
      byAccount.set(inv.account_id, (byAccount.get(inv.account_id) ?? 0) + Number(inv.balance_due));
    }
    const topDebtors = [...byAccount.entries()]
      .map(([id, balance]) => ({ id, name: accountName(id), balance }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);

    return { outstanding, avgDaysToPaid, projected, topDebtors, unpaidCount: unpaid.length };
  }, [invoices, quotes, from, to, accountName]);

  // ─── Lead conversion ──────────────────────────────────────
  const leadConv = useMemo(() => {
    // Quotes whose origin request can be matched via converted_quote_id
    const quoteIdToCreated = new Map<string, string>();
    for (const q of quotes) quoteIdToCreated.set(q.id, q.created_at);

    const requestStarts: string[] = [];
    const requestToQuote: string[] = [];
    for (const r of requests) {
      if (!r.converted_quote_id) continue;
      const qCreated = quoteIdToCreated.get(r.converted_quote_id);
      if (!qCreated) continue;
      requestStarts.push(r.requested_at ?? r.created_at);
      requestToQuote.push(qCreated);
    }
    const reqToQuoteDays = avgDaysBetween(requestStarts, requestToQuote);

    // Quote sent → approved
    const sent: string[] = [];
    const approved: string[] = [];
    for (const q of quotes) {
      if (q.sent_at && q.approved_at) {
        sent.push(q.sent_at);
        approved.push(q.approved_at);
      }
    }
    const quoteToApprovedDays = avgDaysBetween(sent, approved);

    // Funnel counts in range
    const reqIn = requests.filter((r) => inRange(r.created_at, from, to)).length;
    const sentIn = quotes.filter((q) => q.sent_at && inRange(q.sent_at, from, to)).length;
    type J = { created_at?: string };
    const jobsIn = (jobs as J[]).filter((j) => inRange(j.created_at, from, to)).length;

    return { reqToQuoteDays, quoteToApprovedDays, funnel: { requests: reqIn, quotes: sentIn, jobs: jobsIn } };
  }, [requests, quotes, jobs, from, to]);

  // ─── Quotes funnel + value-over-time ──────────────────────
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

    // Bucket by week for the value-over-time chart
    const weeks: { label: string; sent: number; approved: number }[] = [];
    const span = to.getTime() - from.getTime();
    const weekMs = 7 * 86400000;
    const weekCount = Math.max(1, Math.min(12, Math.ceil(span / weekMs)));
    for (let i = 0; i < weekCount; i++) {
      const wFrom = new Date(from.getTime() + (i * span) / weekCount);
      const wTo = new Date(from.getTime() + ((i + 1) * span) / weekCount);
      let s = 0;
      let a = 0;
      for (const q of sentInRange) {
        if (!inRange(q.created_at, wFrom, wTo)) continue;
        s += Number(q.total ?? 0);
        if (q.status === 'Approved' || q.status === 'Converted') a += Number(q.total ?? 0);
      }
      weeks.push({ label: wFrom.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }), sent: s, approved: a });
    }

    return { sent: sentInRange.length, approved, converted, sentValue, approvedValue, conversionRate, weeks };
  }, [quotes, from, to]);

  // ─── Jobs ─────────────────────────────────────────────────
  const jobsSummary = useMemo(() => {
    type J = { id?: string; status?: string; created_at?: string; is_recurring?: boolean; job_type?: string; quote_id?: string | null };
    const list = jobs as J[];
    const inRangeJobs = list.filter((j) => inRange(j.created_at, from, to));
    const total = inRangeJobs.length;
    const active = list.filter((j) => j.status && j.status !== 'Completed' && j.status !== 'Archived').length;

    const recurring = list.filter((j) => j.is_recurring === true).length;
    const oneOff = list.filter((j) => j.is_recurring !== true).length;

    // Average job value: average of (linked quote's total) for jobs created in range
    const quoteTotalById = new Map<string, number>();
    for (const q of quotes) quoteTotalById.set(q.id, Number(q.total ?? 0));
    const valuedJobs = inRangeJobs
      .map((j) => (j.quote_id ? quoteTotalById.get(j.quote_id) : undefined))
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const avgValue = valuedJobs.length === 0 ? null : valuedJobs.reduce((s, n) => s + n, 0) / valuedJobs.length;

    return { total, active, recurring, oneOff, avgValue };
  }, [jobs, quotes, from, to]);

  return (
    <div className="page">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="flex items-center gap-3 mb-2">
            <BarChart3 size={28} style={{ color: 'var(--primary-green)' }} />
            Insights
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            How the business is moving. Numbers update from your requests, quotes, jobs, invoices, and payments.
          </p>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <Section title="Overview" subtitle={rangeLabel(range)}>
        <div className="ins-kpi-grid">
          <KpiTile label="New quotes" value={String(overview.newQuotes.curr)} change={overview.newQuotes.change} />
          <KpiTile label="Converted" value={String(overview.converted.curr)} change={overview.converted.change} />
          <KpiTile label="New invoices" value={String(overview.newInvoices.curr)} change={overview.newInvoices.change} />
          <KpiTile label="Invoiced" value={CAD.format(overview.invoiced.curr)} change={overview.invoiced.change} />
          <KpiTile label="Collected" value={CAD.format(overview.collected.curr)} change={overview.collected.change} />
        </div>
      </Section>

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

      <Section title="Lead conversion" subtitle="From request to job">
        <div className="ins-lead-grid">
          <div className="ins-lead-times">
            <KpiTile
              label="Request → quote"
              value={leadConv.reqToQuoteDays == null ? '—' : `${leadConv.reqToQuoteDays.toFixed(1)} days`}
              sub="Average for converted requests"
            />
            <KpiTile
              label="Quote → accepted"
              value={leadConv.quoteToApprovedDays == null ? '—' : `${leadConv.quoteToApprovedDays.toFixed(1)} days`}
              sub="Sent to approved"
            />
          </div>
          <div className="ins-funnel-card">
            <div className="ins-funnel-step">
              <div className="ins-funnel-num">{leadConv.funnel.requests}</div>
              <div className="ins-funnel-lbl">Requests</div>
            </div>
            <div className="ins-funnel-arrow">→</div>
            <div className="ins-funnel-step">
              <div className="ins-funnel-num">{leadConv.funnel.quotes}</div>
              <div className="ins-funnel-lbl">Quotes sent</div>
            </div>
            <div className="ins-funnel-arrow">→</div>
            <div className="ins-funnel-step">
              <div className="ins-funnel-num">{leadConv.funnel.jobs}</div>
              <div className="ins-funnel-lbl">Jobs created</div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Cashflow" subtitle="Outstanding, projected, and how fast you're paid">
        <div className="ins-kpi-grid ins-kpi-grid--3">
          <KpiTile
            label="Outstanding"
            value={CAD.format(cashflow.outstanding)}
            sub={cashflow.unpaidCount === 1 ? '1 unpaid invoice' : `${cashflow.unpaidCount} unpaid invoices`}
          />
          <KpiTile
            label="Avg time to paid"
            value={cashflow.avgDaysToPaid == null ? '—' : `${cashflow.avgDaysToPaid.toFixed(1)} days`}
            sub="Issued → cleared"
          />
          <KpiTile label="Projected income" value={CAD.format(cashflow.projected)} sub="Accepted quotes not yet invoiced" />
        </div>

        {cashflow.topDebtors.length > 0 && (
          <div className="ins-debtors">
            <div className="ins-debtors-head">
              <span>Top open balances</span>
              <span>Balance</span>
            </div>
            {cashflow.topDebtors.map((d) => (
              <div key={d.id} className="ins-debtor-row">
                <span className="ins-debtor-name">{d.name}</span>
                <span className="ins-debtor-bal">{CAD.format(d.balance)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

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

        <div className="ins-section-sub-head">
          Quote value over time<span className="ins-section-sub">Sent vs accepted, by week</span>
        </div>
        <SentVsApprovedBars weeks={funnel.weeks} />
      </Section>

      <Section title="Jobs" subtitle="Work in progress">
        <div className="ins-jobs-row">
          <div className="ins-kpi-grid ins-kpi-grid--2 ins-jobs-tiles">
            <KpiTile label="New jobs" value={String(jobsSummary.total)} sub={rangeLabel(range)} />
            <KpiTile label="Active jobs" value={String(jobsSummary.active)} sub="Open right now" />
            <KpiTile
              label="Average job value"
              value={jobsSummary.avgValue == null ? '—' : CAD.format(jobsSummary.avgValue)}
              sub="From linked quote totals"
            />
          </div>
          <div className="ins-conv-card">
            <div className="ins-conv-lbl">Recurring vs one-off</div>
            <RecurringDonut recurring={jobsSummary.recurring} oneOff={jobsSummary.oneOff} />
            <div className="ins-legend">
              <div><span className="ins-swatch ins-swatch--curr" /> Recurring · {jobsSummary.recurring}</div>
              <div><span className="ins-swatch ins-swatch--prev" /> One-off · {jobsSummary.oneOff}</div>
            </div>
          </div>
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

function KpiTile({ label, value, change, sub }: { label: string; value: string; change?: number | null; sub?: string }) {
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
            <text x={x + barW + 1} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{months[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function SentVsApprovedBars({ weeks }: { weeks: { label: string; sent: number; approved: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.sent, w.approved)));
  const W = 720;
  const H = 160;
  const padX = 28;
  const padY = 24;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const groupW = innerW / weeks.length;
  const barW = Math.max(4, (groupW - 6) / 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ins-yoy-svg" role="img" aria-label="Quote value sent vs accepted, by week">
      <line x1={padX} y1={padY + innerH} x2={W - padX} y2={padY + innerH} stroke="var(--border-color)" />
      {weeks.map((w, i) => {
        const x = padX + i * groupW + 3;
        const sH = (w.sent / max) * innerH;
        const aH = (w.approved / max) * innerH;
        return (
          <g key={i}>
            <rect x={x} y={padY + innerH - sH} width={barW} height={sH} fill="var(--accent-soft, #d9e9dd)" rx="2" />
            <rect x={x + barW + 2} y={padY + innerH - aH} width={barW} height={aH} fill="var(--primary-green, #2a7a3a)" rx="2" />
            <text x={x + barW + 1} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{w.label}</text>
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

function RecurringDonut({ recurring, oneOff }: { recurring: number; oneOff: number }) {
  const total = recurring + oneOff;
  const recPct = total === 0 ? 0 : (recurring / total) * 100;
  const r = 36;
  const c = 2 * Math.PI * r;
  const recDash = (recPct / 100) * c;
  return (
    <svg viewBox="0 0 100 100" width="92" height="92" className="ins-donut">
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--accent-soft, #d9e9dd)" strokeWidth="10" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="var(--primary-green, #2a7a3a)"
        strokeWidth="10"
        strokeDasharray={`${recDash} ${c - recDash}`}
        strokeDashoffset={c / 4}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="54" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text-primary)">
        {total}
      </text>
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
  .ins-section-sub-head { display: flex; align-items: baseline; gap: 12px; margin: 20px 0 8px; font-size: 14px; font-weight: 600; }

  .ins-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .ins-kpi-grid--2 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .ins-kpi-grid--3 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }

  .ins-kpi { padding: 14px 16px; background: var(--bg-secondary, #fafafa); border-radius: 8px; border: 1px solid var(--border-color); }
  .ins-kpi-label { font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px; }
  .ins-kpi-value { font-size: 26px; font-weight: 600; line-height: 1.1; color: var(--text-primary); }
  .ins-kpi-meta { display: flex; gap: 8px; align-items: center; margin-top: 6px; min-height: 18px; flex-wrap: wrap; }
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

  .ins-lead-grid { display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 1fr); gap: 16px; align-items: stretch; }
  @media (max-width: 720px) { .ins-lead-grid { grid-template-columns: 1fr; } }
  .ins-lead-times { display: grid; gap: 12px; align-content: start; }

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
  .ins-legend { font-size: 11px; color: var(--text-muted); margin-top: 8px; display: grid; gap: 4px; }
  .ins-legend > div { display: flex; align-items: center; gap: 6px; }

  .ins-debtors { margin-top: 16px; padding: 12px 14px; background: var(--bg-secondary, #fafafa); border: 1px solid var(--border-color); border-radius: 8px; }
  .ins-debtors-head { display: flex; justify-content: space-between; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-muted); padding-bottom: 8px; border-bottom: 1px solid var(--border-color); }
  .ins-debtor-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px dashed var(--border-color); }
  .ins-debtor-row:last-child { border-bottom: 0; }
  .ins-debtor-name { color: var(--text-primary); }
  .ins-debtor-bal { font-family: 'JetBrains Mono', ui-monospace, monospace; color: #b03337; font-weight: 600; }

  .ins-jobs-row { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 16px; align-items: stretch; }
  @media (max-width: 720px) { .ins-jobs-row { grid-template-columns: 1fr; } }
  .ins-jobs-tiles { align-content: start; }
`;
