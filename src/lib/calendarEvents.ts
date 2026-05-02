/**
 * Local-first custom calendar events for the Schedule page. Persisted to
 * localStorage and synced via the workspace cloud sync. CVIP due dates and
 * jobs come from their own sources and are merged into the schedule view at
 * render time — they are not stored here.
 */

import { v4 as uuidv4 } from 'uuid';

export const CALENDAR_EVENTS_STORAGE_KEY = 'customCalendarEvents_v1';

export type CalendarEventCategory = 'general' | 'meeting' | 'maintenance' | 'reminder';

export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  /** YYYY-MM-DD (Vancouver-local). All-day events for now. */
  date: string;
  category: CalendarEventCategory;
  createdAt: string;
};

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.title === 'string' &&
    typeof o.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(o.date)
  );
}

function normalize(raw: unknown): CalendarEvent | null {
  if (!isCalendarEvent(raw)) return null;
  const o = raw as CalendarEvent;
  const cat = o.category;
  return {
    id: o.id,
    title: o.title,
    description: typeof o.description === 'string' ? o.description : '',
    date: o.date,
    category:
      cat === 'meeting' || cat === 'maintenance' || cat === 'reminder' || cat === 'general'
        ? cat
        : 'general',
    createdAt:
      typeof o.createdAt === 'string' && o.createdAt
        ? o.createdAt
        : new Date().toISOString(),
  };
}

export function loadCalendarEvents(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(CALENDAR_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalize)
      .filter((e): e is CalendarEvent => e !== null);
  } catch {
    return [];
  }
}

export function saveCalendarEvents(events: CalendarEvent[]): void {
  localStorage.setItem(CALENDAR_EVENTS_STORAGE_KEY, JSON.stringify(events));
}

export function createCalendarEvent(input: {
  title: string;
  description?: string;
  date: string;
  category?: CalendarEventCategory;
}): CalendarEvent {
  return {
    id: uuidv4(),
    title: input.title.trim(),
    description: (input.description ?? '').trim(),
    date: input.date,
    category: input.category ?? 'general',
    createdAt: new Date().toISOString(),
  };
}
