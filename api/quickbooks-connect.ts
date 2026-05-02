/**
 * QuickBooks Online OAuth — per-tenant connection (same Intuit app for all tenants).
 *
 * GET  ?action=status
 *   { connected, realm_id, connected_at }
 *
 * POST { action: 'authorize' }
 *   { authorization_url } — open in browser to complete Intuit consent
 *
 * POST { action: 'disconnect' }
 *   Revokes refresh token at Intuit (best effort) and clears stored tokens
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { decryptToken, encryptToken, signOAuthState } from './_quickbooksCrypto';
// encryptToken used for key probe in authorize; decryptToken for disconnect revoke
import { requireAuth } from './_auth';
import { resolveTenantId } from './_tenant';

const INTUIT_AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2';
const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const INTUIT_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';

/** Default: read/write accounting API */
const QBO_SCOPE = 'com.intuit.quickbooks.accounting';

function getDb() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return b as Record<string, unknown>;
}

function requireQuickBooksEnv(res: VercelResponse): boolean {
  const id = process.env.QUICKBOOKS_CLIENT_ID?.trim();
  const secret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
  const redirect = process.env.QUICKBOOKS_REDIRECT_URI?.trim();
  if (!id || !secret || !redirect) {
    res.status(503).json({
      error:
        'QuickBooks is not configured. Set QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_REDIRECT_URI.',
    });
    return false;
  }
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getDb();

  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const action = String(req.query.action ?? 'status');
    if (action !== 'status') {
      res.status(400).json({ error: 'Unknown action' });
      return;
    }

    const auth = await requireAuth(req, res);
    if (!auth) return;

    const tenantId = resolveTenantId();

    const { data: row, error } = await db
      .from('tenants')
      .select('quickbooks_realm_id, quickbooks_connected_at')
      .eq('id', tenantId)
      .single();

    if (error || !row) {
      res.status(500).json({ error: error?.message ?? 'Tenant not found' });
      return;
    }

    res.status(200).json({
      connected: Boolean(row.quickbooks_realm_id),
      realm_id: row.quickbooks_realm_id ?? null,
      connected_at: row.quickbooks_connected_at ?? null,
    });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (!requireQuickBooksEnv(res)) return;

  const tenantId = resolveTenantId();
  const body = parseBody(req);
  const action = String(body.action ?? '');

  if (action === 'authorize') {
    let encryptionOk = true;
    try {
      encryptToken('probe');
    } catch {
      encryptionOk = false;
    }
    if (!encryptionOk) {
      res.status(503).json({
        error:
          'Set QUICKBOOKS_TOKEN_ENCRYPTION_KEY (64 hex chars). Optional: QUICKBOOKS_STATE_SECRET for OAuth state signing.',
      });
      return;
    }

    const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI!.trim();
    const clientId = process.env.QUICKBOOKS_CLIENT_ID!.trim();
    const state = signOAuthState(tenantId);

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: QBO_SCOPE,
      redirect_uri: redirectUri,
      state,
    });

    const authorization_url = `${INTUIT_AUTH_BASE}?${params.toString()}`;
    res.status(200).json({ authorization_url });
    return;
  }

  if (action === 'disconnect') {
    const { data: tenant, error: te } = await db
      .from('tenants')
      .select(
        'quickbooks_refresh_token_encrypted'
      )
      .eq('id', tenantId)
      .single();

    if (te || !tenant) {
      res.status(500).json({ error: te?.message ?? 'Tenant not found' });
      return;
    }

    const encRefresh = tenant.quickbooks_refresh_token_encrypted as string | null;
    if (encRefresh) {
      try {
        const refresh = decryptToken(encRefresh);
        const cid = process.env.QUICKBOOKS_CLIENT_ID!;
        const sec = process.env.QUICKBOOKS_CLIENT_SECRET!;
        const basic = Buffer.from(`${cid}:${sec}`).toString('base64');
        await fetch(INTUIT_REVOKE_URL, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: new URLSearchParams({ token: refresh }).toString(),
        });
      } catch {
        /* best-effort revoke */
      }
    }

    const { error: upErr } = await db
      .from('tenants')
      .update({
        quickbooks_realm_id: null,
        quickbooks_access_token_encrypted: null,
        quickbooks_refresh_token_encrypted: null,
        quickbooks_token_expires_at: null,
        quickbooks_refresh_token_expires_at: null,
        quickbooks_connected_at: null,
      })
      .eq('id', tenantId);

    if (upErr) {
      res.status(500).json({ error: upErr.message });
      return;
    }

    res.status(200).json({ disconnected: true });
    return;
  }

  res.status(400).json({ error: 'Unknown action' });
}

/** Exported for quickbooks-callback and future QBO API routes */
export { INTUIT_TOKEN_URL, QBO_SCOPE };
