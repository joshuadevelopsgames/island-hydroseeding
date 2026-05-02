/**
 * Queues POST bodies when the browser is offline; replays with apiFetch when online.
 * Used by quotes/products APIs — extend to other routes as needed.
 */

import { apiFetch } from './apiClient';
import { queryClient } from './queryClient';

const STORAGE_KEY = 'offline_api_queue_v1';
const MAX_ITEMS = 200;

export class OfflineQueuedError extends Error {
  readonly code = 'OFFLINE_QUEUED' as const;
  constructor() {
    super('OFFLINE_QUEUED');
    this.name = 'OfflineQueuedError';
  }
}

export function isOfflineQueuedError(e: unknown): e is OfflineQueuedError {
  return e instanceof OfflineQueuedError;
}

export function shouldQueueOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

type QueuedItem = {
  id: string;
  url: string;
  body: string;
  createdAt: string;
};

function loadQueue(): QueuedItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    return Array.isArray(p) ? (p as QueuedItem[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(items: QueuedItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function getOfflineQueueLength(): number {
  return loadQueue().length;
}

export function enqueueOfflinePost(url: string, body: Record<string, unknown>): void {
  const items = loadQueue();
  const entry: QueuedItem = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url,
    body: JSON.stringify(body),
    createdAt: new Date().toISOString(),
  };
  const next = [...items, entry];
  if (next.length > MAX_ITEMS) {
    next.splice(0, next.length - MAX_ITEMS);
  }
  saveQueue(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offline-api-queue-updated'));
  }
}

/**
 * POST each queued item in order. Removes on 2xx; keeps on failure for retry.
 */
export async function flushOfflineMutationQueue(): Promise<{ ok: number; failed: number }> {
  if (shouldQueueOffline()) return { ok: 0, failed: 0 };

  let items = loadQueue();
  if (items.length === 0) return { ok: 0, failed: 0 };

  let ok = 0;
  let failed = 0;
  const remaining: QueuedItem[] = [];

  for (const item of items) {
    try {
      const body = JSON.parse(item.body) as Record<string, unknown>;
      const r = await apiFetch(item.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        ok += 1;
      } else {
        failed += 1;
        remaining.push(item);
      }
    } catch {
      failed += 1;
      remaining.push(item);
    }
  }

  saveQueue(remaining);
  if (ok > 0) {
    void queryClient.invalidateQueries({ queryKey: ['quotes'] });
    void queryClient.invalidateQueries({ queryKey: ['quote-templates'] });
    void queryClient.invalidateQueries({ queryKey: ['products'] });
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offline-api-queue-updated'));
  }
  return { ok, failed };
}

export function initOfflineQueueFlushListeners(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onOnline = () => {
    void flushOfflineMutationQueue();
  };
  window.addEventListener('online', onOnline);
  return () => window.removeEventListener('online', onOnline);
}
