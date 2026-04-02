import { createClient } from '@supabase/supabase-js';

// These are safe to read at module init — Vite replaces them at build time.
// If missing, the Supabase client will fail gracefully on actual requests
// rather than crashing the whole module graph on import.
const supabaseUrl  = (import.meta.env.VITE_SUPABASE_URL  as string | undefined) ?? '';
const supabaseAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export const isMisconfigured = !supabaseUrl || !supabaseAnon;

export const supabase = createClient(
  supabaseUrl  || 'https://placeholder.supabase.co',
  supabaseAnon || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/** Decode a JWT payload without verifying the signature (safe for UI use). */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}
