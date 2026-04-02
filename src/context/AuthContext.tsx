import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, decodeJwtPayload } from '../lib/supabase';
import { apiFetch } from '../lib/apiClient';
import { ALL_ASSIGNABLE_PATHS, normalizeAllowedPages } from '../lib/permissions';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AppUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  allowedPages: string[];
};

/** Default pages for new non-admin (field crew) users. */
export const DEFAULT_NEW_USER_PAGES = [
  '/', '/pre-trips', '/flha', '/documents', '/tasks', '/time',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build an AppUser from a Supabase session using JWT custom claims. */
function appUserFromSession(session: Session): AppUser {
  const claims = decodeJwtPayload(session.access_token);
  const meta   = session.user.user_metadata ?? {};

  const rawAllowed = claims.app_allowed_pages;
  const allowed = Array.isArray(rawAllowed)
    ? normalizeAllowedPages(rawAllowed as string[])
    : [];

  return {
    id:           session.user.id,
    email:        session.user.email ?? '',
    name:         String(meta.name ?? meta.full_name ?? session.user.email ?? ''),
    isAdmin:      Boolean(claims.app_is_admin),
    allowedPages: allowed,
  };
}

// ── Context value ─────────────────────────────────────────────────────────────

type AuthContextValue = {
  /** Raw Supabase session (null = not signed in). */
  session:     Session | null;
  /** Currently signed-in user, with permissions from JWT. */
  currentUser: AppUser | null;
  /** All app users — populated for admins; just [currentUser] for others. */
  users:       AppUser[];
  /** True while the initial session check is in flight. */
  isLoading:   boolean;

  signIn:   (email: string, password: string) => Promise<{ error: string | null }>;
  signOut:  () => Promise<void>;
  /** Reload the users list (e.g. after Team page mutations). */
  reloadUsers: () => Promise<void>;
  /** Update the current user's display name / email via Supabase Auth. */
  updateCurrentUserProfile: (updates: { name?: string; email?: string }) => Promise<{ error: string | null }>;
};

// ── Provider ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session,   setSession]   = useState<Session | null>(null);
  const [users,     setUsers]     = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  /** Fetch the full team roster (requires a valid session). */
  const fetchUsers = useCallback(async (currentSession: Session | null) => {
    if (!currentSession) { setUsers([]); return; }
    try {
      const res  = await apiFetch('/api/team?action=list');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json() as { users: AppUser[] };
      setUsers(data.users ?? []);
    } catch {
      // Fallback: just the current user (non-admins may hit 403)
      const me = appUserFromSession(currentSession);
      setUsers([me]);
    }
  }, []);

  // ── Bootstrap: listen for auth state changes ──────────────────────────────
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setIsLoading(false);
      void fetchUsers(s);
    });

    // Subscribe to future changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      void fetchUsers(s);
    });

    return () => subscription.unsubscribe();
  }, [fetchUsers]);

  // ── Auth actions ──────────────────────────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUsers([]);
  }, []);

  const reloadUsers = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    await fetchUsers(s);
  }, [fetchUsers]);

  const updateCurrentUserProfile = useCallback(
    async (updates: { name?: string; email?: string }) => {
      const patch: Parameters<typeof supabase.auth.updateUser>[0] = {};
      if (updates.email) patch.email = updates.email;
      if (updates.name)  patch.data  = { name: updates.name };
      const { error } = await supabase.auth.updateUser(patch);
      if (!error) {
        // Refresh the session so JWT claims / metadata reflect the update
        await supabase.auth.refreshSession();
      }
      return { error: error?.message ?? null };
    },
    []
  );

  // ── Derived values ────────────────────────────────────────────────────────
  const currentUser = useMemo<AppUser | null>(
    () => (session ? appUserFromSession(session) : null),
    [session]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      currentUser,
      users,
      isLoading,
      signIn,
      signOut,
      reloadUsers,
      updateCurrentUserProfile,
    }),
    [session, currentUser, users, isLoading, signIn, signOut, reloadUsers, updateCurrentUserProfile]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ── Keep these exports for pages that still reference them ───────────────────
export { ALL_ASSIGNABLE_PATHS };
