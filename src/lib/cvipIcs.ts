import { addDays, format } from 'date-fns';
import type { FleetAsset } from './fleetTypes';
import { assetDisplayName } from './fleetStore';
import { icsUtcStampFromDate, toVancouverDate } from './vancouverTime';

function escapeIcsText(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

/** Build an all-day calendar event on `dueDate` with a morning display alarm (iPhone Calendar import). */
export function buildCvipIcsEvent(asset: FleetAsset, dueDateIso: string): string {
  const v = toVancouverDate(dueDateIso);
  const day = format(v, 'yyyyMMdd');
  const uid = `cvip-${asset.id}-${day}@island-hydroseeding.local`;
  const stamp = icsUtcStampFromDate();
  const summary = escapeIcsText(`CVIP due — ${assetDisplayName(asset)}`);
  const desc = escapeIcsText(
    `Commercial Vehicle Inspection Program due.\nUnit: ${asset.unitNumber || '—'}\nDecal/cert: ${asset.cvip.certificateOrDecal || '—'}`
  );

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Island Hydroseeding//IH Ops//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${format(addDays(v, 1), 'yyyyMMdd')}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${desc}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:CVIP due today',
    'TRIGGER:PT0S',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadIcs(filename: string, icsBody: string) {
  const blob = new Blob([icsBody], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
