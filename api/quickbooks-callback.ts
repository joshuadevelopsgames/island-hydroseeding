/**
 * QuickBooks OAuth redirect handler (no Authorization header — user returns from Intuit).
 * GET /api/quickbooks-callback?code=&state=&realmId=
 *
 * On success redirects to /account?quickbooks=connected
 * On failure redirects to /account?quickbooks=error or quickbooks=realm_taken
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { encryptToken, verifyOAuthState } from './_quickbooksCrypto';
import { INTUIT_TOKEN_URL } from './_quickbooksIntuit';

function getDb() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function accountRedirect(res: VercelResponse, query: string) {
  let origin = process.env.QUICKBOOKS_APP_ORIGIN?.trim();
  if (!origin) {
    const redir = process.env.QUICKBOOKS_REDIRECT_URI?.trim();
    if (redir) {
      try {
        origin = new URL(redir).origin;
      } catch {
        origin = '';
      }
    }
  }
  if (!origin) {
    res.status(500).send('Set QUICKBOOKS_APP_ORIGIN or a valid QUICKBOOKS_REDIRECT_URI for redirects after OAuth.');
    return;
  }
  res.redirect(302, `${origin}/account?${query}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).send('Method not allowed');
    return;
  }

  const errParam = req.query.error;
  if (errParam != null && String(errParam) !== '') {
    accountRedirect(res, `quickbooks=error`);
    return;
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  let realmId = typeof req.query.realmId === 'string' ? req.query.realmId.trim() : '';

  if (!code || !state) {
    accountRedirect(res, 'quickbooks=error');
    return;
  }

  const payload = verifyOAuthState(state);
  if (!payload) {
    accountRedirect(res, 'quickbooks=error');
    return;
  }

  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim();
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    res.status(503).send('QuickBooks OAuth is not configured.');
    return;
  }

  let accessToken: string;
  let refreshToken: string;
  let expiresIn: number;
  let refreshExpiresIn: number;

  try {
    encryptToken('probe');
  } catch {
    res.status(503).send('QUICKBOOKS_TOKEN_ENCRYPTION_KEY is missing or invalid.');
    return;
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetch(INTUIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    const tokenJson = (await tokenRes.json()) as Record<string, unknown>;
    if (!tokenRes.ok) {
      console.error('QuickBooks token exchange failed', tokenRes.status, tokenJson);
      accountRedirect(res, 'quickbooks=error');
      return;
    }

    accessToken = String(tokenJson.access_token ?? '');
    refreshToken = String(tokenJson.refresh_token ?? '');
    expiresIn = Number(tokenJson.expires_in ?? 3600);
    refreshExpiresIn = Number(tokenJson.x_refresh_token_expires_in ?? 8640000);

    if (!accessToken || !refreshToken) {
      accountRedirect(res, 'quickbooks=error');
      return;
    }

    if (!realmId && tokenJson.realmId != null) {
      realmId = String(tokenJson.realmId).trim();
    }
  } catch (e) {
    console.error('QuickBooks token exchange', e);
    accountRedirect(res, 'quickbooks=error');
    return;
  }

  if (!realmId) {
    accountRedirect(res, 'quickbooks=error');
    return;
  }

  const db = getDb();
  const tenantId = payload.tenantId;

  const { data: conflict } = await db
    .from('tenants')
    .select('id')
    .eq('quickbooks_realm_id', realmId)
    .neq('id', tenantId)
    .maybeSingle();

  if (conflict) {
    accountRedirect(res, 'quickbooks=realm_taken');
    return;
  }

  const now = Date.now();
  const accessEnc = encryptToken(accessToken);
  const refreshEnc = encryptToken(refreshToken);
  const accessExpiresAt = new Date(now + expiresIn * 1000).toISOString();
  const refreshExpiresAt = new Date(now + refreshExpiresIn * 1000).toISOString();

  const { error: upErr } = await db
    .from('tenants')
    .update({
      quickbooks_realm_id: realmId,
      quickbooks_access_token_encrypted: accessEnc,
      quickbooks_refresh_token_encrypted: refreshEnc,
      quickbooks_token_expires_at: accessExpiresAt,
      quickbooks_refresh_token_expires_at: refreshExpiresAt,
      quickbooks_connected_at: new Date().toISOString(),
    })
    .eq('id', tenantId);

  if (upErr) {
    console.error('QuickBooks tenant update', upErr);
    if (upErr.code === '23505' || upErr.message?.includes('unique')) {
      accountRedirect(res, 'quickbooks=realm_taken');
      return;
    }
    accountRedirect(res, 'quickbooks=error');
    return;
  }

  accountRedirect(res, 'quickbooks=connected');
}
