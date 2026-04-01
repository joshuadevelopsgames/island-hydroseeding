import { TZDate } from '@date-fns/tz';
import {
  format,
  parseISO,
  startOfDay,
  isSameDay,
  differenceInDays,
  type FormatOptions,
} from 'date-fns';

/** IANA zone for Vancouver Island (Pacific time). */
export const VANCOUVER_TZ = 'America/Vancouver';

export type VancouverDateArg = Date | string | number;

export function vancouverNow(): TZDate {
  return TZDate.tz(VANCOUVER_TZ);
}

export function toVancouverDate(instant: VancouverDateArg): TZDate {
  if (typeof instant === 'string') {
    return TZDate.tz(VANCOUVER_TZ, parseISO(instant));
  }
  if (typeof instant === 'number') {
    return TZDate.tz(VANCOUVER_TZ, instant);
  }
  return TZDate.tz(VANCOUVER_TZ, instant);
}

export function formatInVancouver(
  instant: VancouverDateArg,
  pattern: string,
  options?: FormatOptions
): string {
  return format(toVancouverDate(instant), pattern, options);
}

/**
 * HTML date input (yyyy-mm-dd) as a stable instant: noon on that calendar day in Vancouver.
 * Avoids browser-local interpretation of `T12:00:00` without offset.
 */
export function vancouverDateInputToIso(yyyyMmDd: string, noonHour = 12): string {
  const parts = yyyyMmDd.trim().split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return new Date(NaN).toISOString();
  }
  const [y, m, d] = parts;
  const z = new TZDate(y, m - 1, d, noonHour, 0, 0, VANCOUVER_TZ);
  return z.toISOString();
}

/** datetime-local value interpreted as Vancouver wall time → UTC ISO. */
export function vancouverDatetimeLocalToIso(yyyyMmDdTHhMm: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(yyyyMmDdTHhMm.trim());
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2] - 1;
  const d = +m[3];
  const h = +m[4];
  const mi = +m[5];
  const z = new TZDate(y, mo, d, h, mi, 0, 0, VANCOUVER_TZ);
  return z.toISOString();
}

export function vancouverStartOfDay(instant?: VancouverDateArg): TZDate {
  const d = instant === undefined ? vancouverNow() : toVancouverDate(instant);
  return startOfDay(d) as TZDate;
}

export function isSameVancouverDay(a: VancouverDateArg, b: VancouverDateArg): boolean {
  return isSameDay(toVancouverDate(a), toVancouverDate(b));
}

export function isVancouverToday(instant: VancouverDateArg): boolean {
  return isSameDay(toVancouverDate(instant), vancouverNow());
}

export function vancouverDifferenceInCalendarDays(
  later: VancouverDateArg,
  earlier: VancouverDateArg
): number {
  return differenceInDays(toVancouverDate(later), toVancouverDate(earlier));
}

/** For `<input type="date" defaultValue />` from a stored instant. */
export function vancouverDateInputFromIso(iso: string | null | undefined): string {
  if (!iso?.trim()) return '';
  try {
    return formatInVancouver(iso, 'yyyy-MM-dd');
  } catch {
    const t = iso.trim();
    return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : '';
  }
}

/** RFC 5545 DTSTAMP in UTC from an instant. */
export function icsUtcStampFromDate(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${mo}${day}T${h}${min}${s}Z`;
}
