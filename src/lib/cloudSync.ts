/**
 * Syncs shared app data to Supabase via Vercel `/api/workspace` (service role on server).
 * Per-device keys (current user, last selected employee) stay local only.
 */

export const CLOUD_SYNC_KEYS = [
  'appUsers',
  'timeLogs',
  'timeEmployees',
  'tasksBoard',
  'equipmentMaintenance',
  'fleetAssets_v1',
  'fleetWorkOrders_v1',
  'fleetMigratedLegacyMaint_v1',
  'fleetFuelEntries_v1',
  'fleetRoadCosts_v1',
  'fleetIssues_v1',
  'fleetPurchaseOrders_v1',
  'preTripLogs_v2',
  'inventoryState',
  'documentsRepository',
  'documentsRepositoryV2',
  'flhaLogs_v2',
] as const;

const SYNC_KEY_SET = new Set<string>(CLOUD_SYNC_KEYS);
const META_SERVER_AT = 'cloudSync_lastServerAt';

const API = '/api/workspace';

let hookInstalled = false;
let suppressPush = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

function readBundle(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CLOUD_SYNC_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === '') continue;
    try {
      out[key] = JSON.parse(raw) as unknown;
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

function applyServerPayload(payload: Record<string, unknown> | null | undefined) {
  if (!payload || typeof payload !== 'object') return;
  suppressPush = true;
  try {
    for (const key of CLOUD_SYNC_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
      const v = payload[key];
      if (v === undefined) continue;
      localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v));
    }
  } finally {
    suppressPush = false;
  }
}

function schedulePush() {
  if (suppressPush) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushToServer();
  }, 1800);
}

export function installStorageSyncHook() {
  if (hookInstalled || typeof window === 'undefined') return;
  hookInstalled = true;
  const orig = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key: string, value: string) => {
    orig(key, value);
    if (SYNC_KEY_SET.has(key)) schedulePush();
  };
}

/** Queue a debounced upload (e.g. after login seed or migrations). */
export function requestCloudPush() {
  schedulePush();
}

async function pushToServer() {
  try {
    const payload = readBundle();
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    });
    if (!r.ok) return;
    const data = (await r.json()) as { updated_at?: string };
    if (data.updated_at) localStorage.setItem(META_SERVER_AT, data.updated_at);
  } catch {
    /* offline or local dev without API */
  }
}

async function pullFromServer(): Promise<{ merge: boolean; updated_at: string | null }> {
  try {
    const r = await fetch(API, { cache: 'no-store' });
    if (r.status === 404 || r.status === 503) return { merge: false, updated_at: null };
    if (!r.ok) return { merge: false, updated_at: null };
    const data = (await r.json()) as {
      payload?: Record<string, unknown>;
      updated_at?: string | null;
    };
    const updated_at = data.updated_at ?? null;
    const localAt = localStorage.getItem(META_SERVER_AT);
    if (!updated_at) return { merge: false, updated_at: null };

    if (localAt === updated_at) return { merge: false, updated_at };

    const serverKeys = data.payload && typeof data.payload === 'object' ? Object.keys(data.payload) : [];
    const hasPayload = serverKeys.some((k) => SYNC_KEY_SET.has(k));
    if (!hasPayload) {
      localStorage.setItem(META_SERVER_AT, updated_at);
      return { merge: false, updated_at };
    }

    applyServerPayload(data.payload);
    localStorage.setItem(META_SERVER_AT, updated_at);
    return { merge: true, updated_at };
  } catch {
    return { merge: false, updated_at: null };
  }
}

let bootstrapOnce: Promise<'reload' | 'ready'> | null = null;

export function runAppBootstrap(): Promise<'reload' | 'ready'> {
  if (!bootstrapOnce) {
    bootstrapOnce = (async () => {
      installStorageSyncHook();
      const { merge } = await pullFromServer();
      if (merge) return 'reload';
      void pushToServer();
      return 'ready';
    })();
  }
  return bootstrapOnce;
}
