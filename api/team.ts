/**
 * /api/team — Admin user management
 *
 * GET  ?action=list              → list all users + permissions (admin) or just self (non-admin)
 * POST { action: 'user.invite'   email, name, isAdmin, allowedPages }
 * POST { action: 'user.delete',  userId }
 * POST { action: 'user.update',  userId, name, email }
 * POST { action: 'permissions.update', userId, isAdmin, allowedPages }
 */
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth, requireAdmin } from './_auth';

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') { try { return JSON.parse(b) as Record<string, unknown>; } catch { return {}; } }
  return b as Record<string, unknown>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  const db = adminClient();
  if (!db) { res.status(503).json({ error: 'Supabase not configured' }); return; }

  // ── GET list ───────────────────────────────────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'list') {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    if (auth.isAdmin) {
      // Admins see all users with permissions
      const { data: { users: authUsers }, error: listErr } =
        await db.auth.admin.listUsers({ perPage: 500 });
      if (listErr) { res.status(500).json({ error: listErr.message }); return; }

      const { data: permsRows } = await db
        .from('user_permissions')
        .select('user_id, is_admin, allowed_pages');

      const permsMap = new Map(
        (permsRows ?? []).map((p: { user_id: string; is_admin: boolean; allowed_pages: string[] }) =>
          [p.user_id, p]
        )
      );

      const users = authUsers.map((u) => {
        const perms = permsMap.get(u.id);
        return {
          id:           u.id,
          email:        u.email ?? '',
          name:         String(u.user_metadata?.name ?? u.user_metadata?.full_name ?? u.email ?? ''),
          isAdmin:      perms?.is_admin ?? false,
          allowedPages: perms?.allowed_pages ?? [],
        };
      });

      res.status(200).json({ users });
    } else {
      // Non-admins only see themselves
      res.status(200).json({
        users: [{
          id:           auth.userId,
          email:        auth.email,
          name:         '',        // populated client-side from session
          isAdmin:      false,
          allowedPages: auth.allowedPages,
        }],
      });
    }
    return;
  }

  // ── POST mutations (admin only) ────────────────────────────────────────────
  if (req.method === 'POST') {
    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const body   = parseBody(req);
    const action = String(body.action ?? '');

    // user.invite ─────────────────────────────────────────────────────────────
    if (action === 'user.invite') {
      const email       = String(body.email ?? '').trim();
      const name        = String(body.name  ?? '').trim();
      const isAdmin     = Boolean(body.isAdmin);
      const allowedPages = Array.isArray(body.allowedPages)
        ? (body.allowedPages as string[])
        : [];

      if (!email) { res.status(400).json({ error: 'email is required' }); return; }

      // Create the user with a temporary password they'll need to reset
      const tempPassword = Math.random().toString(36).slice(2, 12) +
                           Math.random().toString(36).slice(2, 12).toUpperCase() + '!1';

      const { data: created, error: createErr } = await db.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name: name || email },
      });
      if (createErr) { res.status(500).json({ error: createErr.message }); return; }

      // Insert permissions row
      const { error: permErr } = await db.from('user_permissions').insert({
        user_id:       created.user.id,
        is_admin:      isAdmin,
        allowed_pages: allowedPages,
        updated_at:    new Date().toISOString(),
      });
      if (permErr) { res.status(500).json({ error: permErr.message }); return; }

      res.status(200).json({
        user: {
          id:           created.user.id,
          email:        created.user.email ?? '',
          name:         name || email,
          isAdmin,
          allowedPages,
        },
        tempPassword,   // return to admin so they can share it with the new user
      });
      return;
    }

    // user.delete ─────────────────────────────────────────────────────────────
    if (action === 'user.delete') {
      const userId = String(body.userId ?? '');
      if (!userId) { res.status(400).json({ error: 'userId is required' }); return; }
      if (userId === auth.userId) {
        res.status(400).json({ error: 'You cannot delete your own account' });
        return;
      }
      const { error } = await db.auth.admin.deleteUser(userId);
      if (error) { res.status(500).json({ error: error.message }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    // user.update ─────────────────────────────────────────────────────────────
    if (action === 'user.update') {
      const userId = String(body.userId ?? '');
      if (!userId) { res.status(400).json({ error: 'userId is required' }); return; }

      const update: { email?: string; user_metadata?: { name: string } } = {};
      if (body.email) update.email         = String(body.email).trim();
      if (body.name)  update.user_metadata = { name: String(body.name).trim() };

      const { error } = await db.auth.admin.updateUserById(userId, update);
      if (error) { res.status(500).json({ error: error.message }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    // permissions.update ──────────────────────────────────────────────────────
    if (action === 'permissions.update') {
      const userId      = String(body.userId ?? '');
      const isAdmin     = Boolean(body.isAdmin);
      const allowedPages = Array.isArray(body.allowedPages)
        ? (body.allowedPages as string[])
        : [];

      if (!userId) { res.status(400).json({ error: 'userId is required' }); return; }

      const { error } = await db.from('user_permissions').upsert({
        user_id:       userId,
        is_admin:      isAdmin,
        allowed_pages: allowedPages,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (error) { res.status(500).json({ error: error.message }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: `Unknown action: ${action}` });
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).json({ error: 'Method not allowed' });
}
