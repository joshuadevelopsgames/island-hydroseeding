/**
 * Authenticated fetch wrapper.
 * Automatically reads the current Supabase session and attaches
 * `Authorization: Bearer <access_token>` to every request.
 * Drop-in replacement for `fetch()` — same signature.
 */
import { supabase } from './supabase';

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}
