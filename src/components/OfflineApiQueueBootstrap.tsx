import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  flushOfflineMutationQueue,
  initOfflineQueueFlushListeners,
} from '@/lib/offlineMutationQueue';

/**
 * Replays queued quote/product POSTs when the session is active and the browser is online.
 */
export default function OfflineApiQueueBootstrap() {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;
    void flushOfflineMutationQueue();
    return initOfflineQueueFlushListeners();
  }, [currentUser?.id]);

  return null;
}
