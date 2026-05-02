import { useCallback, useEffect, useMemo, useState } from 'react';
import { getOfflineQueueLength } from '@/lib/offlineMutationQueue';
import { hasWorkspacePushPending } from '@/lib/cloudSync';
import { hasPendingFleetPush } from '@/lib/fleetWorkspace';

/**
 * Live counts for UI: offline status + pending uploads (API queue, workspace blob, fleet bundle).
 */
export function useSyncPendingState() {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const onOnline = () => bump();
    const onOffline = () => bump();
    const onApiQueue = () => bump();
    const onFleet = () => bump();
    const onWorkspace = () => bump();
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === 'fleet_sync_pending_v1' ||
        e.key === 'workspace_sync_pending_v1' ||
        e.key === 'offline_api_queue_v1'
      ) {
        bump();
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('offline-api-queue-updated', onApiQueue);
    window.addEventListener('fleet-sync-pending-updated', onFleet);
    window.addEventListener('workspace-sync-pending-updated', onWorkspace);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('offline-api-queue-updated', onApiQueue);
      window.removeEventListener('fleet-sync-pending-updated', onFleet);
      window.removeEventListener('workspace-sync-pending-updated', onWorkspace);
      window.removeEventListener('storage', onStorage);
    };
  }, [bump]);

  return useMemo(() => {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const apiQueueCount = getOfflineQueueLength();
    const workspacePending = hasWorkspacePushPending();
    const fleetPending = hasPendingFleetPush();
    const anyPending = apiQueueCount > 0 || workspacePending || fleetPending;
    return {
      isOffline,
      apiQueueCount,
      workspacePending,
      fleetPending,
      anyPending,
    };
  }, [version]);
}
