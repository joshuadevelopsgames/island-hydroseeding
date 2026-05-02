import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Shown when the browser reports offline. Workspace + fleet use local queues until reconnected.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine
  );

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="mb-4 flex items-center gap-2 rounded-[var(--radius-sm)] border border-amber-500/35 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-950 dark:text-amber-100"
      role="status"
    >
      <WifiOff size={18} className="shrink-0 opacity-80" aria-hidden />
      <span>
        You&apos;re offline. Schedule, tasks, time logs, pre-trips, FLHAs, and fleet data are saved on this
        device and will sync when you&apos;re back online. Quotes and CRM still need a connection to save
        changes.
      </span>
    </div>
  );
}
