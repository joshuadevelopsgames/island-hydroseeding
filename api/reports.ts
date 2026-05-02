import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_auth';
import { resolveTenantId } from './_tenant';

function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function inWindow(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * 86400000;
}

function quoteConversionStats(
  quotes: { status: string; created_at: string }[],
  windowDays: number
): { pool: number; converted: number; rate: number } {
  const inW = quotes.filter((q) => inWindow(q.created_at, windowDays));
  const pool = inW.filter((q) => q.status !== 'Draft').length;
  const converted = inW.filter((q) => q.status === 'Converted').length;
  const rate = pool > 0 ? Math.round((converted / pool) * 1000) / 10 : 0;
  return { pool, converted, rate };
}

function countByStatus<T extends { status: string }>(rows: T[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) {
    m[r.status] = (m[r.status] ?? 0) + 1;
  }
  return m;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = supabase();
  if (!db) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return;
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const tenantId = resolveTenantId();
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const action = String(req.query.action ?? '');

  try {
    if (action === 'workflow_snapshot') {
      const [reqs, quotes, jobs, invs] = await Promise.all([
        db.from('requests').select('status').eq('tenant_id', tenantId),
        db.from('quotes').select('status, created_at').eq('tenant_id', tenantId),
        db.from('jobs').select('status').eq('tenant_id', tenantId),
        db.from('invoices').select('status').eq('tenant_id', tenantId),
      ]);
      const qrows = (quotes.data ?? []) as { status: string; created_at: string }[];
      const overdue =
        (invs.data ?? []).filter((i: { status: string }) => i.status === 'Overdue').length ?? 0;
      res.status(200).json({
        requests: countByStatus((reqs.data ?? []) as { status: string }[]),
        quotes: countByStatus((quotes.data ?? []) as { status: string }[]),
        jobs: countByStatus((jobs.data ?? []) as { status: string }[]),
        invoices: countByStatus((invs.data ?? []) as { status: string }[]),
        overdue_invoices: overdue,
        quotes_conversion_30d: quoteConversionStats(qrows, 30),
        quotes_conversion_90d: quoteConversionStats(qrows, 90),
        quotes_conversion_ytd: quoteConversionStats(
          qrows.filter((q) => new Date(q.created_at).getTime() >= new Date(new Date().getFullYear(), 0, 1).getTime()),
          400
        ),
      });
      return;
    }

    if (action === 'aged_receivables') {
      const { data: invs, error } = await db
        .from('invoices')
        .select('id, account_id, invoice_number, title, due_date, balance_due, total, status')
        .eq('tenant_id', tenantId)
        .gt('balance_due', 0);
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      const rows = invs ?? [];
      const accIds = [...new Set(rows.map((r) => r.account_id).filter(Boolean))] as string[];
      let names = new Map<string, string>();
      if (accIds.length) {
        const { data: accs } = await db.from('crm_accounts').select('id, name').eq('tenant_id', tenantId).in('id', accIds);
        names = new Map((accs ?? []).map((a: { id: string; name: string }) => [a.id, a.name]));
      }
      const today = new Date();
      const enriched = rows.map((r) => {
        const due = r.due_date ? new Date(String(r.due_date)) : today;
        const d = daysBetween(due, today);
        let bucket = 'Current';
        if (d > 90) bucket = '90+';
        else if (d > 60) bucket = '61–90';
        else if (d > 30) bucket = '31–60';
        else if (d > 0) bucket = '1–30';
        return {
          ...r,
          account_name: r.account_id ? names.get(String(r.account_id)) ?? '—' : '—',
          days_past_due: Math.max(0, d),
          aging_bucket: bucket,
        };
      });
      res.status(200).json({ rows: enriched });
      return;
    }

    if (action === 'projected_income') {
      const { data: invs, error } = await db
        .from('invoices')
        .select('id, due_date, balance_due, title, status')
        .eq('tenant_id', tenantId)
        .gt('balance_due', 0);
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      const byMonth = new Map<string, number>();
      for (const r of invs ?? []) {
        const d = r.due_date ? String(r.due_date).slice(0, 7) : 'unknown';
        byMonth.set(d, (byMonth.get(d) ?? 0) + Number(r.balance_due ?? 0));
      }
      const rows = [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({ month, amount }));
      res.status(200).json({ rows });
      return;
    }

    if (action === 'lead_source_revenue') {
      const from = String(req.query.from ?? '').trim();
      const to = String(req.query.to ?? '').trim();
      let q = db
        .from('invoices')
        .select('account_id, amount_paid, issue_date')
        .eq('tenant_id', tenantId)
        .eq('status', 'Paid');
      if (from) q = q.gte('issue_date', from);
      if (to) q = q.lte('issue_date', to);
      const { data: paid, error } = await q;
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      const accIds = [...new Set((paid ?? []).map((p) => p.account_id).filter(Boolean))] as string[];
      let leadByAccount = new Map<string, string | null>();
      if (accIds.length) {
        const { data: accs } = await db
          .from('crm_accounts')
          .select('id, lead_source_id')
          .eq('tenant_id', tenantId)
          .in('id', accIds);
        leadByAccount = new Map(
          (accs ?? []).map((a: { id: string; lead_source_id: string | null }) => [a.id, a.lead_source_id])
        );
      }
      const { data: sources } = await db.from('crm_lead_sources').select('id, name').eq('tenant_id', tenantId);
      const srcName = new Map((sources ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
      const totals = new Map<string, { id: string | null; name: string; amount: number }>();
      for (const row of paid ?? []) {
        const aid = row.account_id as string | null;
        const lsid = aid ? leadByAccount.get(aid) ?? null : null;
        const key = lsid ?? '_none';
        const name = lsid ? srcName.get(lsid) ?? 'Unknown source' : 'No lead source';
        const cur = totals.get(key) ?? { id: lsid, name, amount: 0 };
        cur.amount += Number(row.amount_paid ?? 0);
        totals.set(key, cur);
      }
      res.status(200).json({ rows: [...totals.values()] });
      return;
    }

    if (action === 'client_reengagement') {
      const months = Math.max(1, Math.min(60, Number(req.query.months ?? 12)));
      const cutoff = Date.now() - months * 30 * 86400000;
      const { data: jobs, error: jErr } = await db
        .from('jobs')
        .select('account_id, status, end_date, updated_at')
        .eq('tenant_id', tenantId);
      if (jErr) {
        res.status(500).json({ error: jErr.message });
        return;
      }
      const lastCompleted = new Map<string, number>();
      for (const j of jobs ?? []) {
        if (String(j.status) !== 'Completed' || !j.account_id) continue;
        const raw = j.end_date ?? j.updated_at;
        const t = raw ? new Date(String(raw)).getTime() : 0;
        const prev = lastCompleted.get(String(j.account_id)) ?? 0;
        if (t > prev) lastCompleted.set(String(j.account_id), t);
      }
      const { data: accounts, error: aErr } = await db.from('crm_accounts').select('id, name').eq('tenant_id', tenantId);
      if (aErr) {
        res.status(500).json({ error: aErr.message });
        return;
      }
      const rows = (accounts ?? []).filter((a: { id: string }) => {
        const last = lastCompleted.get(a.id);
        return last == null || last < cutoff;
      });
      res.status(200).json({ rows, months });
      return;
    }

    if (action === 'products_services_usage') {
      const from = String(req.query.from ?? '').trim();
      const to = String(req.query.to ?? '').trim();
      let jq = db
        .from('job_line_items')
        .select('product_service_name, quantity, total, created_at')
        .eq('tenant_id', tenantId);
      if (from) jq = jq.gte('created_at', from);
      if (to) jq = jq.lte('created_at', to);
      const { data: jli, error } = await jq;
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      const agg = new Map<string, { product_service_name: string; quantity: number; revenue: number }>();
      for (const row of jli ?? []) {
        const name = String(row.product_service_name ?? '');
        const cur = agg.get(name) ?? { product_service_name: name, quantity: 0, revenue: 0 };
        cur.quantity += Number(row.quantity ?? 0);
        cur.revenue += Number(row.total ?? 0);
        agg.set(name, cur);
      }
      const rows = [...agg.values()].sort((a, b) => b.revenue - a.revenue);
      res.status(200).json({ rows });
      return;
    }

    if (action === 'revenue_by_service') {
      // Sum paid invoice line items, grouped by the linked product/service's
      // category (e.g., Hydroseeding, Erosion control, Materials). Falls back
      // to "Uncategorized" when the line item references a name not present
      // in products_services or has no category.
      const from = String(req.query.from ?? '').trim();
      const to = String(req.query.to ?? '').trim();
      let invQ = db
        .from('invoices')
        .select('id, status, issue_date, account_id')
        .eq('tenant_id', tenantId)
        .in('status', ['Paid', 'Sent', 'Overdue']);
      if (from) invQ = invQ.gte('issue_date', from);
      if (to) invQ = invQ.lte('issue_date', to);
      const { data: invs, error: invErr } = await invQ;
      if (invErr) {
        res.status(500).json({ error: invErr.message });
        return;
      }
      const invoiceIds = (invs ?? []).map((i: { id: string }) => i.id);
      if (invoiceIds.length === 0) {
        res.status(200).json({ rows: [] });
        return;
      }
      const { data: lis, error: liErr } = await db
        .from('invoice_line_items')
        .select('invoice_id, product_service_name, total')
        .eq('tenant_id', tenantId)
        .in('invoice_id', invoiceIds);
      if (liErr) {
        res.status(500).json({ error: liErr.message });
        return;
      }
      const { data: prods } = await db
        .from('products_services')
        .select('name, category')
        .eq('tenant_id', tenantId);
      const catByName = new Map(
        (prods ?? []).map((p: { name: string; category: string | null }) => [p.name, p.category ?? 'Uncategorized'])
      );
      const totals = new Map<string, { category: string; revenue: number; line_items: number }>();
      for (const r of lis ?? []) {
        const name = String((r as { product_service_name?: string }).product_service_name ?? '');
        const category = catByName.get(name) ?? 'Uncategorized';
        const cur = totals.get(category) ?? { category, revenue: 0, line_items: 0 };
        cur.revenue += Number((r as { total?: number }).total ?? 0);
        cur.line_items += 1;
        totals.set(category, cur);
      }
      const rows = [...totals.values()].sort((a, b) => b.revenue - a.revenue);
      res.status(200).json({ rows });
      return;
    }

    if (action === 'communications_stub') {
      const accountId = String(req.query.account_id ?? '').trim();
      if (!accountId) {
        res.status(200).json({ rows: [], note: 'Pass account_id to filter comm_log (Phase 7).' });
        return;
      }
      const { data, error } = await db
        .from('comm_log')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('account_id', accountId)
        .order('sent_at', { ascending: false })
        .limit(500);
      if (error) {
        res.status(200).json({ rows: [], note: error.message });
        return;
      }
      res.status(200).json({ rows: data ?? [] });
      return;
    }

    res.status(400).json({
      error:
        'Invalid action. Use workflow_snapshot, aged_receivables, projected_income, lead_source_revenue, client_reengagement, products_services_usage, communications_stub',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Report failed';
    res.status(500).json({ error: msg });
  }
}
