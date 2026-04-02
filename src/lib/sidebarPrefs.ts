export interface SidebarPrefs {
  /** Paths in the primary (always-visible) nav, in order. Empty = use app defaults. */
  primary: string[];
  /** Paths in the collapsible "More" section, in order. Empty = use app defaults. */
  secondary: string[];
  /** Paths that are hidden entirely from the sidebar. */
  hidden: string[];
}

const STORAGE_KEY = 'ih-sidebar-prefs';
const EVENT = 'ih-sidebar-prefs-changed';

export function loadSidebarPrefs(): SidebarPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SidebarPrefs> & { order?: string[] };
      // Migrate old `order` field to `primary`
      if (parsed.order && !parsed.primary) {
        return { primary: parsed.order, secondary: [], hidden: parsed.hidden ?? [] };
      }
      const primary = parsed.primary ?? [];
      const primarySet = new Set(primary);
      // Deduplicate: remove from secondary anything already in primary
      const secondary = (parsed.secondary ?? []).filter((p) => !primarySet.has(p));
      return { primary, secondary, hidden: parsed.hidden ?? [] };
    }
  } catch {}
  return { primary: [], secondary: [], hidden: [] };
}

export function saveSidebarPrefs(prefs: SidebarPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event(EVENT));
}

export function resetSidebarPrefs(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(EVENT));
}

export const SIDEBAR_PREFS_EVENT = EVENT;
