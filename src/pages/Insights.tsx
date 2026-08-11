import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadXlsxWorkbook, type SheetSpec } from '@/lib/xlsxExport';
import { apiFetch } from '@/lib/apiClient';
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

/**
 * Percent change from prior period to current. Returns null when the prior
 * base is too small to draw a meaningful conclusion (avoids the misleading
 * "↑ 100%" KPIs that pop up on a base of 1).
 */
function pct(curr: number, prev: number, opts: { minBase?: number } = {}): number | null {
  const minBase = opts.minBase ?? 0;
  if (prev === 0 && curr === 0) return 0;
  if (prev === 0) return null;
  if (Math.abs(prev) < minBase) return null;
  return ((curr - prev) / prev) * 100;
}

function fmtChange(c: number | null | undefined): string {
  if (c == null) return '—';
  const sign = c >= 0 ? '+' : '−';
  return `${sign}${Math.abs(c).toFixed(0)}%`;
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

  // Server-aggregated payment-method breakdown (uses range params).
  const { data: paymentMethods } = useQuery({
    queryKey: ['insights-payment-methods', from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)],
    queryFn: async (): Promise<{ rows: { method: string; count: number; total: number }[] }> => {
      const r = await apiFetch(
        `/api/invoices?action=payment_method_summary&from=${encodeURIComponent(from.toISOString().slice(0, 10))}&to=${encodeURIComponent(to.toISOString().slice(0, 10))}`,
      );
      if (!r.ok) return { rows: [] };
      return r.json();
    },
  });
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

    // For count metrics, require ≥3 in the prior period before showing a %
    // change. For dollar metrics, require ≥$100 prior. Below those thresholds
    // the percent change is too noisy to be useful.
    const COUNT_MIN = 3;
    const MONEY_MIN = 100;
    return {
      newQuotes: { curr: newQuotesCurr, change: pct(newQuotesCurr, newQuotesPrev, { minBase: COUNT_MIN }) },
      converted: { curr: convertedCurr, change: pct(convertedCurr, convertedPrev, { minBase: COUNT_MIN }) },
      newInvoices: {
        curr: newInvoicesCurr.length,
        change: pct(newInvoicesCurr.length, newInvoicesPrev.length, { minBase: COUNT_MIN }),
      },
      invoiced: { curr: invoicedCurr, change: pct(invoicedCurr, invoicedPrev, { minBase: MONEY_MIN }) },
      collected: { curr: paidCurr, change: pct(paidCurr, paidPrev, { minBase: MONEY_MIN }) },
    };
  }, [quotes, invoices, from, to, prior.from, prior.to]);

  // ─── Revenue: selected range vs same range one year ago ──
  const revenueYoY = useMemo(() => {
    // Bucket size follows the range length. Always bucketing by month turned
    // short ranges ("This month" = 11 days) into a single bucket, which drew
    // one enormous bar instead of a chart.
    const DAY_MS = 86400000;
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1);
    // Thresholds are loose so each preset lands where you'd expect: this month
    // and last 30 days → daily, last 90 → weekly, YTD / 12 months → monthly,
    // all time (starts in 2000) → yearly.
    const gran: 'day' | 'week' | 'month' | 'year' =
      spanDays <= 45 ? 'day' : spanDays <= 120 ? 'week' : spanDays <= 1100 ? 'month' : 'year';
    const stepDays = gran === 'day' ? 1 : 7;
    // "All time" starts in 2000 — bucket those by year so the chart isn't
    // hundreds of overlapping bars.
    const stepMonths = gran === 'year' ? 12 : 1;
    const byMonth = gran === 'month' || gran === 'year';

    // The prior-year window is the same window shifted back a year, so both
    // series get the same bucket size and line up index-for-index.
    const buildBuckets = (rFrom: Date, rTo: Date) => {
      const out: { label: string; value: number; key: string }[] = [];
      if (byMonth) {
        const cursor = new Date(rFrom.getFullYear(), rFrom.getMonth(), 1);
        while (cursor <= rTo) {
          out.push({
            key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
            label:
              gran === 'year'
                ? String(cursor.getFullYear())
                : cursor.toLocaleDateString('en-CA', { month: 'short', year: '2-digit' }),
            value: 0,
          });
          cursor.setMonth(cursor.getMonth() + stepMonths);
        }
        return out;
      }
      const cursor = startOfDay(rFrom);
      while (cursor <= rTo) {
        out.push({
          key: cursor.toISOString().slice(0, 10),
          label: cursor.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
          value: 0,
        });
        cursor.setDate(cursor.getDate() + stepDays);
      }
      return out;
    };
    const fillBuckets = (rFrom: Date, rTo: Date) => {
      const buckets = buildBuckets(rFrom, rTo);
      const base = startOfDay(rFrom).getTime();
      for (const inv of invoices) {
        const d = new Date(inv.issue_date || inv.created_at);
        if (d < rFrom || d > rTo) continue;
        const i = byMonth
          ? Math.floor(
              ((d.getFullYear() - rFrom.getFullYear()) * 12 + (d.getMonth() - rFrom.getMonth())) / stepMonths,
            )
          : Math.floor(Math.round((startOfDay(d).getTime() - base) / DAY_MS) / stepDays);
        if (i >= 0 && i < buckets.length) buckets[i].value += Number(inv.total ?? 0);
      }
      return buckets;
    };

    const priorFrom = new Date(from);
    priorFrom.setFullYear(priorFrom.getFullYear() - 1);
    const priorTo = new Date(to);
    priorTo.setFullYear(priorTo.getFullYear() - 1);

    const current = fillBuckets(from, to);
    const prev = fillBuckets(priorFrom, priorTo);

    // Pad whichever is shorter with zeros so the chart aligns side-by-side.
    const len = Math.max(current.length, prev.length);
    while (current.length < len) current.push({ key: `_${current.length}`, label: '', value: 0 });
    while (prev.length < len) prev.push({ key: `_${prev.length}`, label: '', value: 0 });

    const periodLabel = `${from.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – ${to.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const priorLabel = `${priorFrom.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – ${priorTo.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    return {
      current,
      prev,
      periodLabel,
      priorLabel,
      thisTotal: current.reduce((s, b) => s + b.value, 0),
      priorTotal: prev.reduce((s, b) => s + b.value, 0),
    };
  }, [invoices, from, to]);

  // ─── Cashflow ─────────────────────────────────────────────
  const cashflow = useMemo(() => {
    const unpaid = invoices.filter((i) => i.status !== 'Paid' && Number(i.balance_due) > 0);
    const outstanding = unpaid.reduce((s, i) => s + Number(i.balance_due), 0);

    // Use paid_at when present (precise — set by syncInvoiceFinancials on the
    // Paid transition). Fall back to updated_at for invoices created before
    // migration 023 was backfilled.
    const closedInRange = invoices.filter(
      (i) => i.status === 'Paid' && inRange(i.paid_at ?? i.updated_at, from, to)
    );
    const avgDaysToPaid =
      closedInRange.length === 0
        ? null
        : closedInRange.reduce((s, i) => {
            const cleared = new Date(i.paid_at ?? i.updated_at).getTime();
            const issued = new Date(i.issue_date).getTime();
            return s + (cleared - issued) / 86400000;
          }, 0) / closedInRange.length;

    const invoicedQuoteIds = new Set(invoices.map((i) => i.quote_id).filter(Boolean));
    const projected = quotes
      .filter((q) => (q.status === 'Approved' || q.status === 'Converted') && !invoicedQuoteIds.has(q.id))
      .reduce((s, q) => s + Number(q.total ?? 0), 0);

    // Top debtors — group unpaid balance by account. Drop rows whose account
    // can't be resolved (deleted account or missing link) and surface them
    // separately so the user can audit instead of seeing "Unknown owes $X".
    const byAccount = new Map<string, number>();
    let unattachedBalance = 0;
    let unattachedCount = 0;
    for (const inv of unpaid) {
      if (!inv.account_id) {
        unattachedBalance += Number(inv.balance_due);
        unattachedCount += 1;
        continue;
      }
      byAccount.set(inv.account_id, (byAccount.get(inv.account_id) ?? 0) + Number(inv.balance_due));
    }
    const allRows = [...byAccount.entries()].map(([id, balance]) => ({ id, name: accountName(id), balance }));
    const resolved = allRows.filter((r) => r.name !== 'Unknown');
    const orphaned = allRows.filter((r) => r.name === 'Unknown');
    for (const o of orphaned) {
      unattachedBalance += o.balance;
      unattachedCount += 1;
    }
    const topDebtors = resolved.sort((a, b) => b.balance - a.balance).slice(0, 5);

    // Projected income split using the linked job's start_date when available.
    const invoicedQuoteIds2 = invoicedQuoteIds; // alias for readability below
    const acceptedNotInvoiced = quotes.filter(
      (q) => (q.status === 'Approved' || q.status === 'Converted') && !invoicedQuoteIds2.has(q.id)
    );
    const jobStartByQuote = new Map<string, string>();
    type J = { quote_id?: string | null; start_date?: string | null };
    for (const j of jobs as J[]) {
      if (j.quote_id && j.start_date) jobStartByQuote.set(j.quote_id, j.start_date);
    }
    const now = Date.now();
    const day = 86400000;
    const horizons = { today: 0, in7: 0, in30: 0, later: 0, unscheduled: 0 };
    for (const q of acceptedNotInvoiced) {
      const start = jobStartByQuote.get(q.id);
      const total = Number(q.total ?? 0);
      if (!start) {
        horizons.unscheduled += total;
        continue;
      }
      const diffDays = (new Date(start).getTime() - now) / day;
      if (diffDays <= 1) horizons.today += total;
      else if (diffDays <= 7) horizons.in7 += total;
      else if (diffDays <= 30) horizons.in30 += total;
      else horizons.later += total;
    }

    return {
      outstanding,
      avgDaysToPaid,
      projected,
      topDebtors,
      unpaidCount: unpaid.length,
      unattachedBalance,
      unattachedCount,
      horizons,
    };
  }, [invoices, quotes, jobs, from, to, accountName]);

  // ─── Lead conversion (with stacked-by-source breakdown) ──
  const leadConv = useMemo(() => {
    const quoteIdToCreated = new Map<string, string>();
    for (const q of quotes) quoteIdToCreated.set(q.id, q.created_at);
    const quoteIdToAccount = new Map<string, string | null>();
    for (const q of quotes) quoteIdToAccount.set(q.id, q.account_id ?? null);

    // Avg-days metrics
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

    const sent: string[] = [];
    const approved: string[] = [];
    for (const q of quotes) {
      if (q.sent_at && q.approved_at) {
        sent.push(q.sent_at);
        approved.push(q.approved_at);
      }
    }
    const quoteToApprovedDays = avgDaysBetween(sent, approved);

    // Per-source funnel counts. Source is taken from the request; for a quote
    // or job created without an originating request, we bucket as 'direct'.
    const SOURCES = ['website', 'phone', 'email', 'referral', 'other', 'direct'] as const;
    type SourceKey = (typeof SOURCES)[number];
    const norm = (s: string | null | undefined): SourceKey => {
      const v = String(s ?? '').toLowerCase().trim();
      if (v === 'website' || v === 'phone' || v === 'email' || v === 'referral') return v;
      if (v === '' || v === 'direct') return 'direct';
      return 'other';
    };

    const requestSourceById = new Map<string, SourceKey>();
    const requestQuoteIds = new Set<string>();
    let requestsInRange = 0;
    const reqBySrc: Record<SourceKey, number> = { website: 0, phone: 0, email: 0, referral: 0, other: 0, direct: 0 };
    for (const r of requests) {
      requestSourceById.set(r.id, norm(r.source));
      if (r.converted_quote_id) requestQuoteIds.add(r.converted_quote_id);
      if (inRange(r.created_at, from, to)) {
        requestsInRange += 1;
        reqBySrc[norm(r.source)] += 1;
      }
    }

    // Map quote → source via the request that produced it (when there is one)
    const quoteSrcById = new Map<string, SourceKey>();
    for (const r of requests) {
      if (r.converted_quote_id) quoteSrcById.set(r.converted_quote_id, norm(r.source));
    }
    let quotesSentInRange = 0;
    const quoteBySrc: Record<SourceKey, number> = { website: 0, phone: 0, email: 0, referral: 0, other: 0, direct: 0 };
    for (const q of quotes) {
      if (!q.sent_at || !inRange(q.sent_at, from, to)) continue;
      quotesSentInRange += 1;
      const src = quoteSrcById.get(q.id) ?? 'direct';
      quoteBySrc[src] += 1;
    }

    type J = { id?: string; created_at?: string; quote_id?: string | null };
    let jobsInRange = 0;
    const jobBySrc: Record<SourceKey, number> = { website: 0, phone: 0, email: 0, referral: 0, other: 0, direct: 0 };
    for (const j of jobs as J[]) {
      if (!inRange(j.created_at, from, to)) continue;
      jobsInRange += 1;
      const src = j.quote_id ? quoteSrcById.get(j.quote_id) ?? 'direct' : 'direct';
      jobBySrc[src] += 1;
    }

    // Per-source conversion rate: jobs / requests in range. When request count
    // is too small to be meaningful (< 3) we suppress the rate.
    const conversionBySrc: { source: SourceKey; requests: number; jobs: number; rate: number | null }[] = SOURCES.map((s) => ({
      source: s,
      requests: reqBySrc[s],
      jobs: jobBySrc[s],
      rate: reqBySrc[s] >= 3 ? (jobBySrc[s] / reqBySrc[s]) * 100 : null,
    }));

    return {
      reqToQuoteDays,
      quoteToApprovedDays,
      funnel: { requests: requestsInRange, quotes: quotesSentInRange, jobs: jobsInRange },
      bySource: { requests: reqBySrc, quotes: quoteBySrc, jobs: jobBySrc, conversion: conversionBySrc, sources: SOURCES, requestSourceById },
    };
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

    // Treat null/undefined is_recurring as Unknown so jobs created before
    // migration 020 don't silently inflate the One-off bucket.
    const recurring = list.filter((j) => j.is_recurring === true).length;
    const oneOff = list.filter((j) => j.is_recurring === false).length;
    const unknownRecurrence = list.filter((j) => j.is_recurring == null).length;

    // Average job value: average of (linked quote's total) for jobs created in range
    const quoteTotalById = new Map<string, number>();
    for (const q of quotes) quoteTotalById.set(q.id, Number(q.total ?? 0));
    const valuedJobs = inRangeJobs
      .map((j) => (j.quote_id ? quoteTotalById.get(j.quote_id) : undefined))
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const avgValue = valuedJobs.length === 0 ? null : valuedJobs.reduce((s, n) => s + n, 0) / valuedJobs.length;

    return { total, active, recurring, oneOff, unknownRecurrence, avgValue };
  }, [jobs, quotes, from, to]);

  // ─── XLSX export — one sheet per dashboard section ──────────
  const handleExport = () => {
    const periodLabel = rangeLabel(range);
    const sheets: SheetSpec[] = [
      {
        name: 'Overview',
        headers: ['Metric', 'Value', 'Change vs prior'],
        rows: [
          ['Period', periodLabel, ''],
          ['New quotes', overview.newQuotes.curr, fmtChange(overview.newQuotes.change)],
          ['Converted quotes', overview.converted.curr, fmtChange(overview.converted.change)],
          ['New invoices', overview.newInvoices.curr, fmtChange(overview.newInvoices.change)],
          ['Invoiced ($)', overview.invoiced.curr, fmtChange(overview.invoiced.change)],
          ['Collected ($)', overview.collected.curr, fmtChange(overview.collected.change)],
        ],
      },
      {
        name: 'Revenue',
        headers: ['Month', `Current (${revenueYoY.periodLabel})`, `Prior (${revenueYoY.priorLabel})`],
        rows: revenueYoY.current.map((c, i) => [c.label, c.value, revenueYoY.prev[i]?.value ?? 0]),
      },
      {
        name: 'Lead conversion',
        headers: ['Metric', 'Value'],
        rows: [
          ['Avg days request → quote', leadConv.reqToQuoteDays == null ? '—' : Number(leadConv.reqToQuoteDays.toFixed(2))],
          ['Avg days quote → accepted', leadConv.quoteToApprovedDays == null ? '—' : Number(leadConv.quoteToApprovedDays.toFixed(2))],
          ['Requests in period', leadConv.funnel.requests],
          ['Quotes sent in period', leadConv.funnel.quotes],
          ['Jobs created in period', leadConv.funnel.jobs],
        ],
      },
      {
        name: 'Lead conversion by source',
        headers: ['Source', 'Requests', 'Quotes sent', 'Jobs created', 'Conversion %'],
        rows: leadConv.bySource.conversion.map((row) => [
          row.source,
          row.requests,
          leadConv.bySource.quotes[row.source] ?? 0,
          row.jobs,
          row.rate == null ? 'n<3' : Number(row.rate.toFixed(2)),
        ]),
      },
      {
        name: 'Cashflow',
        headers: ['Metric', 'Value'],
        rows: [
          ['Outstanding ($)', cashflow.outstanding],
          ['Unpaid invoice count', cashflow.unpaidCount],
          ['Avg time to paid (days)', cashflow.avgDaysToPaid == null ? '—' : Number(cashflow.avgDaysToPaid.toFixed(2))],
          ['Projected income ($)', cashflow.projected],
        ],
      },
      {
        name: 'Top open balances',
        headers: ['Account', 'Balance ($)'],
        rows: cashflow.topDebtors.map((d) => [d.name, d.balance]),
      },
      {
        name: 'Payment methods',
        headers: ['Method', 'Count', 'Total ($)'],
        rows: (paymentMethods?.rows ?? []).map((p) => [p.method, p.count, p.total]),
      },
      {
        name: 'Quotes',
        headers: ['Metric', 'Value'],
        rows: [
          ['Sent (count)', funnel.sent],
          ['Sent ($)', funnel.sentValue],
          ['Accepted (count)', funnel.approved],
          ['Accepted ($)', funnel.approvedValue],
          ['Invoiced (count)', funnel.converted],
          ['Conversion rate (%)', Number(funnel.conversionRate.toFixed(2))],
        ],
      },
      {
        name: 'Quote value by week',
        headers: ['Week starting', 'Sent ($)', 'Accepted ($)'],
        rows: funnel.weeks.map((w) => [w.label, w.sent, w.approved]),
      },
      {
        name: 'Jobs',
        headers: ['Metric', 'Value'],
        rows: [
          ['New jobs in period', jobsSummary.total],
          ['Active jobs (now)', jobsSummary.active],
          ['Recurring (count)', jobsSummary.recurring],
          ['One-off (count)', jobsSummary.oneOff],
          ['Average job value ($)', jobsSummary.avgValue == null ? '—' : Number(jobsSummary.avgValue.toFixed(2))],
        ],
      },
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    downloadXlsxWorkbook(`insights-${periodLabel.toLowerCase().replace(/\s+/g, '-')}-${stamp}`, sheets);
  };

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
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <RangePicker value={range} onChange={setRange} />
          <Button type="button" variant="secondary" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
        </div>
      </div>

      <SectionNav
        sections={[
          { id: 'overview', label: 'Overview' },
          { id: 'revenue', label: 'Revenue' },
          { id: 'leads', label: 'Leads' },
          { id: 'cashflow', label: 'Cashflow' },
          { id: 'quotes', label: 'Quotes' },
          { id: 'jobs', label: 'Jobs' },
        ]}
      />

      {/* Sticky hero strip — three numbers the user looks at most. */}
      <div className="ins-hero">
        <HeroTile label="Outstanding A/R" value={CAD.format(cashflow.outstanding)} tone="warn" />
        <HeroTile label="Conversion rate" value={`${funnel.conversionRate.toFixed(0)}%`} tone="ok" />
        <HeroTile label={`Collected · ${rangeLabel(range)}`} value={CAD.format(overview.collected.curr)} tone="ok" />
      </div>

      <Section id="overview" title="Overview" subtitle={rangeLabel(range)}>
        <div className="ins-kpi-grid">
          <KpiTile label="New quotes" value={String(overview.newQuotes.curr)} change={overview.newQuotes.change} />
          <KpiTile label="Converted" value={String(overview.converted.curr)} change={overview.converted.change} />
          <KpiTile label="New invoices" value={String(overview.newInvoices.curr)} change={overview.newInvoices.change} />
          <KpiTile label="Invoiced" value={CAD.format(overview.invoiced.curr)} change={overview.invoiced.change} />
          <KpiTile label="Collected" value={CAD.format(overview.collected.curr)} change={overview.collected.change} />
        </div>
      </Section>

      <Section
        id="revenue"
        title="Revenue"
        subtitle={`${revenueYoY.periodLabel} vs ${revenueYoY.priorLabel}`}
        drillTo={`/reports?report=revenue_by_service&range=${range}`}
        drillLabel="Open revenue by service"
      >
        <div className="ins-yoy-totals">
          <div>
            <div className="ins-yoy-num">{CAD.format(revenueYoY.thisTotal)}</div>
            <div className="ins-yoy-lbl"><span className="ins-swatch ins-swatch--curr" /> {revenueYoY.periodLabel}</div>
          </div>
          <div>
            <div className="ins-yoy-num ins-yoy-num--muted">{CAD.format(revenueYoY.priorTotal)}</div>
            <div className="ins-yoy-lbl"><span className="ins-swatch ins-swatch--amber" /> {revenueYoY.priorLabel}</div>
          </div>
        </div>
        <YoYBars current={revenueYoY.current} prev={revenueYoY.prev} />
      </Section>

      <Section
        id="leads"
        title="Lead conversion"
        subtitle="From request to job — stacked by source"
        drillTo={`/reports?report=lead_source_revenue&range=${range}`}
        drillLabel="Open lead-source revenue"
      >
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
          <div className="ins-source-funnel">
            <SourceFunnelStage
              label="Requests"
              total={leadConv.funnel.requests}
              counts={leadConv.bySource.requests}
              sources={leadConv.bySource.sources as readonly string[]}
            />
            <SourceFunnelStage
              label="Quotes sent"
              total={leadConv.funnel.quotes}
              counts={leadConv.bySource.quotes}
              sources={leadConv.bySource.sources as readonly string[]}
            />
            <SourceFunnelStage
              label="Jobs created"
              total={leadConv.funnel.jobs}
              counts={leadConv.bySource.jobs}
              sources={leadConv.bySource.sources as readonly string[]}
              showLegend
            />
          </div>
        </div>

        {/* Per-source conversion: jobs / requests for each source. Suppressed
            for sources with too few requests to be meaningful. */}
        <div className="ins-source-conv">
          <div className="ins-source-conv-head">
            <span>Source</span>
            <span>Requests</span>
            <span>Jobs</span>
            <span>Conversion</span>
          </div>
          {leadConv.bySource.conversion
            .filter((row) => row.requests > 0 || row.jobs > 0)
            .map((row) => (
              <div key={row.source} className="ins-source-conv-row">
                <span>
                  <span className={`ins-source-dot ins-source-dot--${row.source}`} />{' '}
                  {row.source.charAt(0).toUpperCase() + row.source.slice(1)}
                </span>
                <span>{row.requests}</span>
                <span>{row.jobs}</span>
                <span className="ins-source-conv-rate">
                  {row.rate == null ? <em style={{ color: 'var(--text-muted)' }}>n&lt;3</em> : `${row.rate.toFixed(0)}%`}
                </span>
              </div>
            ))}
        </div>
      </Section>

      <Section
        id="cashflow"
        title="Cashflow"
        subtitle="Outstanding, projected, and how fast you're paid"
        drillTo={`/reports?report=aged_receivables&range=${range}`}
        drillLabel="Open aged receivables"
      >
        <div className="ins-cashflow-grid">
          <div className="ins-kpi-grid ins-kpi-grid--3 ins-cashflow-tiles">
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
          <PaymentMethodsDonut rows={paymentMethods?.rows ?? []} />
        </div>

        {/* Projected income split by horizon (uses linked job's start_date) */}
        {(cashflow.horizons.today + cashflow.horizons.in7 + cashflow.horizons.in30 + cashflow.horizons.later + cashflow.horizons.unscheduled) > 0 && (
          <div className="ins-horizons">
            <span className="ins-horizons-label">Projected timing</span>
            <span className="ins-horizon"><b>{CAD.format(cashflow.horizons.today)}</b> due today</span>
            <span className="ins-horizon"><b>{CAD.format(cashflow.horizons.in7)}</b> within 7 days</span>
            <span className="ins-horizon"><b>{CAD.format(cashflow.horizons.in30)}</b> within 30 days</span>
            <span className="ins-horizon"><b>{CAD.format(cashflow.horizons.later)}</b> later</span>
            {cashflow.horizons.unscheduled > 0 && (
              <span className="ins-horizon ins-horizon--muted">
                <b>{CAD.format(cashflow.horizons.unscheduled)}</b> unscheduled
              </span>
            )}
          </div>
        )}

        {cashflow.topDebtors.length > 0 && (
          <div className="ins-debtors">
            <div className="ins-debtors-head">
              <span>Top open balances</span>
              <span>Balance</span>
            </div>
            {cashflow.topDebtors.map((d) => (
              <Link key={d.id} to={`/crm/${d.id}`} className="ins-debtor-row ins-debtor-row--link">
                <span className="ins-debtor-name">{d.name}</span>
                <span className="ins-debtor-bal">{CAD.format(d.balance)}</span>
              </Link>
            ))}
            {cashflow.unattachedCount > 0 && (
              <div className="ins-debtor-footnote">
                {cashflow.unattachedCount === 1 ? '1 invoice' : `${cashflow.unattachedCount} invoices`}
                {' '}
                ({CAD.format(cashflow.unattachedBalance)}) hidden — fix the account link to include them.
              </div>
            )}
          </div>
        )}
      </Section>

      <Section id="quotes" title="Quotes" subtitle="Sent, accepted, converted to invoice">
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

      <Section
        id="jobs"
        title="Jobs"
        subtitle="Work in progress"
        drillTo={`/reports?report=products_services_usage&range=${range}`}
        drillLabel="Open products & services usage"
      >
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
              {jobsSummary.unknownRecurrence > 0 && (
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  · {jobsSummary.unknownRecurrence} unclassified
                </div>
              )}
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

function Section({
  id,
  title,
  subtitle,
  drillTo,
  drillLabel = 'Open in Reports',
  children,
}: {
  /** Anchor id used by the sticky section nav and IntersectionObserver. */
  id?: string;
  title: string;
  subtitle?: string;
  /** When set, renders a small "Open in Reports →" anchor in the header. */
  drillTo?: string;
  drillLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="ins-section">
      <div className="ins-section-head">
        <h2 className="ins-section-title">{title}</h2>
        {subtitle && <span className="ins-section-sub">{subtitle}</span>}
        {drillTo && (
          <Link to={drillTo} className="ins-section-drill">
            {drillLabel} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Sticky horizontal nav at the top of Insights — pills for each major
 * section. Watches sections via IntersectionObserver and highlights the one
 * the user is currently looking at; clicking a pill scrolls smoothly there.
 */
function SectionNav({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? '');
  const ticking = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top of the viewport that's intersecting.
        if (ticking.current) return;
        ticking.current = true;
        requestAnimationFrame(() => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible[0]) setActive(visible[0].target.id);
          ticking.current = false;
        });
      },
      { rootMargin: '-120px 0px -60% 0px', threshold: 0 }
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top, behavior: 'smooth' });
    setActive(id);
  };

  return (
    <nav className="ins-section-nav" aria-label="Insights sections">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => scrollTo(s.id)}
          className={`ins-section-nav-pill ${active === s.id ? 'is-active' : ''}`}
          aria-current={active === s.id ? 'true' : undefined}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}

/**
 * One stage of the lead-conversion funnel — a horizontal stacked bar segmented
 * by source, with the total count above. The bar widths are the per-source
 * proportions so adjacent stages naturally narrow as leads drop off.
 */
function SourceFunnelStage({
  label,
  total,
  counts,
  sources,
  showLegend,
}: {
  label: string;
  total: number;
  counts: Record<string, number>;
  sources: readonly string[];
  showLegend?: boolean;
}) {
  const safeTotal = Math.max(1, total);
  return (
    <div className="ins-funnel-stage">
      <div className="ins-funnel-stage-head">
        <span className="ins-funnel-num">{total}</span>
        <span className="ins-funnel-lbl">{label}</span>
      </div>
      <div className="ins-source-bar" role="img" aria-label={`${label} broken down by source`}>
        {sources.map((s) => {
          const c = counts[s] ?? 0;
          if (c === 0) return null;
          const widthPct = (c / safeTotal) * 100;
          return (
            <span
              key={s}
              className={`ins-source-bar-seg ins-source-dot--${s}`}
              style={{ width: `${widthPct}%` }}
              title={`${s}: ${c}`}
            />
          );
        })}
        {total === 0 && <span className="ins-source-bar-empty">—</span>}
      </div>
      {showLegend && (
        <div className="ins-source-legend">
          {sources.map((s) => (
            <span key={s} className="ins-source-legend-item">
              <span className={`ins-source-dot ins-source-dot--${s}`} />
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Donut showing how the user gets paid — e-Transfer / Stripe / cheque etc.
 * Pulled from /api/invoices?action=payment_method_summary, so it includes
 * payments inside the selected range only.
 */
function PaymentMethodsDonut({
  rows,
}: {
  rows: { method: string; count: number; total: number }[];
}) {
  const total = rows.reduce((s, r) => s + r.total, 0);
  if (total === 0) {
    return (
      <div className="ins-conv-card">
        <div className="ins-conv-lbl">Payment methods</div>
        <div style={{ marginTop: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
          No payments in this period.
        </div>
      </div>
    );
  }
  // Render the donut as a series of arc segments using stroke-dasharray.
  const r = 36;
  const c = 2 * Math.PI * r;
  let consumed = 0;
  const COLORS = [
    'var(--primary-green)',
    'var(--insights-src-phone)',
    'var(--insights-src-email)',
    'var(--insights-src-referral)',
    'var(--insights-src-cyan)',
    'var(--insights-src-other)',
  ];

  return (
    <div className="ins-conv-card">
      <div className="ins-conv-lbl">Payment methods</div>
      <svg viewBox="0 0 100 100" width="92" height="92" className="ins-donut">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border-color)" strokeWidth="10" />
        {rows.map((row, i) => {
          const portion = row.total / total;
          const dash = portion * c;
          const offset = c / 4 - consumed;
          consumed += dash;
          return (
            <circle
              key={row.method}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={COLORS[i % COLORS.length]}
              strokeWidth="10"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={offset}
              transform="rotate(-90 50 50)"
            />
          );
        })}
      </svg>
      <div className="ins-method-legend">
        {rows.map((row, i) => (
          <div key={row.method} className="ins-method-row">
            <span className="ins-method-swatch" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="ins-method-name">{row.method}</span>
            <span className="ins-method-total">
              ${row.total.toLocaleString('en-CA', { maximumFractionDigits: 0 })}
            </span>
            <span className="ins-method-pct">{((row.total / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroTile({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' }) {
  return (
    <div className={`ins-hero-tile ins-hero-tile--${tone}`}>
      <div className="ins-hero-label">{label}</div>
      <div className="ins-hero-value">{value}</div>
    </div>
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

function YoYBars({
  current,
  prev,
}: {
  current: { label: string; value: number; key: string }[];
  prev: { label: string; value: number; key: string }[];
}) {
  const len = Math.max(current.length, prev.length, 1);
  const max = Math.max(1, ...current.map((c) => c.value), ...prev.map((p) => p.value));
  const W = 720;
  const H = 220;
  const padX = 28;
  const padY = 28;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const groupW = innerW / len;
  // Cap the bar width so a one- or two-bucket range draws a readable pair of
  // bars instead of a slab the width of the card, and centre the pair in its
  // slot so the group still lines up with its label.
  const barW = Math.max(3, Math.min(26, (groupW - 6) / 2));
  const pairW = barW * 2 + 2;
  // Thin the labels out so they never collide, however many buckets there are.
  const labelEvery = Math.ceil(len / 10);

  const empty = max <= 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ins-yoy-svg" role="img" aria-label="Revenue, current period vs prior">
      <line x1={padX} y1={padY + innerH} x2={W - padX} y2={padY + innerH} stroke="var(--border-color)" />
      {empty && (
        <text x={W / 2} y={padY + innerH / 2} textAnchor="middle" fontSize="12" fill="var(--text-muted)">
          No invoiced revenue in either period
        </text>
      )}
      {current.map((c, i) => {
        const p = prev[i]?.value ?? 0;
        const groupCx = padX + i * groupW + groupW / 2;
        const x = groupCx - pairW / 2;
        const cH = (c.value / max) * innerH;
        const pH = (p / max) * innerH;
        const showLabel = !empty && i % labelEvery === 0 && c.label;
        return (
          <g key={c.key || i}>
            <rect x={x} y={padY + innerH - pH} width={barW} height={pH} fill="var(--insights-amber-soft)" rx="2" />
            <rect
              x={x + barW + 2}
              y={padY + innerH - cH}
              width={barW}
              height={cH}
              fill="var(--primary-green)"
              rx="2"
            />
            {showLabel && (
              <text x={groupCx} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-muted)">
                {c.label}
              </text>
            )}
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
  const groupW = innerW / Math.max(1, weeks.length);
  // Same width cap as YoYBars — a short range yields few buckets, and
  // uncapped bars render as slabs across the whole card.
  const barW = Math.max(4, Math.min(26, (groupW - 6) / 2));
  const pairW = barW * 2 + 2;
  const empty = max <= 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ins-yoy-svg" role="img" aria-label="Quote value sent vs accepted, by week">
      <line x1={padX} y1={padY + innerH} x2={W - padX} y2={padY + innerH} stroke="var(--border-color)" />
      {empty && (
        <text x={W / 2} y={padY + innerH / 2} textAnchor="middle" fontSize="12" fill="var(--text-muted)">
          No quotes sent in this range
        </text>
      )}
      {weeks.map((w, i) => {
        const groupCx = padX + i * groupW + groupW / 2;
        const x = groupCx - pairW / 2;
        const sH = (w.sent / max) * innerH;
        const aH = (w.approved / max) * innerH;
        return (
          <g key={i}>
            <rect x={x} y={padY + innerH - sH} width={barW} height={sH} fill="var(--insights-amber-soft)" rx="2" />
            <rect x={x + barW + 2} y={padY + innerH - aH} width={barW} height={aH} fill="var(--primary-green)" rx="2" />
            {!empty && (
              <text x={groupCx} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--text-muted)">{w.label}</text>
            )}
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
        stroke="var(--primary-green)"
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
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--accent-soft)" strokeWidth="10" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="var(--primary-green)"
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

  /* Two-color accent. Brand = current / good. Amber = prior / needs attention.
     Defined on :root (this stylesheet only mounts with the page) so the nav,
     hero and sections all share one palette — and overridden for dark, where
     a low-alpha amber over a near-black surface reads as muddy brown rather
     than amber. Dark values are lifted and more opaque to hold their hue. */
  :root {
    --insights-amber: #d97706;
    --insights-amber-soft: rgba(217, 119, 6, 0.22);
    --insights-tint: var(--accent-soft);
    --insights-src-website: var(--primary-green);
    --insights-src-phone: #d97706;
    --insights-src-email: #1d4ed8;
    --insights-src-referral: #9333ea;
    --insights-src-cyan: #0891b2;
    --insights-src-other: #475569;
    --insights-src-direct: #94a3b8;
  }
  html.theme-dark {
    --insights-amber: #fbbf24;
    /* Solid, not alpha — any translucent amber over the near-black surface
       muddies into olive. This is the prior-period bar/swatch fill. */
    --insights-amber-soft: #d9a441;
    --insights-src-phone: #fbbf24;
    --insights-src-email: #7aa2f7;
    --insights-src-referral: #c08cf0;
    --insights-src-cyan: #22d3ee;
    --insights-src-other: #8a95a3;
    --insights-src-direct: #5d6873;
  }

  /* Sticky horizontal section nav. Sits below the page's header and above
     the hero strip. IntersectionObserver bumps the .is-active pill as the
     user scrolls between sections. */
  .ins-section-nav {
    position: sticky; top: 0; z-index: 6;
    display: flex; flex-wrap: wrap; gap: 4px;
    padding: 8px 4px;
    margin-bottom: 8px;
    background: var(--bg-color);
    border-bottom: 1px solid var(--border-color);
    backdrop-filter: blur(8px);
  }
  .ins-section-nav-pill {
    background: transparent; border: 0;
    padding: 6px 12px; border-radius: 999px;
    font-size: 12px; font-weight: 500;
    color: var(--text-muted); cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.12s;
  }
  .ins-section-nav-pill:hover { color: var(--text-primary); background: var(--surface-hover); }
  .ins-section-nav-pill.is-active {
    color: var(--primary-green);
    background: var(--accent-soft);
    border-color: var(--accent-muted);
  }

  .ins-hero {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    padding: 14px;
    margin-bottom: 16px;
    background: linear-gradient(180deg, var(--surface-color) 0%, var(--bg-secondary) 100%);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    position: sticky;
    top: 56px; /* below the section nav pill bar */
    z-index: 5;
    backdrop-filter: blur(8px);
  }
  .ins-hero-tile { padding: 6px 10px; border-left: 3px solid var(--border-color); }
  .ins-hero-tile--ok { border-left-color: var(--primary-green); }
  .ins-hero-tile--warn { border-left-color: var(--insights-amber); }
  .ins-hero-label { font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-muted); }
  .ins-hero-value { font-size: 22px; font-weight: 700; color: var(--text-primary); margin-top: 2px; line-height: 1.2; }

  .ins-section { background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px 22px; margin-bottom: 20px; }
  .ins-section-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .ins-section-title { font-size: 18px; font-weight: 600; margin: 0; }
  .ins-section-sub { font-size: 12px; color: var(--text-muted); }
  .ins-section-sub-head { display: flex; align-items: baseline; gap: 12px; margin: 20px 0 8px; font-size: 14px; font-weight: 600; }
  .ins-section-drill { margin-left: auto; font-size: 12px; font-weight: 500; color: var(--primary-green); text-decoration: none; padding: 4px 10px; border-radius: 6px; transition: background 0.12s; }
  .ins-section-drill:hover { background: var(--accent-soft); }

  .ins-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .ins-kpi-grid--2 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .ins-kpi-grid--3 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }

  .ins-kpi { padding: 14px 16px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color); }
  .ins-kpi-label { font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px; }
  .ins-kpi-value { font-size: 26px; font-weight: 600; line-height: 1.1; color: var(--text-primary); }
  .ins-kpi-meta { display: flex; gap: 8px; align-items: center; margin-top: 6px; min-height: 18px; flex-wrap: wrap; }
  .ins-kpi-change { font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 999px; }
  /* Up/down both used a red — the brand accent is red, so they were nearly
     indistinguishable. Use the semantic tokens, which have dark variants. */
  .ins-kpi-change.is-up { background: color-mix(in srgb, var(--color-success) 14%, transparent); color: var(--color-success); }
  .ins-kpi-change.is-down { background: var(--color-danger-bg); color: var(--color-danger); }
  .ins-kpi-sub { font-size: 11px; color: var(--text-muted); }

  .ins-yoy-totals { display: flex; gap: 32px; margin-bottom: 12px; }
  .ins-yoy-num { font-size: 26px; font-weight: 600; line-height: 1.1; color: var(--text-primary); }
  .ins-yoy-num--muted { color: var(--text-muted); }
  .ins-yoy-lbl { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); margin-top: 4px; letter-spacing: 0.5px; text-transform: uppercase; }
  .ins-swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .ins-swatch--curr { background: var(--primary-green); }
  .ins-swatch--prev { background: var(--accent-soft); }
  .ins-swatch--amber { background: var(--insights-amber-soft); border: 1px solid var(--insights-amber); }
  .ins-yoy-svg { width: 100%; height: auto; max-height: 240px; }

  .ins-lead-grid { display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 1fr); gap: 16px; align-items: stretch; }
  @media (max-width: 720px) { .ins-lead-grid { grid-template-columns: 1fr; } }
  .ins-lead-times { display: grid; gap: 12px; align-content: start; }

  .ins-funnel-row { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 16px; align-items: stretch; }
  @media (max-width: 720px) { .ins-funnel-row { grid-template-columns: 1fr; } }
  .ins-funnel-card { display: flex; align-items: center; gap: 16px; padding: 18px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; flex-wrap: wrap; }
  .ins-funnel-step { flex: 1; min-width: 100px; text-align: center; }
  .ins-funnel-num { font-size: 32px; font-weight: 600; color: var(--text-primary); line-height: 1; }
  .ins-funnel-lbl { font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-muted); margin-top: 6px; }
  .ins-funnel-sub { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
  .ins-funnel-arrow { color: var(--text-muted); font-size: 20px; user-select: none; }
  .ins-conv-card { padding: 18px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
  .ins-conv-num { font-size: 28px; font-weight: 600; color: var(--text-primary); }
  .ins-conv-lbl { font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-muted); }
  .ins-donut { margin-top: 6px; }
  .ins-legend { font-size: 11px; color: var(--text-muted); margin-top: 8px; display: grid; gap: 4px; }
  .ins-legend > div { display: flex; align-items: center; gap: 6px; }

  .ins-debtors { margin-top: 16px; padding: 12px 14px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; }
  .ins-debtors-head { display: flex; justify-content: space-between; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-muted); padding-bottom: 8px; border-bottom: 1px solid var(--border-color); }
  .ins-debtor-row { display: flex; justify-content: space-between; padding: 10px 8px; font-size: 13px; border-bottom: 1px dashed var(--border-color); border-radius: 4px; }
  .ins-debtor-row:last-of-type { border-bottom: 0; }
  .ins-debtor-row--link { text-decoration: none; transition: background 0.12s; cursor: pointer; }
  .ins-debtor-row--link:hover { background: var(--surface-hover); }
  .ins-debtor-row--link::after { content: '›'; color: var(--text-muted); margin-left: 8px; }
  .ins-debtor-name { color: var(--text-primary); }
  .ins-debtor-bal { font-family: 'JetBrains Mono', ui-monospace, monospace; color: var(--color-danger); font-weight: 600; }
  .ins-debtor-footnote { padding-top: 10px; margin-top: 8px; border-top: 1px solid var(--border-color); font-size: 11px; color: var(--text-muted); font-style: italic; }

  .ins-horizons { display: flex; flex-wrap: wrap; gap: 14px; align-items: baseline; padding: 10px 14px; margin-top: 12px; background: var(--accent-soft); border-left: 3px solid var(--primary-green); border-radius: 6px; font-size: 12px; }
  .ins-horizons-label { font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-muted); margin-right: 8px; }
  .ins-horizon { color: var(--text-primary); }
  .ins-horizon b { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  .ins-horizon--muted { color: var(--text-muted); }

  .ins-jobs-row { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 16px; align-items: stretch; }
  @media (max-width: 720px) { .ins-jobs-row { grid-template-columns: 1fr; } }
  .ins-jobs-tiles { align-content: start; }

  /* ── Cashflow with payment-methods donut beside the KPI tiles ── */
  .ins-cashflow-grid { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 16px; align-items: start; }
  @media (max-width: 820px) { .ins-cashflow-grid { grid-template-columns: 1fr; } }
  .ins-cashflow-tiles { align-content: start; }

  /* ── Stacked-by-source lead funnel ── */
  .ins-source-funnel { display: flex; flex-direction: column; gap: 14px; padding: 18px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; }
  .ins-funnel-stage-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
  .ins-source-bar { display: flex; height: 22px; border-radius: 4px; overflow: hidden; background: var(--border-color); position: relative; }
  .ins-source-bar-seg { height: 100%; transition: width 0.2s; }
  .ins-source-bar-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 12px; }
  .ins-source-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 8px; font-size: 11px; color: var(--text-muted); }
  .ins-source-legend-item { display: inline-flex; align-items: center; gap: 5px; }
  .ins-source-dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; vertical-align: middle; }
  /* Source palette — distinct hues so stacked bars are readable. */
  .ins-source-dot--website  { background: var(--insights-src-website); }
  .ins-source-dot--phone    { background: var(--insights-src-phone); }
  .ins-source-dot--email    { background: var(--insights-src-email); }
  .ins-source-dot--referral { background: var(--insights-src-referral); }
  .ins-source-dot--other    { background: var(--insights-src-other); }
  .ins-source-dot--direct   { background: var(--insights-src-direct); }

  .ins-source-conv { margin-top: 14px; padding: 12px 14px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; }
  .ins-source-conv-head, .ins-source-conv-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 12px; padding: 8px 0; }
  .ins-source-conv-head { font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--border-color); }
  .ins-source-conv-row { border-bottom: 1px dashed var(--border-color); }
  .ins-source-conv-row:last-child { border-bottom: 0; }
  .ins-source-conv-rate { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 600; }

  /* ── Payment methods card legend rows ── */
  .ins-method-legend { width: 100%; margin-top: 12px; display: grid; gap: 6px; font-size: 12px; }
  .ins-method-row { display: grid; grid-template-columns: 14px 1fr auto auto; gap: 8px; align-items: center; }
  .ins-method-swatch { width: 10px; height: 10px; border-radius: 2px; }
  .ins-method-name { color: var(--text-primary); }
  .ins-method-total { font-family: 'JetBrains Mono', ui-monospace, monospace; color: var(--text-primary); }
  .ins-method-pct { color: var(--text-muted); font-size: 11px; text-align: right; }
`;
