import { useEffect, useState } from 'react';
import { User, Palette, Info, LayoutList, Eye, EyeOff, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getThemePreference, setThemePreference, type ThemePreference } from '../lib/theme';
import {
  loadSidebarPrefs,
  saveSidebarPrefs,
  resetSidebarPrefs,
  SIDEBAR_PREFS_EVENT,
} from '../lib/sidebarPrefs';
import {
  LayoutDashboard, Users, Inbox, FileText, Briefcase, Receipt, CreditCard,
  Calendar, Clock, ClipboardCheck, FolderOpen, CheckSquare,
  Truck, AlertTriangle, Fuel, Wrench, Package, UserCog,
} from 'lucide-react';

const ALL_NAV_ITEMS = [
  { name: 'Dashboard',      path: '/',          icon: LayoutDashboard },
  { name: 'Leads & CRM',    path: '/crm',        icon: Users },
  { name: 'Requests',       path: '/requests',   icon: Inbox },
  { name: 'Quotes',         path: '/quotes',     icon: FileText },
  { name: 'Jobs',           path: '/jobs',       icon: Briefcase },
  { name: 'Invoices',       path: '/invoices',   icon: Receipt },
  { name: 'Payments',       path: '/payments',   icon: CreditCard },
  { name: 'Schedule',       path: '/schedule',   icon: Calendar },
  { name: 'Time Tracking',  path: '/time',       icon: Clock },
  { name: 'Pre-trips',      path: '/pre-trips',  icon: ClipboardCheck },
  { name: 'Documents',      path: '/documents',  icon: FolderOpen },
  { name: 'Tasks (To-Do)',  path: '/tasks',      icon: CheckSquare },
  { name: 'Fleet assets',   path: '/assets',     icon: Truck },
  { name: 'Fleet issues',   path: '/issues',     icon: AlertTriangle },
  { name: 'Fuel & road',    path: '/fuel',       icon: Fuel },
  { name: 'Maintenance',    path: '/equipment',  icon: Wrench },
  { name: 'Inventory',      path: '/inventory',  icon: Package },
  { name: 'Team & access',  path: '/team',       icon: UserCog },
];

export default function Account() {
  const { currentUser, updateCurrentUserProfile } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(() => getThemePreference());

  // Sidebar prefs
  const [sidebarOrder, setSidebarOrder] = useState<string[]>(() => {
    const p = loadSidebarPrefs();
    return p.order.length > 0 ? p.order : ALL_NAV_ITEMS.map(i => i.path);
  });
  const [sidebarHidden, setSidebarHidden] = useState<string[]>(() => loadSidebarPrefs().hidden);

  // Keep local state in sync if another tab changes prefs
  useEffect(() => {
    const onPrefs = () => {
      const p = loadSidebarPrefs();
      setSidebarOrder(p.order.length > 0 ? p.order : ALL_NAV_ITEMS.map(i => i.path));
      setSidebarHidden(p.hidden);
    };
    window.addEventListener(SIDEBAR_PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(SIDEBAR_PREFS_EVENT, onPrefs);
  }, []);

  // Ordered list of items for the editor (new items not in order go at end)
  const orderedItems = [
    ...sidebarOrder.map(p => ALL_NAV_ITEMS.find(i => i.path === p)).filter(Boolean),
    ...ALL_NAV_ITEMS.filter(i => !sidebarOrder.includes(i.path)),
  ] as typeof ALL_NAV_ITEMS;

  const moveItem = (path: string, dir: -1 | 1) => {
    const currentOrder = orderedItems.map(i => i.path);
    const idx = currentOrder.indexOf(path);
    if (idx === -1) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= currentOrder.length) return;
    const next = [...currentOrder];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setSidebarOrder(next);
    saveSidebarPrefs({ order: next, hidden: sidebarHidden });
  };

  const toggleHidden = (path: string) => {
    const next = sidebarHidden.includes(path)
      ? sidebarHidden.filter(p => p !== path)
      : [...sidebarHidden, path];
    setSidebarHidden(next);
    saveSidebarPrefs({ order: sidebarOrder, hidden: next });
  };

  const handleResetSidebar = () => {
    resetSidebarPrefs();
    setSidebarOrder(ALL_NAV_ITEMS.map(i => i.path));
    setSidebarHidden([]);
  };

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

      {/* Sidebar customisation */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-1" style={{ fontSize: '1.125rem' }}>
          <h2 className="flex items-center gap-2" style={{ fontSize: '1.125rem' }}>
            <LayoutList size={20} aria-hidden /> Sidebar
          </h2>
          <button
            type="button"
            onClick={handleResetSidebar}
            className="btn btn-secondary flex items-center gap-1.5"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
          >
            <RotateCcw size={13} aria-hidden />
            Reset to default
          </button>
        </div>
        <p className="text-sm text-secondary mb-4">
          Drag items up or down to reorder. Hide pages you don't use — you can always show them again.
        </p>

        <div className="flex flex-col gap-1" style={{ maxWidth: '28rem' }}>
          {orderedItems.map((item, idx) => {
            const Icon = item.icon;
            const hidden = sidebarHidden.includes(item.path);
            return (
              <div
                key={item.path}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors"
                style={{
                  background: hidden ? 'transparent' : 'var(--surface-raised)',
                  border: '1px solid var(--border-color)',
                  opacity: hidden ? 0.45 : 1,
                }}
              >
                {/* Icon + name */}
                <Icon size={16} strokeWidth={1.75} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden />
                <span
                  className="flex-1 text-sm font-medium"
                  style={{ color: 'var(--text-primary)', textDecoration: hidden ? 'line-through' : 'none' }}
                >
                  {item.name}
                </span>

                {/* Up / Down */}
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveItem(item.path, -1)}
                    disabled={idx === 0}
                    aria-label={`Move ${item.name} up`}
                    className="rounded p-1 transition-colors hover:bg-[var(--surface-color)] disabled:opacity-20"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <ChevronUp size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(item.path, 1)}
                    disabled={idx === orderedItems.length - 1}
                    aria-label={`Move ${item.name} down`}
                    className="rounded p-1 transition-colors hover:bg-[var(--surface-color)] disabled:opacity-20"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <ChevronDown size={15} />
                  </button>
                </div>

                {/* Show / Hide toggle */}
                <button
                  type="button"
                  onClick={() => toggleHidden(item.path)}
                  aria-label={hidden ? `Show ${item.name}` : `Hide ${item.name}`}
                  className="rounded p-1 transition-colors hover:bg-[var(--surface-color)]"
                  style={{ color: hidden ? 'var(--text-muted)' : 'var(--primary-green)' }}
                >
                  {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            );
          })}
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
