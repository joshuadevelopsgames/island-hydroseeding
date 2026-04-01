/** Theme preference persisted locally (not workspace sync). */

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ih_theme_preference';

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'system';
}

export function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  return readStored();
}

function isEffectiveDark(pref: ThemePreference): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Whether the UI is currently dark (respects system when preference is `system`). */
export function getEffectiveThemeIsDark(): boolean {
  if (typeof window === 'undefined') return false;
  return isEffectiveDark(readStored());
}

/** Flip between explicit light and dark (leaves system setting; use Account to pick system again). */
export function toggleThemeLightDark(): void {
  const next: ThemePreference = getEffectiveThemeIsDark() ? 'light' : 'dark';
  setThemePreference(next);
}

/** Apply <html class="theme-dark"> and meta theme-color. */
export function applyTheme(pref?: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const p = pref ?? readStored();
  const dark = isEffectiveDark(p);
  document.documentElement.classList.toggle('theme-dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', dark ? '#14181b' : '#b23438');
  }
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
  applyTheme(pref);
  window.dispatchEvent(new Event('ih-theme-changed'));
}

let systemListenerBound = false;

/** Call once on load; re-applies when OS appearance changes if preference is system. */
export function initTheme(): void {
  applyTheme();
  if (typeof window === 'undefined' || systemListenerBound) return;
  systemListenerBound = true;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    if (readStored() === 'system') applyTheme('system');
  });
}
