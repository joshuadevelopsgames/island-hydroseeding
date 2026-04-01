import { parseISO } from 'date-fns';
import type { FleetAsset } from './fleetTypes';
import { formatInVancouver, isSameVancouverDay, vancouverNow } from './vancouverTime';

const PREFIX = 'cvipNotified:';

export function cvipNotificationSupported(): boolean {
  return typeof Notification !== 'undefined';
}

export async function requestCvipNotificationPermission(): Promise<NotificationPermission> {
  if (!cvipNotificationSupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

function notifiedKey(assetId: string, day: string) {
  return `${PREFIX}${assetId}:${day}`;
}

/**
 * When the app is open: show at most one system notification per asset per local calendar day.
 * iOS Safari only shows these reliably while the site is open or shortly after unless using Push (server).
 */
export function runCvipDueNotifications(assets: FleetAsset[], now = vancouverNow()) {
  if (!cvipNotificationSupported() || Notification.permission !== 'granted') return;

  const dayStr = formatInVancouver(now, 'yyyy-MM-dd');

  for (const a of assets) {
    if (!a.cvip.enabled || !a.cvip.nextDueDate) continue;
    let due: Date;
    try {
      due = parseISO(a.cvip.nextDueDate);
    } catch {
      continue;
    }
    if (!isSameVancouverDay(due, now)) continue;
    const k = notifiedKey(a.id, dayStr);
    if (localStorage.getItem(k)) continue;
    localStorage.setItem(k, '1');
    const name = a.unitNumber?.trim() ? `${a.name} (${a.unitNumber})` : a.name;
    try {
      new Notification('CVIP due today', {
        body: `${name} — schedule inspection.`,
        tag: `cvip-${a.id}-${dayStr}`,
      });
    } catch {
      /* ignore */
    }
  }
}
