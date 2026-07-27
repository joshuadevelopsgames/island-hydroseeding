/**
 * Which app sections work from local storage / queues offline vs which need live API access.
 */

const OFFLINE_CAPABLE_PREFIXES = [
  '/pre-trips',
  '/flha',
  '/documents',
  '/assets',
  '/equipment',
  '/fuel',
  '/issues',
  '/inventory',
  '/schedule',
  '/time',
  '/quotes',
] as const;

const NEEDS_CONNECTION_PREFIXES = [
  // The task board reads from /api/tasks now (it used to be localStorage), so
  // it can no longer be opened offline.
  '/tasks',
  '/crm',
  '/requests',
  '/jobs',
  '/invoices',
  '/payments',
  '/team',
  '/account',
] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function matchesAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => matchesPrefix(pathname, p));
}

export type PageOfflineKind = 'offline-capable' | 'needs-connection';

/**
 * Dashboard and offline-friendly routes use local workspace / fleet / quote queues.
 * CRM, jobs, invoices, payments, team, account rely on server APIs for most actions.
 */
export function getPageOfflineKind(pathname: string): PageOfflineKind {
  const path = pathname.split('?')[0] ?? pathname;
  if (path === '/' || path === '') return 'offline-capable';
  if (matchesAny(path, [...OFFLINE_CAPABLE_PREFIXES])) return 'offline-capable';
  if (matchesAny(path, [...NEEDS_CONNECTION_PREFIXES])) return 'needs-connection';
  return 'offline-capable';
}
