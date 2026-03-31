import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardCheck,
  ShieldAlert,
  FolderOpen,
  Wrench,
  Package,
  CheckSquare,
  Users,
  Clock,
  UserCog,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { userCanAccessPath } from '../lib/permissions';
import FeedbackFab from './FeedbackFab';

const navItems: { name: string; path: string; icon: typeof LayoutDashboard }[] = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Pre-trips', path: '/pre-trips', icon: ClipboardCheck },
  { name: 'FLHA Forms', path: '/flha', icon: ShieldAlert },
  { name: 'Documents', path: '/documents', icon: FolderOpen },
  { name: 'Equipment', path: '/equipment', icon: Wrench },
  { name: 'Inventory', path: '/inventory', icon: Package },
  { name: 'Tasks (To-Do)', path: '/tasks', icon: CheckSquare },
  { name: 'Leads & CRM', path: '/crm', icon: Users },
  { name: 'Time Tracking', path: '/time', icon: Clock },
  { name: 'Team & access', path: '/team', icon: UserCog },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { currentUser, users, setCurrentUserId } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const visibleNav = navItems.filter(
    (item) => currentUser && userCanAccessPath(item.path, currentUser)
  );

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const navContent = (
    <>
      <header className="sidebar__brand">
        <Link to="/" className="sidebar__logo-link" onClick={() => setDrawerOpen(false)}>
          <img
            src="/island-hydroseeding-logo.png"
            alt="Island Hydroseeding Ltd — Serving Vancouver Island"
            className="sidebar__logo"
            width={100}
            height={51}
            decoding="async"
          />
        </Link>
        <p className="badge badge-green sidebar__subtitle">Internal ops</p>
      </header>

      <div className="sidebar-user" style={{ padding: '0 0.75rem 0.75rem' }}>
        <label className="text-xs font-semibold text-muted" style={{ display: 'block', marginBottom: '0.35rem' }}>
          Signed in as
        </label>
        <select
          className="sidebar-user-select"
          value={currentUser?.id ?? ''}
          onChange={(e) => setCurrentUserId(e.target.value)}
          aria-label="Switch user"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
              {u.isAdmin ? ' (Admin)' : ''}
            </option>
          ))}
        </select>
      </div>

      <nav className="sidebar__nav" aria-label="Main">
        {visibleNav.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link${isActive ? ' nav-link--active' : ''}`}
              onClick={() => setDrawerOpen(false)}
            >
              <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <footer className="sidebar__footer">
        &copy; {new Date().getFullYear()} Island Hydroseeding Ltd
      </footer>
    </>
  );

  return (
    <>
    <div className="app-container">
      <header className="mobile-topbar">
        <button
          type="button"
          className="mobile-topbar__menu"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <Link to="/" className="mobile-topbar__logo-link" onClick={() => setDrawerOpen(false)}>
          <img
            src="/island-hydroseeding-logo.png"
            alt=""
            className="mobile-topbar__logo"
            width={100}
            height={51}
            decoding="async"
          />
        </Link>
        <span className="mobile-topbar__title">Internal ops</span>
      </header>

      {drawerOpen && (
        <button
          type="button"
          className="layout-backdrop"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside className={`sidebar${drawerOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar__drawer-head">
          <button
            type="button"
            className="sidebar__drawer-close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            <X size={22} />
          </button>
        </div>
        {navContent}
      </aside>

      <main className="main-content">
        <div className="main-content__inner">{children}</div>
      </main>
    </div>
    <FeedbackFab />
    </>
  );
}
