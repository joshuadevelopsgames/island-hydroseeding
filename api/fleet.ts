import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_auth';
import { resolveTenantId } from './_tenant';
import {
  mapAssetIn,
  mapAssetOut,
  mapFuelIn,
  mapFuelOut,
  mapInvIn,
  mapInvOut,
  mapIssueIn,
  mapIssueOut,
  mapPoIn,
  mapPoOut,
  mapRoadIn,
  mapRoadOut,
  mapWoIn,
  mapWoOut,
  type StaleWarning,
} from './_fleetMaps';

function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return b as Record<string, unknown>;
}

function newerThan(serverIso: string, clientIso: string): boolean {
  const s = Date.parse(serverIso);
  const c = Date.parse(clientIso);
  if (Number.isNaN(s) || Number.isNaN(c)) return false;
  return s > c;
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

  if (req.method === 'GET') {
    const action = String(req.query.action ?? '');
    if (action !== 'bundle') {
      res.status(400).json({ error: 'Use ?action=bundle' });
      return;
    }

    const [a, f, r, i, inv, po, wo] = await Promise.all([
      db.from('fleet_assets').select('*').eq('tenant_id', tenantId),
      db.from('fleet_fuel_entries').select('*').eq('tenant_id', tenantId),
      db.from('fleet_road_costs').select('*').eq('tenant_id', tenantId),
      db.from('fleet_issues').select('*').eq('tenant_id', tenantId),
      db.from('inventory_items').select('*').eq('tenant_id', tenantId),
      db.from('fleet_purchase_orders').select('*').eq('tenant_id', tenantId),
      db.from('fleet_work_orders').select('*').eq('tenant_id', tenantId),
    ]);

    const err = a.error || f.error || r.error || i.error || inv.error || po.error || wo.error;
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }

    res.status(200).json({
      assets: (a.data ?? []).map((row) => mapAssetOut(row as Record<string, unknown>)),
      fuelEntries: (f.data ?? []).map((row) => mapFuelOut(row as Record<string, unknown>)),
      roadCosts: (r.data ?? []).map((row) => mapRoadOut(row as Record<string, unknown>)),
      issues: (i.data ?? []).map((row) => mapIssueOut(row as Record<string, unknown>)),
      inventory: (inv.data ?? []).map((row) => mapInvOut(row as Record<string, unknown>)),
      purchaseOrders: (po.data ?? []).map((row) => mapPoOut(row as Record<string, unknown>)),
      workOrders: (wo.data ?? []).map((row) => mapWoOut(row as Record<string, unknown>)),
    });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseBody(req);
  const action = String(body.action ?? '');
  if (action !== 'push') {
    res.status(400).json({ error: 'Unknown action; use push' });
    return;
  }

  const staleWarnings: StaleWarning[] = [];

  async function checkStale(
    table: string,
    id: string,
    clientUpdatedAt: string | undefined
  ): Promise<void> {
    if (!clientUpdatedAt) return;
    const { data } = await db.from(table).select('updated_at').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    const serverU = data && typeof data === 'object' && 'updated_at' in data ? String((data as { updated_at: string }).updated_at) : null;
    if (serverU && newerThan(serverU, clientUpdatedAt)) {
      staleWarnings.push({
        table,
        id,
        serverUpdatedAt: serverU,
        clientUpdatedAt,
      });
    }
  }

  const assets = Array.isArray(body.assets) ? (body.assets as Record<string, unknown>[]) : [];
  const fuelEntries = Array.isArray(body.fuelEntries) ? (body.fuelEntries as Record<string, unknown>[]) : [];
  const roadCosts = Array.isArray(body.roadCosts) ? (body.roadCosts as Record<string, unknown>[]) : [];
  const issues = Array.isArray(body.issues) ? (body.issues as Record<string, unknown>[]) : [];
  const inventory = Array.isArray(body.inventory) ? (body.inventory as Record<string, unknown>[]) : [];
  const purchaseOrders = Array.isArray(body.purchaseOrders) ? (body.purchaseOrders as Record<string, unknown>[]) : [];
  const workOrders = Array.isArray(body.workOrders) ? (body.workOrders as Record<string, unknown>[]) : [];

  try {
    for (const row of assets) {
      const id = String(row.id ?? '');
      if (!id) continue;
      const u = row.updatedAt != null ? String(row.updatedAt) : row.updated_at != null ? String(row.updated_at) : undefined;
      await checkStale('fleet_assets', id, u);
      const mapped = mapAssetIn(tenantId, row);
      const { error } = await db.from('fleet_assets').upsert(mapped, { onConflict: 'id' });
      if (error) throw error;
    }

    for (const row of fuelEntries) {
      const id = String(row.id ?? '');
      if (!id) continue;
      const u = row.updatedAt != null ? String(row.updatedAt) : undefined;
      await checkStale('fleet_fuel_entries', id, u);
      const mapped = mapFuelIn(tenantId, row);
      const { error } = await db.from('fleet_fuel_entries').upsert(mapped, { onConflict: 'id' });
      if (error) throw error;
    }

    for (const row of roadCosts) {
      const id = String(row.id ?? '');
      if (!id) continue;
      const u = row.updatedAt != null ? String(row.updatedAt) : undefined;
      await checkStale('fleet_road_costs', id, u);
      const mapped = mapRoadIn(tenantId, row);
      const { error } = await db.from('fleet_road_costs').upsert(mapped, { onConflict: 'id' });
      if (error) throw error;
    }

    for (const row of issues) {
      const id = String(row.id ?? '');
      if (!id) continue;
      const u = row.updatedAt != null ? String(row.updatedAt) : undefined;
      await checkStale('fleet_issues', id, u);
      const mapped = mapIssueIn(tenantId, row);
      const { error } = await db.from('fleet_issues').upsert(mapped, { onConflict: 'id' });
      if (error) throw error;
    }

    for (const row of inventory) {
      const id = String(row.id ?? '');
      if (!id) continue;
      const u = row.updatedAt != null ? String(row.updatedAt) : undefined;
      await checkStale('inventory_items', id, u);
      const mapped = mapInvIn(tenantId, row);
      const { error } = await db.from('inventory_items').upsert(mapped, { onConflict: 'id' });
      if (error) throw error;
    }

    for (const row of purchaseOrders) {
      const id = String(row.id ?? '');
      if (!id) continue;
      const u = row.updatedAt != null ? String(row.updatedAt) : undefined;
      await checkStale('fleet_purchase_orders', id, u);
      const mapped = mapPoIn(tenantId, row);
      const { error } = await db.from('fleet_purchase_orders').upsert(mapped, { onConflict: 'id' });
      if (error) throw error;
    }

    for (const row of workOrders) {
      const id = String(row.id ?? '');
      if (!id) continue;
      const u = row.updatedAt != null ? String(row.updatedAt) : undefined;
      await checkStale('fleet_work_orders', id, u);
      const mapped = mapWoIn(tenantId, row);
      const { error } = await db.from('fleet_work_orders').upsert(mapped, { onConflict: 'id' });
      if (error) throw error;
    }

    res.status(200).json({ ok: true, staleWarnings });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
}
