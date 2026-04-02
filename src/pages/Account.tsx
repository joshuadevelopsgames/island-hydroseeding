import { useCallback, useEffect, useRef, useState } from 'react';
import { User, Palette, Info, LayoutList, Eye, EyeOff, RotateCcw, GripVertical, LogOut } from 'lucide-react';
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
  section,
  isHidden,
  isDragOver,
  isBeingDragged,
  onToggleHidden,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onTouchPointerDown,
}: {
  path: string;
  section: Section;
  isHidden: boolean;
  isDragOver: boolean;
  isBeingDragged: boolean;
  onToggleHidden: () => void;
  // Mouse / desktop — HTML5 drag API
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  // Touch / mobile — pointer events
  onTouchPointerDown: (e: React.PointerEvent) => void;
}) {
  const item = ALL_NAV_ITEMS.find((i) => i.path === path)!;
  if (!item) return null;
  const Icon = item.icon;

  return (
    <div
      draggable
      data-drag-path={path}
      data-drag-section={section}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onPointerDown={(e) => {
        // Only intercept touch — let mouse use HTML5 drag
        if (e.pointerType === 'touch') onTouchPointerDown(e);
      }}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 select-none transition-colors"
      style={{
        background: isDragOver ? 'var(--accent-muted)' : isHidden ? 'transparent' : 'var(--surface-raised)',
        border: `1px solid ${isDragOver ? 'var(--primary-green)' : 'var(--border-color)'}`,
        opacity: isBeingDragged ? 0.35 : isHidden ? 0.45 : 1,
        cursor: 'grab',
        touchAction: 'none',
        boxShadow: isDragOver ? '0 0 0 1px var(--primary-green)' : undefined,
        transform: isBeingDragged ? 'scale(0.97)' : undefined,
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
        onPointerDown={(e) => e.stopPropagation()}
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
  const { currentUser, updateCurrentUserProfile, signOut } = useAuth();
  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [theme, setTheme]         = useState<ThemePreference>(() => getThemePreference());

  // Sidebar lists
  const initPrefs = () => {
    const p = loadSidebarPrefs(); // already deduped by loadSidebarPrefs
    const primary = resolveList(p.primary, DEFAULT_PRIMARY_PATHS);
    const primarySet = new Set(primary);
    // Secondary must never contain items already in primary
    const secondary = resolveList(
      p.secondary.filter((path) => !primarySet.has(path)),
      DEFAULT_SECONDARY_PATHS.filter((path) => !primarySet.has(path))
    );
    return { primary, secondary, hidden: p.hidden };
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

  // ── Shared drag state ────────────────────────────────────────────────────────
  const dragSrc = useRef<{ path: string; section: Section } | null>(null);
  const [dragOver, setDragOver] = useState<{ path: string; section: Section } | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);

  // Refs so async handlers (pointermove/up) always see latest list state
  const primaryListRef   = useRef(primaryList);
  const secondaryListRef = useRef(secondaryList);
  const hiddenPathsRef   = useRef(hiddenPaths);
  useEffect(() => { primaryListRef.current = primaryList; }, [primaryList]);
  useEffect(() => { secondaryListRef.current = secondaryList; }, [secondaryList]);
  useEffect(() => { hiddenPathsRef.current = hiddenPaths; }, [hiddenPaths]);

  // Keep a ref to dragOver so the pointerup closure can read the latest value
  const dragOverRef = useRef<{ path: string; section: Section } | null>(null);
  useEffect(() => { dragOverRef.current = dragOver; }, [dragOver]);

  const save = (primary: string[], secondary: string[], hidden: string[]) => {
    saveSidebarPrefs({ primary, secondary, hidden });
  };

  /** Shared commit — called by both HTML5 drop and touch pointerup */
  const commitDrop = useCallback((srcPath: string, targetPath: string, targetSection: Section) => {
    let newPrimary   = [...primaryListRef.current];
    let newSecondary = [...secondaryListRef.current];

    // Remove from BOTH lists — handles any stale prefs where item exists in both
    newPrimary   = newPrimary.filter((p) => p !== srcPath);
    newSecondary = newSecondary.filter((p) => p !== srcPath);

    const destList = targetSection === 'primary' ? newPrimary : newSecondary;
    const insertIdx = destList.indexOf(targetPath);
    destList.splice(insertIdx === -1 ? destList.length : insertIdx, 0, srcPath);

    if (targetSection === 'primary') newPrimary = destList;
    else                             newSecondary = destList;

    setPrimaryList(newPrimary);
    setSecondaryList(newSecondary);
    save(newPrimary, newSecondary, hiddenPathsRef.current);
  }, []); // eslint-disable-line

  // ── HTML5 drag (mouse / desktop) ─────────────────────────────────────────────
  const handleDragStart = (path: string, section: Section) => (e: React.DragEvent) => {
    dragSrc.current = { path, section };
    e.dataTransfer.effectAllowed = 'move';
    setDraggingPath(path);
  };

  const handleDragOver = (path: string, section: Section) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver({ path, section });
  };

  const handleDrop = (targetPath: string, targetSection: Section) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = dragSrc.current;
    if (!src || src.path === targetPath) { setDragOver(null); return; }
    commitDrop(src.path, targetPath, targetSection);
    dragSrc.current = null;
    setDraggingPath(null);
    setDragOver(null);
  };

  const handleDragEnd = () => {
    dragSrc.current = null;
    setDraggingPath(null);
    setDragOver(null);
  };

  // ── Touch / pointer-event drag (iOS + Android) ───────────────────────────────
  /** Walk up the DOM to find the nearest [data-drag-path] element */
  const findDragTarget = (el: Element | null): { path: string; section: Section } | null => {
    while (el) {
      const p = (el as HTMLElement).dataset?.dragPath;
      const s = (el as HTMLElement).dataset?.dragSection as Section | undefined;
      if (p && s) return { path: p, section: s };
      el = el.parentElement;
    }
    return null;
  };

  const handleTouchPointerDown = useCallback((path: string, section: Section) => (e: React.PointerEvent) => {
    // Only handle touch — mouse uses HTML5 drag above
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragSrc.current = { path, section };
    setDraggingPath(path);
    setDragOver(null);

    const onMove = (me: PointerEvent) => {
      me.preventDefault();
      const el = document.elementFromPoint(me.clientX, me.clientY);
      const target = findDragTarget(el);
      if (target && target.path !== dragSrc.current?.path) {
        setDragOver(target);
      } else if (!target) {
        setDragOver(null);
      }
    };

    const onUp = () => {
      const latestOver = dragOverRef.current;
      const src = dragSrc.current;
      if (latestOver && src && latestOver.path !== src.path) {
        commitDrop(src.path, latestOver.path, latestOver.section);
      }
      dragSrc.current = null;
      setDraggingPath(null);
      setDragOver(null);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
  }, [commitDrop]); // eslint-disable-line

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

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const { error } = await updateCurrentUserProfile({ name, email });
    if (error) return; // could show toast here
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2200);
  };

  const handleSignOut = async () => {
    await signOut();
    // ProtectedRoute will redirect to /login automatically
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
      >
        {list.length === 0 && (
          <div
            className="flex items-center justify-center rounded py-3 text-xs"
            style={{ color: 'var(--text-muted)', border: '1.5px dashed var(--border-color)' }}
          >
            Drag pages here
          </div>
        )}
        {list.map((path) => (
          <NavItem
            key={path}
            path={path}
            section={section}
            isHidden={hiddenPaths.includes(path)}
            isDragOver={dragOver?.path === path && dragOver?.section === section}
            isBeingDragged={draggingPath === path}
            onToggleHidden={() => toggleHidden(path)}
            onDragStart={handleDragStart(path, section)}
            onDragOver={handleDragOver(path, section)}
            onDrop={handleDrop(path, section)}
            onDragEnd={handleDragEnd}
            onTouchPointerDown={handleTouchPointerDown(path, section)}
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
          Team &amp; access. Permission changes take effect on the user&apos;s next sign-in.
        </p>
      </div>

      {/* Sign out */}
      <div className="card mt-6">
        <h2 className="mb-3 flex items-center gap-2" style={{ fontSize: '1.125rem' }}>
          <LogOut size={20} aria-hidden /> Sign out
        </h2>
        <p className="text-sm text-secondary mb-4">Sign out on this device. Your data stays saved.</p>
        <button type="button" className="btn btn-danger" onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
