import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getEffectiveThemeIsDark, toggleThemeLightDark } from '../lib/theme';

export default function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(() =>
    typeof window !== 'undefined' ? getEffectiveThemeIsDark() : false
  );

  useEffect(() => {
    const sync = () => setDark(getEffectiveThemeIsDark());
    window.addEventListener('ih-theme-changed', sync);
    return () => window.removeEventListener('ih-theme-changed', sync);
  }, []);

  return (
    <button
      type="button"
      className={className ?? 'theme-toggle-btn'}
      onClick={() => toggleThemeLightDark()}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <Sun size={20} strokeWidth={1.75} aria-hidden /> : <Moon size={20} strokeWidth={1.75} aria-hidden />}
    </button>
  );
}
