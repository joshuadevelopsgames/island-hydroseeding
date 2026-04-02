import { useEffect, useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardCheck,
  FolderOpen,
  Wrench,
  Package,
  CheckSquare,
  Users,
  Clock,
  UserCog,
  Menu,
  X,
  Truck,
  Fuel,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  FileText,
  Calendar,
  Inbox,
  Briefcase,
  Receipt,
  CreditCard,
} from 'lucide-react';
import { formatInVancouver } from '../lib/vancouverTime';
import { useAuth } from '../context/AuthContext';
import { userCanAccessPath } from '../lib/permissions';
import { countUnacknowledgedForUser } from '../lib/taskAssignments';
import { loadAssets } from '../lib/fleetStore';
import { runCvipDueNotifications } from '../lib/cvipNotify';
import { loadSidebarPrefs, SIDEBAR_PREFS_EVENT } from '../lib/sidebarPrefs';
import FeedbackFab from './FeedbackFab';
import AnnouncementBanner from './AnnouncementBanner';
import ThemeToggle from './ThemeToggle';

function sidebarUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const primaryNavItems: { name: string; path: string; icon: typeof LayoutDashboard }[] = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Leads & CRM', path: '/crm', icon: Users },
  { name: 'Requests', path: '/requests', icon: Inbox },
  { name: 'Quotes', path: '/quotes', icon: FileText },
  { name: 'Jobs', path: '/jobs', icon: Briefcase },
  { name: 'Invoices', path: '/invoices', icon: Receipt },
  { name: 'Payments', path: '/payments', icon: CreditCard },
  { name: 'Schedule', path: '/schedule', icon: Calendar },
  { name: 'Time Tracking', path: '/time', icon: Clock },
  { name: 'Pre-trips', path: '/pre-trips', icon: ClipboardCheck },
  { name: 'Documents', path: '/documents', icon: FolderOpen },
  { name: 'Tasks (To-Do)', path: '/tasks', icon: CheckSquare },
];

/** Visited less often — collapsible in the sidebar */
const secondaryNavItems: { name: string; path: string; icon: typeof LayoutDashboard }[] = [
  { name: 'Fleet assets', path: '/assets', icon: Truck },
  { name: 'Fleet issues', path: '/issues', icon: AlertTriangle },
  { name: 'Fuel & road', path: '/fuel', icon: Fuel },
  { name: 'Maintenance', path: '/equipment', icon: Wrench },
  { name: 'Inventory', path: '/inventory', icon: Package },
  { name: 'Team & access', path: '/team', icon: UserCog },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { currentUser } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [taskInboxCount, setTaskInboxCount] = useState(0);
  const prevInboxRef = useRef<number | null>(null);

  useEffect(() => {
    const sync = () => setTaskInboxCount(countUnacknowledgedForUser(currentUser?.id ?? null));
    sync();
    const onTasks = () => sync();
    window.addEventListener('tasks-updated', onTasks);
    window.addEventListener('storage', onTasks);
    return () => {
      window.removeEventListener('tasks-updated', onTasks);
      window.removeEventListener('storage', onTasks);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    const prev = prevInboxRef.current;
    prevInboxRef.current = taskInboxCount;
    if (prev === null) return;
    if (taskInboxCount > prev) {
      new Notification('Island Hydroseeding', {
        body:
          taskInboxCount === 1
            ? 'You have a new task assignment.'
            : `You have ${taskInboxCount} tasks assigned to you.`,
        tag: 'ih-tasks-inbox',
      });
    }
  }, [taskInboxCount]);

  // Sidebar prefs (order + hidden) — reactive to changes from Account page
  const [sidebarPrefs, setSidebarPrefs] = useState(() => loadSidebarPrefs());
  useEffect(() => {
    const onPrefs = () => setSidebarPrefs(loadSidebarPrefs());
    window.addEventListener(SIDEBAR_PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(SIDEBAR_PREFS_EVENT, onPrefs);
  }, []);

  // All nav items merged
  const allNavItems = [...primaryNavItems, ...secondaryNavItems];

  // Build the rendered nav list based on prefs
  const isCustomOrder = sidebarPrefs.order.length > 0;

  const buildNavList = () => {
    const accessible = allNavItems.filter(
      (item) => currentUser && userCanAccessPath(item.path, currentUser)
    );
    const hidden = new Set(sidebarPrefs.hidden);
    if (isCustomOrder) {
      // Ordered by user prefs; items not in order go at end
      const inOrder = sidebarPrefs.order
        .map((p) => accessible.find((i) => i.path === p))
        .filter(Boolean) as typeof allNavItems;
      const rest = accessible.filter((i) => !sidebarPrefs.order.includes(i.path));
      return [...inOrder, ...rest].filter((i) => !hidden.has(i.path));
    }
    return accessible.filter((i) => !hidden.has(i.path));
  };

  const customNavList = isCustomOrder ? buildNavList() : null;

  const visiblePrimary = isCustomOrder
    ? []
    : primaryNavItems.filter(
        (item) =>
          currentUser &&
          userCanAccessPath(item.path, currentUser) &&
          !sidebarPrefs.hidden.includes(item.path)
      );
  const visibleSecondary = isCustomOrder
    ? []
    : secondaryNavItems.filter(
        (item) =>
          currentUser &&
          userCanAccessPath(item.path, currentUser) &&
          !sidebarPrefs.hidden.includes(item.path)
      );

  const [moreNavOpen, setMoreNavOpen] = useState(false);

  const isNavPathActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  useEffect(() => {
    if (!currentUser) return;
    const pathname = location.pathname;
    const secondary = secondaryNavItems.filter((item) => userCanAccessPath(item.path, currentUser));
    const onSecondary = secondary.some(
      (item) => pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path))
    );
    if (onSecondary) setMoreNavOpen(true);
  }, [location.pathname, currentUser]);

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

  useEffect(() => {
    runCvipDueNotifications(loadAssets());
    const id = window.setInterval(() => runCvipDueNotifications(loadAssets()), 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const navContent = (
    <>
      <header className="sidebar__brand">
        <div className="sidebar__brand-row">
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
          <ThemeToggle />
        </div>
      </header>

      <nav className="sidebar__nav" aria-label="Main">
        {customNavList ? (
          // Custom user-defined order — flat list, no More grouping
          customNavList.map((item) => {
            const isActive = isNavPathActive(item.path);
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
                {item.path === '/tasks' && taskInboxCount > 0 && (
                  <span className="nav-link__badge" aria-label={`${taskInboxCount} unseen task assignments`}>
                    {taskInboxCount > 99 ? '99+' : taskInboxCount}
                  </span>
                )}
              </Link>
            );
          })
        ) : (
          // Default primary + secondary (More) split
          <>
            {visiblePrimary.map((item) => {
              const isActive = isNavPathActive(item.path);
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
                  {item.path === '/tasks' && taskInboxCount > 0 && (
                    <span className="nav-link__badge" aria-label={`${taskInboxCount} unseen task assignments`}>
                      {taskInboxCount > 99 ? '99+' : taskInboxCount}
                    </span>
                  )}
                </Link>
              );
            })}

            {visibleSecondary.length > 0 && (
              <div className="sidebar__nav-more">
                <button
                  type="button"
                  className={`sidebar__nav-disclosure${visibleSecondary.some((i) => isNavPathActive(i.path)) ? ' sidebar__nav-disclosure--child-active' : ''}`}
                  aria-expanded={moreNavOpen}
                  aria-controls="sidebar-more-links"
                  id="sidebar-more-toggle"
                  onClick={() => setMoreNavOpen((o) => !o)}
                >
                  <span>More</span>
                  <ChevronDown size={18} strokeWidth={2} className={`sidebar__nav-disclosure-chevron${moreNavOpen ? ' sidebar__nav-disclosure-chevron--open' : ''}`} aria-hidden />
                </button>
                <div
                  id="sidebar-more-links"
                  role="region"
                  aria-labelledby="sidebar-more-toggle"
                  hidden={!moreNavOpen}
                  className="sidebar__nav-sub"
                >
                  {visibleSecondary.map((item) => {
                    const isActive = isNavPathActive(item.path);
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
                </div>
              </div>
            )}
          </>
        )}
      </nav>

      {currentUser && (
        <Link
          to="/account"
          className="sidebar-profile-bar"
          onClick={() => setDrawerOpen(false)}
          aria-label="Account and settings"
        >
          <span className="sidebar-profile-bar__avatar">{sidebarUserInitials(currentUser.name)}</span>
          <span className="sidebar-profile-bar__meta">
            <span className="sidebar-profile-bar__name">{currentUser.name}</span>
            <span className="sidebar-profile-bar__email">{currentUser.email}</span>
          </span>
          <ChevronRight className="sidebar-profile-bar__chevron" size={18} aria-hidden />
        </Link>
      )}

      <footer className="sidebar__footer">
        &copy; {formatInVancouver(new Date(), 'yyyy')} Island Hydroseeding Ltd
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
        <div className="mobile-topbar__end">
          <ThemeToggle />
        </div>
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
        <div className="main-content__inner">
          <AnnouncementBanner />
          {children}
        </div>
      </main>
    </div>
    <FeedbackFab />
    </>
  );
}
