/**
 * Shared authentication helper for Vercel API routes.
 *
 * Usage in any api/*.ts handler:
 *
 *   const auth = await requireAuth(req, res);
 *   if (!auth) return;          // response already sent (401)
 *   const { userId, isAdmin, allowedPages } = auth;
 */
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ── JWT payload decoder (no third-party deps needed in Node) ──────────────────
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64Url = token.split('.')[1];
    const base64    = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export type AuthResult = {
  userId:       string;
  email:        string;
  isAdmin:      boolean;
  allowedPages: string[];
};

/**
 * Validates the `Authorization: Bearer <token>` header.
 * Returns the decoded auth info or null (and sends 401) if invalid.
 */
export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthResult | null> {
  const authHeader = req.headers.authorization ?? '';
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return null;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.status(503).json({ error: 'Auth not configured' });
    return null;
  }

  // Use the service-role client to validate the token server-side
  const sb = createClient(url, key, { auth: { persistSession: false } });

  let user;
  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return null;
    }
    user = data.user;
  } catch (err) {
    // Network-level error reaching Supabase (ECONNREFUSED, timeout, etc.)
    res.status(503).json({ error: 'Auth service unreachable', detail: String(err) });
    return null;
  }

  // The Custom Access Token Hook embeds `app_is_admin` and `app_allowed_pages`
  const claims      = decodeJwtPayload(token);
  const isAdmin     = Boolean(claims.app_is_admin);
  const allowedPages = Array.isArray(claims.app_allowed_pages)
    ? (claims.app_allowed_pages as string[])
    : [];

  return {
    userId:       user.id,
    email:        user.email ?? '',
    isAdmin,
    allowedPages,
  };
}

/**
 * Same as requireAuth but additionally asserts the user is an admin.
 * Returns null (and sends 403) if not.
 */
export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthResult | null> {
  const auth = await requireAuth(req, res);
  if (!auth) return null;

  if (!auth.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }

  return auth;
}
