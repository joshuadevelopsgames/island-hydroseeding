/**
 * Jobber OAuth refresh for scheduled import. Persists rotated refresh tokens on tenants.
 * Uses the same encryption key as QuickBooks (QUICKBOOKS_TOKEN_ENCRYPTION_KEY).
 */
import { createClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken } from './_quickbooksCrypto';
import { resolveTenantId } from './_tenant';

const TOKEN_URL = 'https://api.getjobber.com/api/oauth/token';

export async function getJobberAccessTokenForSync(): Promise<string> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const clientId = process.env.JOBBER_CLIENT_ID?.trim();
  const clientSecret = process.env.JOBBER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('JOBBER_CLIENT_ID and JOBBER_CLIENT_SECRET must be set for Jobber refresh');
  }

  const sb = createClient(url, key);
  const tenantId = resolveTenantId();

  const { data: row, error: selErr } = await sb
    .from('tenants')
    .select('jobber_refresh_token_encrypted')
    .eq('id', tenantId)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);

  let refreshPlain = process.env.JOBBER_REFRESH_TOKEN?.trim() ?? '';
  if (row?.jobber_refresh_token_encrypted) {
    refreshPlain = decryptToken(row.jobber_refresh_token_encrypted);
  }

  if (!refreshPlain) {
    throw new Error(
      'No Jobber refresh token: add JOBBER_REFRESH_TOKEN to Vercel env, or set tenants.jobber_refresh_token_encrypted (encrypted via QUICKBOOKS_TOKEN_ENCRYPTION_KEY)',
    );
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshPlain,
    }),
  });

  const raw = await tokenRes.text();
  if (!tokenRes.ok) {
    throw new Error(`Jobber token refresh failed: ${tokenRes.status} ${raw}`);
  }

  const body = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
  if (!body.access_token) throw new Error('Jobber token response missing access_token');

  const newRefresh = body.refresh_token ?? refreshPlain;
  const enc = encryptToken(newRefresh);

  const { error: upErr } = await sb
    .from('tenants')
    .update({ jobber_refresh_token_encrypted: enc })
    .eq('id', tenantId);

  if (upErr) throw new Error(`Failed to persist Jobber refresh token: ${upErr.message}`);

  return body.access_token;
}
