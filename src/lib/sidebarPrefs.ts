export interface SidebarPrefs {
  /** Paths in user-defined order. Empty array = use app defaults. */
  order: string[];
  /** Paths that should be hidden from the sidebar. */
  hidden: string[];
}

const STORAGE_KEY = 'ih-sidebar-prefs';
const EVENT = 'ih-sidebar-prefs-changed';

export function loadSidebarPrefs(): SidebarPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SidebarPrefs;
  } catch {}
  return { order: [], hidden: [] };
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
