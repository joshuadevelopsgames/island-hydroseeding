import { useEffect, useState } from 'react';
import { User, Palette, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getThemePreference, setThemePreference, type ThemePreference } from '../lib/theme';

export default function Account() {
  const { currentUser, updateCurrentUserProfile } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(() => getThemePreference());

  useEffect(() => {
    if (!currentUser) return;
    setName(currentUser.name);
    setEmail(currentUser.email);
  }, [currentUser]);

  useEffect(() => {
    const onTheme = () => setTheme(getThemePreference());
    window.addEventListener('ih-theme-changed', onTheme);
    return () => window.removeEventListener('ih-theme-changed', onTheme);
  }, []);

  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    updateCurrentUserProfile({ name, email });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2200);
  };

  const setAppearance = (pref: ThemePreference) => {
    setThemePreference(pref);
    setTheme(pref);
  };

  if (!currentUser) return null;

  return (
    <div>
      <p className="page-kicker">You</p>
      <h1 className="mb-2">Account &amp; settings</h1>
      <p className="text-secondary mb-8" style={{ maxWidth: '42rem' }}>
        Update how you appear in the app. Theme applies on this device only. Name and email are stored with the team roster
        (admins can also edit people on <strong>Team &amp; access</strong>).
      </p>

      <div className="card mb-6">
        <h2 className="mb-4 flex items-center gap-2" style={{ fontSize: '1.125rem' }}>
          <User size={20} aria-hidden /> Profile
        </h2>
        <form onSubmit={saveProfile} className="flex flex-col gap-4" style={{ maxWidth: '28rem' }}>
          <div>
            <label htmlFor="acct-name">Display name</label>
            <input id="acct-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label htmlFor="acct-email">Email</label>
            <input
              id="acct-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <button type="submit" className="btn btn-primary">
              Save profile
            </button>
            {savedFlash && (
              <span className="text-sm" style={{ color: 'var(--color-success)' }}>
                Saved
              </span>
            )}
          </div>
        </form>
      </div>

      <div className="card mb-6">
        <h2 className="mb-4 flex items-center gap-2" style={{ fontSize: '1.125rem' }}>
          <Palette size={20} aria-hidden /> Appearance
        </h2>
        <p className="text-sm text-secondary mb-4">Choose light, dark, or match your system setting.</p>
        <div className="account-appearance-toggle" role="group" aria-label="Color theme">
          {(
            [
              { value: 'light' as const, label: 'Light' },
              { value: 'dark' as const, label: 'Dark' },
              { value: 'system' as const, label: 'System' },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`btn ${theme === value ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAppearance(value)}
              aria-pressed={theme === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card flex gap-3" style={{ background: 'var(--surface-raised)', borderStyle: 'dashed' }}>
        <Info size={20} className="flex-shrink-0" style={{ color: 'var(--text-muted)', marginTop: '0.1rem' }} aria-hidden />
        <p className="text-sm text-secondary" style={{ margin: 0 }}>
          <strong className="text-primary">Role &amp; pages</strong> — Admins manage who can open which sections under
          Team &amp; access. Use <strong>Preview as user</strong> there to walk through the app as someone else.
        </p>
      </div>
    </div>
  );
}
