import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getJobberAccessTokenForSync } from '../_jobberOAuth';

/**
 * Scheduled Jobber → Supabase import. Requires:
 * - CRON_SECRET + Vercel Cron (or manual GET with Bearer secret)
 * - JOBBER_CLIENT_ID, JOBBER_CLIENT_SECRET
 * - JOBBER_REFRESH_TOKEN (first run) or tenants.jobber_refresh_token_encrypted after first success
 * - QUICKBOOKS_TOKEN_ENCRYPTION_KEY (64 hex) to encrypt stored refresh token
 * - Large accounts may exceed function duration; consider a self-hosted runner or smaller sync scope.
 */
export const config = {
  maxDuration: 900,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  res.setHeader('Content-Type', 'application/json');

  try {
    const accessToken = await getJobberAccessTokenForSync();
    const { runJobberImport } = await import('../_jobberImport.mjs');
    await runJobberImport(accessToken);
    return res.status(200).json({ ok: true, at: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[jobber-sync]', msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}
