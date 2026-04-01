/** Assignable app routes (shown in nav / permission UI). `/team` is admin-only and not listed — gated by `isAdmin`. */
export const PAGE_OPTIONS: { path: string; label: string }[] = [
  { path: '/', label: 'Dashboard' },
  { path: '/assets', label: 'Fleet assets' },
  { path: '/pre-trips', label: 'Pre-trips' },
  { path: '/flha', label: 'FLHA' },
  { path: '/documents', label: 'Documents' },
  { path: '/equipment', label: 'Maintenance' },
  { path: '/fuel', label: 'Fuel & road' },
  { path: '/issues', label: 'Fleet issues' },
  { path: '/inventory', label: 'Inventory' },
  { path: '/tasks', label: 'Tasks' },
  { path: '/crm', label: 'Leads & CRM' },
  { path: '/time', label: 'Time tracking' },
  { path: '/requests', label: 'Requests' },
  { path: '/quotes', label: 'Quotes' },
  { path: '/jobs', label: 'Jobs' },
  { path: '/invoices', label: 'Invoices' },
  { path: '/schedule', label: 'Schedule' },
];

export const ALL_ASSIGNABLE_PATHS = PAGE_OPTIONS.map((p) => p.path);

export function normalizePath(pathname: string): string {
  const path = (pathname.split('?')[0] || '/').replace(/\/$/, '');
  return path === '' ? '/' : path;
}

/** Route access: admins may open `/team` and all assignable routes; others use `allowedPages` only. */
export function userCanAccessPath(
  pathname: string,
  user: { isAdmin: boolean; allowedPages: string[] } | null | undefined
): boolean {
  if (!user) return false;
  const path = normalizePath(pathname);
  if (path === '/account') return true;
  if (path === '/team') return user.isAdmin;
  if (user.isAdmin) return true;
  const allowed = new Set(user.allowedPages.map((p) => normalizePath(p)));
  return allowed.has(path);
}

export function normalizeAllowedPages(pages: string[]): string[] {
  const valid = new Set(ALL_ASSIGNABLE_PATHS);
  const out = [...new Set(pages.map((p) => normalizePath(p)).filter((p) => valid.has(p)))];
  return ALL_ASSIGNABLE_PATHS.filter((p) => out.includes(p));
}
