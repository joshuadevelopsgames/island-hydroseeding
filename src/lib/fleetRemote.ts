/**
 * Authenticated /api/fleet calls — bundle pull + snapshot push.
 */
import { apiFetch } from './apiClient';
import type { FleetAsset, FleetIssue, FuelEntry, InventoryStockItem, PurchaseOrder, RoadCost, WorkOrder } from './fleetTypes';

export type FleetStaleWarning = {
  table: string;
  id: string;
  serverUpdatedAt: string;
  clientUpdatedAt: string;
};

export type FleetBundle = {
  assets: FleetAsset[];
  fuelEntries: FuelEntry[];
  roadCosts: RoadCost[];
  issues: FleetIssue[];
  inventory: InventoryStockItem[];
  purchaseOrders: PurchaseOrder[];
  workOrders: WorkOrder[];
};

export type FleetPushPayload = FleetBundle;

export type FleetPushResult = {
  ok: boolean;
  staleWarnings: FleetStaleWarning[];
};

async function readJson<T>(r: Response): Promise<T> {
  const text = await r.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.slice(0, 200) || r.statusText);
  }
}

export async function fetchFleetBundle(): Promise<FleetBundle | null> {
  const r = await apiFetch('/api/fleet?action=bundle');
  if (r.status === 404 || r.status === 503) return null;
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Fleet bundle ${r.status}`);
  }
  return readJson<FleetBundle>(r);
}

export async function pushFleetBundle(payload: FleetPushPayload): Promise<FleetPushResult> {
  const r = await apiFetch('/api/fleet', {
    method: 'POST',
    body: JSON.stringify({ action: 'push', ...payload }),
  });
  if (!r.ok) {
    const j = (await readJson<{ error?: string }>(r).catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `Fleet push ${r.status}`);
  }
  return readJson<FleetPushResult>(r);
}
