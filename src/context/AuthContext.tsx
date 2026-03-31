import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { requestCloudPush } from '../lib/cloudSync';
import { ALL_ASSIGNABLE_PATHS, normalizeAllowedPages } from '../lib/permissions';

export type AppUser = {
  id: string;
  name: string;
  email: string;
  /** Can open Team & manage users; full access to all assignable pages. */
  isAdmin: boolean;
  /** Paths from `PAGE_OPTIONS`; ignored for route checks when `isAdmin` (except `/team` still needs admin). */
  allowedPages: string[];
};

const USERS_KEY = 'appUsers';
const CURRENT_KEY = 'currentUserId';

/** Default pages for new non-admin users (field-style). */
const DEFAULT_NEW_USER_PAGES = ['/', '/pre-trips', '/flha', '/documents', '/tasks', '/time'];

const SEED_USERS: AppUser[] = [
  {
    id: 'u-admin',
    name: 'Administrator',
    email: 'office@islandhydroseeding.com',
    isAdmin: true,
    allowedPages: ALL_ASSIGNABLE_PATHS,
  },
  {
    id: 'u-supervisor',
    name: 'Site supervisor',
    email: 'supervisor@islandhydroseeding.com',
    isAdmin: false,
    allowedPages: ALL_ASSIGNABLE_PATHS,
  },
  {
    id: 'u-field',
    name: 'Field crew',
    email: 'crew@islandhydroseeding.com',
    isAdmin: false,
    allowedPages: DEFAULT_NEW_USER_PAGES,
  },
];

type LegacyRole = 'admin' | 'supervisor' | 'field';

function migrateRawUser(raw: Record<string, unknown>): AppUser {
  const id = String(raw.id ?? '');
  const name = String(raw.name ?? '');
  const email = String(raw.email ?? '');

  if (Array.isArray(raw.allowedPages)) {
    return {
      id,
      name,
      email,
      isAdmin: Boolean(raw.isAdmin),
      allowedPages: normalizeAllowedPages(raw.allowedPages as string[]),
    };
  }

  const role = raw.role as LegacyRole | undefined;
  if (role === 'admin') {
    return { id, name, email, isAdmin: true, allowedPages: [...ALL_ASSIGNABLE_PATHS] };
  }
  if (role === 'supervisor') {
    return { id, name, email, isAdmin: false, allowedPages: [...ALL_ASSIGNABLE_PATHS] };
  }
  return {
    id,
    name,
    email,
    isAdmin: false,
    allowedPages: [...DEFAULT_NEW_USER_PAGES],
  };
}

function readUsers(): AppUser[] {
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) {
    localStorage.setItem(USERS_KEY, JSON.stringify(SEED_USERS));
    return SEED_USERS;
  }
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed) || parsed.length === 0) return SEED_USERS;
    return parsed.map((row) => migrateRawUser(row as Record<string, unknown>));
  } catch {
    return SEED_USERS;
  }
}

function getInitialSession(): { users: AppUser[]; currentUserId: string | null } {
  const users = readUsers();
  let id = localStorage.getItem(CURRENT_KEY);
  if (!id || !users.some((u) => u.id === id)) {
    id = users[0]?.id ?? null;
    if (id) localStorage.setItem(CURRENT_KEY, id);
  }
  return { users, currentUserId: id };
}

type AuthContextValue = {
  users: AppUser[];
  currentUser: AppUser | null;
  setCurrentUserId: (id: string) => void;
  saveUsers: (next: AppUser[]) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const init = getInitialSession();
  const [users, setUsers] = useState<AppUser[]>(init.users);
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(init.currentUserId);

  useEffect(() => {
    requestCloudPush();
  }, []);

  const setCurrentUserId = useCallback((id: string) => {
    setCurrentUserIdState(id);
    localStorage.setItem(CURRENT_KEY, id);
    window.dispatchEvent(new Event('auth-changed'));
  }, []);

  const saveUsers = useCallback((next: AppUser[]) => {
    setUsers(next);
    localStorage.setItem(USERS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('auth-changed'));
  }, []);

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId]
  );

  const value = useMemo(
    () => ({
      users,
      currentUser,
      setCurrentUserId,
      saveUsers,
    }),
    [users, currentUser, setCurrentUserId, saveUsers]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export { DEFAULT_NEW_USER_PAGES };
