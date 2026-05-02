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
  'preTripLogs_v2',
  'documentsRepository',
  'documentsRepositoryV2',
  'flhaLogs_v2',
] as const;

const SYNC_KEY_SET = new Set<string>(CLOUD_SYNC_KEYS);
const META_SERVER_AT = 'cloudSync_lastServerAt';
const PENDING_PUSH_KEY = 'workspace_sync_pending_v1';

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

function markWorkspacePushPending() {
  try {
    localStorage.setItem(PENDING_PUSH_KEY, '1');
  } catch {
    /* ignore */
  }
}

function clearWorkspacePushPending() {
  try {
    localStorage.removeItem(PENDING_PUSH_KEY);
  } catch {
    /* ignore */
  }
}

function canReachNetwork(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
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

async function pullFromServer(): Promise<{ merge: boolean; updated_at: string | null }> {
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
      installVisibilitySync();
      window.addEventListener('online', () => {
        void pullFromServer().then(({ merge }) => {
          if (merge) {
            window.location.reload();
            return;
          }
          void pushToServer();
        });
      });

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const { merge } = await pullFromServer();
        if (merge) return 'reload';
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
    window.location.reload();
    return;
  }
  await pushToServer();
}

/* ── Re-sync when the PWA resumes from background ── */

let visHookInstalled = false;

function installVisibilitySync() {
  if (visHookInstalled || typeof document === 'undefined') return;
  visHookInstalled = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    // App just came back to the foreground — pull latest data
    void pullFromServer().then(({ merge }) => {
      if (merge) {
        // Most stores read localStorage once on mount, so a reload is the
        // simplest way to guarantee every component picks up fresh data.
        window.location.reload();
      }
    });
  });
}
