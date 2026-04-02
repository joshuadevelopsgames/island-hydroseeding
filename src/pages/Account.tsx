import { useEffect, useRef, useState } from 'react';
import { User, Palette, Info, LayoutList, Eye, EyeOff, RotateCcw, GripVertical } from 'lucide-react';
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

// ── nav item catalogue ────────────────────────────────────────────────────────

const DEFAULT_PRIMARY_PATHS = ['/', '/crm', '/requests', '/quotes', '/jobs', '/invoices', '/payments', '/schedule', '/time', '/pre-trips', '/documents', '/tasks'];
const DEFAULT_SECONDARY_PATHS = ['/assets', '/issues', '/fuel', '/equipment', '/inventory', '/team'];

const ALL_NAV_ITEMS = [
  { name: 'Dashboard',     path: '/',           icon: LayoutDashboard },
  { name: 'Leads & CRM',   path: '/crm',        icon: Users },
  { name: 'Requests',      path: '/requests',   icon: Inbox },
  { name: 'Quotes',        path: '/quotes',     icon: FileText },
  { name: 'Jobs',          path: '/jobs',       icon: Briefcase },
  { name: 'Invoices',      path: '/invoices',   icon: Receipt },
  { name: 'Payments',      path: '/payments',   icon: CreditCard },
  { name: 'Schedule',      path: '/schedule',   icon: Calendar },
  { name: 'Time Tracking', path: '/time',       icon: Clock },
  { name: 'Pre-trips',     path: '/pre-trips',  icon: ClipboardCheck },
  { name: 'Documents',     path: '/documents',  icon: FolderOpen },
  { name: 'Tasks (To-Do)', path: '/tasks',      icon: CheckSquare },
  { name: 'Fleet assets',  path: '/assets',     icon: Truck },
  { name: 'Fleet issues',  path: '/issues',     icon: AlertTriangle },
  { name: 'Fuel & road',   path: '/fuel',       icon: Fuel },
  { name: 'Maintenance',   path: '/equipment',  icon: Wrench },
  { name: 'Inventory',     path: '/inventory',  icon: Package },
  { name: 'Team & access', path: '/team',       icon: UserCog },
];

type Section = 'primary' | 'secondary';

// ── helpers ───────────────────────────────────────────────────────────────────

function resolveList(paths: string[], defaults: string[]) {
  const base = paths.length > 0 ? paths : defaults;
  // Ensure any new items not yet in the list are appended
  const extra = defaults.filter((p) => !base.includes(p));
  return [...base, ...extra];
}

// ── sidebar editor ─────────────────────────────────────────────────────────────

function NavItem({
  path,
  isHidden,
  isDragOver,
  onToggleHidden,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  path: string;
  isHidden: boolean;
  isDragOver: boolean;
  onToggleHidden: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const item = ALL_NAV_ITEMS.find((i) => i.path === path)!;
  if (!item) return null;
  const Icon = item.icon;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 select-none transition-colors"
      style={{
        background: isDragOver ? 'var(--accent-muted)' : isHidden ? 'transparent' : 'var(--surface-raised)',
        border: `1px solid ${isDragOver ? 'var(--primary-green)' : 'var(--border-color)'}`,
        opacity: isHidden ? 0.45 : 1,
        cursor: 'grab',
        boxShadow: isDragOver ? '0 0 0 1px var(--primary-green)' : undefined,
      }}
    >
      <GripVertical size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden />
      <Icon size={15} strokeWidth={1.75} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden />
      <span
        className="flex-1 text-sm font-medium"
        style={{ color: 'var(--text-primary)', textDecoration: isHidden ? 'line-through' : 'none' }}
      >
        {item.name}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleHidden(); }}
        aria-label={isHidden ? `Show ${item.name}` : `Hide ${item.name}`}
        className="rounded p-1 transition-colors"
        style={{ color: isHidden ? 'var(--text-muted)' : 'var(--primary-green)' }}
      >
        {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Account() {
  const { currentUser, updateCurrentUserProfile } = useAuth();
  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [theme, setTheme]         = useState<ThemePreference>(() => getThemePreference());

  // Sidebar lists
  const initPrefs = () => {
    const p = loadSidebarPrefs();
    return {
      primary:   resolveList(p.primary,   DEFAULT_PRIMARY_PATHS),
      secondary: resolveList(p.secondary, DEFAULT_SECONDARY_PATHS),
      hidden:    p.hidden,
    };
  };
  const [primaryList,   setPrimaryList]   = useState(() => initPrefs().primary);
  const [secondaryList, setSecondaryList] = useState(() => initPrefs().secondary);
  const [hiddenPaths,   setHiddenPaths]   = useState(() => initPrefs().hidden);

  // Sync from other tabs
  useEffect(() => {
    const onPrefs = () => {
      const { primary, secondary, hidden } = initPrefs();
      setPrimaryList(primary);
      setSecondaryList(secondary);
      setHiddenPaths(hidden);
    };
    window.addEventListener(SIDEBAR_PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(SIDEBAR_PREFS_EVENT, onPrefs);
  }, []); // eslint-disable-line

  // Drag state
  const dragSrc = useRef<{ path: string; section: Section } | null>(null);
  const [dragOver, setDragOver] = useState<{ path: string | '__end__'; section: Section } | null>(null);

  const save = (primary: string[], secondary: string[], hidden: string[]) => {
    saveSidebarPrefs({ primary, secondary, hidden });
  };

  const handleDragStart = (path: string, section: Section) => (e: React.DragEvent) => {
    dragSrc.current = { path, section };
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (path: string, section: Section) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver({ path, section });
  };

  const handleDrop = (targetPath: string | '__end__', targetSection: Section) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragSrc.current;
    if (!src || src.path === targetPath) { setDragOver(null); return; }

    let newPrimary   = [...primaryList];
    let newSecondary = [...secondaryList];

    // Remove from source section
    if (src.section === 'primary')   newPrimary   = newPrimary.filter((p) => p !== src.path);
    else                             newSecondary = newSecondary.filter((p) => p !== src.path);

    // Insert into dest section at target position
    const destList = targetSection === 'primary' ? newPrimary : newSecondary;
    const insertIdx = targetPath === '__end__'
      ? destList.length
      : destList.indexOf(targetPath);
    destList.splice(insertIdx === -1 ? destList.length : insertIdx, 0, src.path);

    if (targetSection === 'primary') newPrimary = destList;
    else                             newSecondary = destList;

    setPrimaryList(newPrimary);
    setSecondaryList(newSecondary);
    save(newPrimary, newSecondary, hiddenPaths);
    dragSrc.current = null;
    setDragOver(null);
  };

  const handleDragEnd = () => {
    dragSrc.current = null;
    setDragOver(null);
  };

  const toggleHidden = (path: string, newPrimary = primaryList, newSecondary = secondaryList) => {
    const next = hiddenPaths.includes(path)
      ? hiddenPaths.filter((p) => p !== path)
      : [...hiddenPaths, path];
    setHiddenPaths(next);
    save(newPrimary, newSecondary, next);
  };

  const handleReset = () => {
    resetSidebarPrefs();
    const { primary, secondary, hidden } = initPrefs();
    setPrimaryList(primary);
    setSecondaryList(secondary);
    setHiddenPaths(hidden);
  };

  // Profile
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

  // Zone renderer
  const renderZone = (
    label: string,
    description: string,
    list: string[],
    section: Section
  ) => (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>{description}</p>
      <div
        className="flex flex-col gap-1 rounded-lg p-1.5 min-h-12"
        style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)' }}
        onDragOver={(e) => { e.preventDefault(); setDragOver({ path: '__end__', section }); }}
        onDrop={handleDrop('__end__', section)}
      >
        {list.length === 0 && (
          <div
            className="flex items-center justify-center rounded py-3 text-xs"
            style={{ color: 'var(--text-muted)', border: '1.5px dashed var(--border-color)' }}
          >
            Drop pages here
          </div>
        )}
        {list.map((path) => (
          <NavItem
            key={path}
            path={path}
            isHidden={hiddenPaths.includes(path)}
            isDragOver={dragOver?.path === path && dragOver?.section === section}
            onToggleHidden={() => toggleHidden(path)}
            onDragStart={handleDragStart(path, section)}
            onDragOver={handleDragOver(path, section)}
            onDrop={handleDrop(path, section)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <p className="page-kicker">You</p>
      <h1 className="mb-2">Account &amp; settings</h1>
      <p className="text-secondary mb-8" style={{ maxWidth: '42rem' }}>
        Update how you appear in the app. Theme applies on this device only. Name and email are stored with the team roster
        (admins can also edit people on <strong>Team &amp; access</strong>).
      </p>

      {/* Profile */}
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
            <input id="acct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <button type="submit" className="btn btn-primary">Save profile</button>
            {savedFlash && (
              <span className="text-sm" style={{ color: 'var(--color-success)' }}>Saved</span>
            )}
          </div>
        </form>
      </div>

      {/* Appearance */}
      <div className="card mb-6">
        <h2 className="mb-4 flex items-center gap-2" style={{ fontSize: '1.125rem' }}>
          <Palette size={20} aria-hidden /> Appearance
        </h2>
        <p className="text-sm text-secondary mb-4">Choose light, dark, or match your system setting.</p>
        <div className="account-appearance-toggle" role="group" aria-label="Color theme">
          {([
            { value: 'light' as const, label: 'Light' },
            { value: 'dark' as const, label: 'Dark' },
            { value: 'system' as const, label: 'System' },
          ] as const).map(({ value, label }) => (
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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2" style={{ fontSize: '1.125rem' }}>
            <LayoutList size={20} aria-hidden /> Sidebar
          </h2>
          <button
            type="button"
            onClick={handleReset}
            className="btn btn-secondary flex items-center gap-1.5"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
          >
            <RotateCcw size={13} aria-hidden />
            Reset to default
          </button>
        </div>
        <p className="text-sm text-secondary mb-5">
          Drag pages between sections to reorder or move them into the collapsible <strong>More</strong> menu.
          Toggle the eye icon to show or hide a page entirely.
        </p>

        <div className="flex flex-col gap-5" style={{ maxWidth: '30rem' }}>
          {renderZone(
            'Main navigation',
            'Always visible in the sidebar.',
            primaryList,
            'primary'
          )}
          {renderZone(
            'More (collapsible)',
            'Tucked under the expandable "More" section.',
            secondaryList,
            'secondary'
          )}
        </div>
      </div>

      {/* Info */}
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
