import { useLocation } from 'react-router-dom';
import { CloudOff, Loader2, RadioTower, WifiOff } from 'lucide-react';
import { getPageOfflineKind } from '@/lib/offlineRouteConfig';
import { useSyncPendingState } from '@/hooks/useSyncPendingState';

function pendingDescription(parts: { apiQueueCount: number; workspacePending: boolean; fleetPending: boolean }) {
  const bits: string[] = [];
  if (parts.apiQueueCount > 0) {
    bits.push(
      parts.apiQueueCount === 1
        ? '1 quote or template action'
        : `${parts.apiQueueCount} quote or template actions`
    );
  }
  if (parts.workspacePending) bits.push('schedule, tasks, time & documents');
  if (parts.fleetPending) bits.push('fleet & inventory');
  return bits.join(' · ');
}

/**
 * Route-aware line: pending sync on offline-friendly pages; warning on API-heavy pages when offline.
 */
export default function PageConnectionStrip() {
  const { pathname } = useLocation();
  const { isOffline, apiQueueCount, workspacePending, fleetPending, anyPending } = useSyncPendingState();
  const kind = getPageOfflineKind(pathname);

  if (kind === 'needs-connection') {
    if (!isOffline && anyPending) {
      return (
        <div
          className="mb-4 flex items-start gap-2 rounded-[var(--radius-sm)] border border-amber-500/35 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin opacity-80" aria-hidden />
          <span>
            <span className="font-medium">Background sync in progress.</span> Quotes, fleet, or workspace data is
            still uploading. This page still needs a live connection for its own lists and saves.
          </span>
        </div>
      );
    }
    if (!isOffline) return null;
    return (
      <div
        className="mb-4 flex items-start gap-2 rounded-[var(--radius-sm)] border border-rose-500/35 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-950 dark:text-rose-100"
        role="status"
      >
        <CloudOff size={18} className="mt-0.5 shrink-0 opacity-90" aria-hidden />
        <span>
          <span className="font-medium">This section needs a connection.</span> You&apos;re offline, so lists and
          saves here won&apos;t work until you&apos;re back online. Open an offline-friendly area from the menu
          (e.g. schedule, tasks, fleet, quotes) if you need to keep working.
        </span>
      </div>
    );
  }

  // offline-capable pages
  if (isOffline) {
    return (
      <div
        className="mb-4 flex items-start gap-2 rounded-[var(--radius-sm)] border border-sky-500/35 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-950 dark:text-sky-50"
        role="status"
      >
        <WifiOff size={18} className="mt-0.5 shrink-0 opacity-80" aria-hidden />
        <span>
          <span className="font-medium">Offline mode on this page.</span> Changes are saved on this device and
          sync when you reconnect.
          {anyPending && (
            <>
              {' '}
              Pending: {pendingDescription({ apiQueueCount, workspacePending, fleetPending })}.
            </>
          )}
        </span>
      </div>
    );
  }

  if (!anyPending) return null;

  return (
    <div
      className="mb-4 flex items-start gap-2 rounded-[var(--radius-sm)] border border-sky-600/30 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-950 dark:text-sky-50"
      role="status"
    >
      <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin opacity-80" aria-hidden />
      <span>
        <span className="font-medium">Updates pending sync.</span>{' '}
        {pendingDescription({ apiQueueCount, workspacePending, fleetPending })} will upload when the connection
        is ready.
        <span className="ml-1 inline-flex items-center gap-1 opacity-80" title="Waiting for server sync">
          <RadioTower size={14} aria-hidden />
        </span>
      </span>
    </div>
  );
}
