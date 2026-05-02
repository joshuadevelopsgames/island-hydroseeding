/**
 * Offline-friendly fleet workspace: localStorage as cache, /api/fleet as source of truth when online.
 * Queues a push when offline or on failure; retries on "online" and after local mutations.
 */
import { toast } from 'sonner';
import {
  loadAssets,
  loadFuelEntries,
  loadIssues,
  loadInventory,
  loadPurchaseOrders,
  loadRoadCosts,
  loadWorkOrders,
  saveAssets,
  saveFuelEntries,
  saveIssues,
  saveInventory,
  savePurchaseOrders,
  saveRoadCosts,
  saveWorkOrders,
  suppressFleetMutationEvents,
} from './fleetStore';
import { fetchFleetBundle, pushFleetBundle, type FleetBundle } from './fleetRemote';
import { isMisconfigured } from './supabase';

const PENDING_KEY = 'fleet_sync_pending_v1';
const DEBOUNCE_MS = 900;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let didInitialPull = false;

function mergeByUpdatedAt<T extends { id: string; updatedAt?: string }>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of local) map.set(row.id, row);
  for (const r of remote) {
    const l = map.get(r.id);
    if (!l) {
      map.set(r.id, r);
      continue;
    }
    const rt = r.updatedAt ?? '';
    const lt = l.updatedAt ?? '';
    map.set(r.id, rt >= lt ? r : l);
  }
  return [...map.values()];
}

function readSnapshot(): FleetBundle {
  return {
    assets: loadAssets(),
    fuelEntries: loadFuelEntries(),
    roadCosts: loadRoadCosts(),
    issues: loadIssues(),
    inventory: loadInventory(),
    purchaseOrders: loadPurchaseOrders(),
    workOrders: loadWorkOrders(),
  };
}

function applyRemoteBundle(bundle: FleetBundle) {
  suppressFleetMutationEvents(() => {
    saveAssets(mergeByUpdatedAt(loadAssets(), bundle.assets));
    saveFuelEntries(mergeByUpdatedAt(loadFuelEntries(), bundle.fuelEntries));
    saveRoadCosts(mergeByUpdatedAt(loadRoadCosts(), bundle.roadCosts));
    saveIssues(mergeByUpdatedAt(loadIssues(), bundle.issues));
    saveInventory(mergeByUpdatedAt(loadInventory(), bundle.inventory));
    savePurchaseOrders(mergeByUpdatedAt(loadPurchaseOrders(), bundle.purchaseOrders));
    saveWorkOrders(mergeByUpdatedAt(loadWorkOrders(), bundle.workOrders));
  });
}

function markPending() {
  try {
    localStorage.setItem(PENDING_KEY, '1');
  } catch {
    /* ignore */
  }
}

function clearPending() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function hasPendingFleetPush(): boolean {
  try {
    return localStorage.getItem(PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

function canReachNetwork(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

export async function pullFleetWorkspaceOnce(): Promise<void> {
  if (isMisconfigured || !canReachNetwork()) return;
  try {
    const bundle = await fetchFleetBundle();
    if (!bundle) return;
    applyRemoteBundle(bundle);
  } catch (e) {
    console.warn('[fleet] pull failed', e);
  }
}

export async function pushFleetWorkspaceNow(): Promise<void> {
  if (isMisconfigured) return;
  if (!canReachNetwork()) {
    markPending();
    return;
  }
  const payload = readSnapshot();
  try {
    const result = await pushFleetBundle(payload);
    clearPending();
    if (result.staleWarnings?.length) {
      for (const w of result.staleWarnings) {
        toast.warning('Fleet data was updated elsewhere', {
          description: `${w.table} ${w.id.slice(0, 8)}… — your changes were saved (last write wins).`,
          duration: 6000,
        });
      }
    }
  } catch (e) {
    console.warn('[fleet] push failed', e);
    markPending();
    if (canReachNetwork()) {
      toast.error('Could not sync fleet data', {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

function scheduleDebouncedPush() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void pushFleetWorkspaceNow();
  }, DEBOUNCE_MS);
}

export function initFleetWorkspaceSync(): () => void {
  const onMutate = () => scheduleDebouncedPush();
  const onOnline = () => {
    void pullFleetWorkspaceOnce().finally(() => {
      void pushFleetWorkspaceNow();
    });
  };

  window.addEventListener('fleet-local-mutated', onMutate);
  window.addEventListener('online', onOnline);

  if (!didInitialPull) {
    didInitialPull = true;
    void pullFleetWorkspaceOnce().finally(() => {
      void pushFleetWorkspaceNow();
    });
  }

  return () => {
    window.removeEventListener('fleet-local-mutated', onMutate);
    window.removeEventListener('online', onOnline);
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}

/** Ensures every row has updatedAt for sync (migration helper) */
export function ensureFleetTimestamps<T extends { id: string; updatedAt?: string; createdAt?: string }>(
  rows: T[]
): T[] {
  const now = new Date().toISOString();
  return rows.map((r) => ({
    ...r,
    updatedAt: r.updatedAt ?? r.createdAt ?? now,
  }));
}
