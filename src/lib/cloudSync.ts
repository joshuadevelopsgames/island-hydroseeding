/**
 * Syncs shared app data to Supabase via Vercel `/api/workspace` (tenant JSON blob).
 * Fleet assets / fuel / issues / inventory sync separately via `/api/fleet` — not listed here.
 * Per-device keys (current user, last selected employee) stay local only.
 */

import { apiFetch } from './apiClient';
import { supabase, isMisconfigured } from './supabase';

export const CLOUD_SYNC_KEYS = [
  'appUsers',
  'timeLogs',
  'timeEmployees',
  'tasksBoard',
  'tasksColumns_v1',
  'customCalendarEvents_v1',
  'equipmentMaintenance',
  // NOTE: 'preTripLogs_v2' intentionally removed. Pre-trips are now stored
  // server-side as first-class rows via /api/fleet-pretrips. Syncing them
  // inside this last-write-wins blob silently clobbered records submitted
  // from multiple field devices.
  'documentsRepository',
  'documentsRepositoryV2',
  'flhaLogs_v2',
] as const;

const SYNC_KEY_SET = new Set<string>(CLOUD_SYNC_KEYS);
const META_SERVER_AT = 'cloudSync_lastServerAt';
const PENDING_PUSH_KEY = 'workspace_sync_pending_v1';
/** sessionStorage: stop infinite merge→reload if timestamps never “match” string-wise */
const MERGE_RELOAD_BREAKER_KEY = 'ih_ws_merge_reload_breaker';
const MERGE_RELOAD_WINDOW_MS = 20_000;
const MERGE_RELOAD_MAX = 3;

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

function notifyWorkspacePendingChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('workspace-sync-pending-updated'));
}

export function hasWorkspacePushPending(): boolean {
  try {
    return localStorage.getItem(PENDING_PUSH_KEY) === '1';
  } catch {
    return false;
  }
}

function markWorkspacePushPending() {
  try {
    localStorage.setItem(PENDING_PUSH_KEY, '1');
  } catch {
    /* ignore */
  }
  notifyWorkspacePendingChanged();
}

function clearWorkspacePushPending() {
  try {
    localStorage.removeItem(PENDING_PUSH_KEY);
  } catch {
    /* ignore */
  }
  notifyWorkspacePendingChanged();
}

function canReachNetwork(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

/** Supabase / JSON may differ in ISO formatting; avoid perpetual merge: true. */
function workspaceTimestampsMatch(stored: string | null, server: string | null): boolean {
  if (stored == null || server == null) return false;
  if (stored === server) return true;
  const a = Date.parse(stored);
  const b = Date.parse(server);
  if (Number.isFinite(a) && Number.isFinite(b)) return a === b;
  return false;
}

function mergeReloadCircuitOpen(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    const raw = sessionStorage.getItem(MERGE_RELOAD_BREAKER_KEY);
    const now = Date.now();
    if (!raw) return false;
    const [t0, count] = raw.split(':').map(Number);
    if (!Number.isFinite(t0) || now - t0 > MERGE_RELOAD_WINDOW_MS) {
      sessionStorage.removeItem(MERGE_RELOAD_BREAKER_KEY);
      return false;
    }
    return count >= MERGE_RELOAD_MAX;
  } catch {
    return false;
  }
}

function recordMergeReloadAttempt(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const now = Date.now();
    const raw = sessionStorage.getItem(MERGE_RELOAD_BREAKER_KEY);
    let t0 = now;
    let count = 0;
    if (raw) {
      const parts = raw.split(':').map(Number);
      if (Number.isFinite(parts[0]) && now - parts[0] <= MERGE_RELOAD_WINDOW_MS) {
        t0 = parts[0];
        count = parts[1] ?? 0;
      }
    }
    count += 1;
    sessionStorage.setItem(MERGE_RELOAD_BREAKER_KEY, `${t0}:${count}`);
  } catch {
    /* ignore */
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
  if (isMisconfigured) return;
  if (!canReachNetwork()) {
    markWorkspacePushPending();
    return;
  }
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const payload = readBundle();
    const r = await apiFetch(API, {
      method: 'POST',
      body: JSON.stringify({ payload }),
    });
    if (!r.ok) {
      markWorkspacePushPending();
      return;
    }
    clearWorkspacePushPending();
    const data = (await r.json()) as { updated_at?: string };
    if (data.updated_at) localStorage.setItem(META_SERVER_AT, data.updated_at);
  } catch {
    markWorkspacePushPending();
  }
}

async function pullFromServerImpl(): Promise<{ merge: boolean; updated_at: string | null }> {
  if (isMisconfigured) return { merge: false, updated_at: null };
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return { merge: false, updated_at: null };

    const r = await apiFetch(API, { cache: 'no-store' });
    if (r.status === 404 || r.status === 503) return { merge: false, updated_at: null };
    if (!r.ok) return { merge: false, updated_at: null };
    const data = (await r.json()) as {
      payload?: Record<string, unknown>;
      updated_at?: string | null;
    };
    const updated_at = data.updated_at ?? null;
    if (!updated_at) return { merge: false, updated_at: null };

    // Re-read after network: another serialized pull may have updated META while we awaited.
    const localAt = localStorage.getItem(META_SERVER_AT);
    if (workspaceTimestampsMatch(localAt, updated_at)) return { merge: false, updated_at };

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

/** Serialize pulls so concurrent callers (visibility + bootstrap + online) cannot all merge+reload. */
let pullQueue: Promise<unknown> = Promise.resolve();

function pullFromServer(): Promise<{ merge: boolean; updated_at: string | null }> {
  const next = pullQueue.then(() => pullFromServerImpl());
  pullQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

let mergeReloadCoalesced = false;

/**
 * Full reload after merging server workspace into localStorage (coalesces parallel triggers).
 * Returns false if a reload loop circuit breaker trips — caller should continue as “ready”.
 */
export function reloadAfterWorkspaceMerge(): boolean {
  if (mergeReloadCoalesced) return false;
  if (mergeReloadCircuitOpen()) {
    console.warn(
      '[cloudSync] Skipping workspace merge reload (loop breaker). Data is already in localStorage; refresh manually if the UI looks stale.'
    );
    mergeReloadCoalesced = true;
    return false;
  }
  mergeReloadCoalesced = true;
  recordMergeReloadAttempt();
  queueMicrotask(() => {
    window.location.reload();
  });
  return true;
}

let bootstrapOnce: Promise<'reload' | 'ready'> | null = null;

export function runAppBootstrap(): Promise<'reload' | 'ready'> {
  if (!bootstrapOnce) {
    bootstrapOnce = (async () => {
      installStorageSyncHook();
      installVisibilitySync();
      window.addEventListener('online', () => {
        void pullFromServer().then(({ merge }) => {
          // applyServerPayload already ran; avoid reload — online often flaps and caused reload storms.
          if (merge) return;
          void pushToServer();
        });
      });

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const { merge } = await pullFromServer();
        if (merge && reloadAfterWorkspaceMerge()) return 'reload';
        void pushToServer();
      }
      return 'ready';
    })();
  }
  return bootstrapOnce;
}

/** Call when the user session becomes available (e.g. after login). Debounced. */
let authSyncTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleWorkspaceSyncOnAuth(): void {
  if (authSyncTimer) clearTimeout(authSyncTimer);
  authSyncTimer = setTimeout(() => {
    authSyncTimer = null;
    void syncWorkspaceOnAuth();
  }, 400);
}

export async function syncWorkspaceOnAuth(): Promise<void> {
  if (isMisconfigured) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  const { merge } = await pullFromServer();
  if (merge) {
    if (reloadAfterWorkspaceMerge()) return;
    await pushToServer();
    return;
  }
  await pushToServer();
}

/* ── Re-sync when the PWA resumes from background ── */

let visHookInstalled = false;

function installVisibilitySync() {
  if (visHookInstalled || typeof document === 'undefined') return;
  visHookInstalled = true;

  let visDebounce: ReturnType<typeof setTimeout> | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (visDebounce) clearTimeout(visDebounce);
    // Debounce: Safari / PWAs can fire visibility repeatedly; pull still applies server data to localStorage.
    visDebounce = setTimeout(() => {
      visDebounce = null;
      void pullFromServer().then(({ merge }) => {
        if (merge) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('workspace-merged-no-reload'));
          }
        }
      });
    }, 600);
  });
}
