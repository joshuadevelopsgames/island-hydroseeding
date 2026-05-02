/**
 * Jobber → Supabase: **invoices only**
 *
 * Skips Jobber clients, quotes, and jobs — uses `crm_accounts` / `crm_properties` `jobber_id`
 * maps from Supabase and only calls Jobber’s `invoices` connection (plus line items & payments
 * in that query).
 *
 * Prerequisites: same as other importers — `SUPABASE_*`, `DEFAULT_TENANT_ID`, `JOBBER_*` in
 * `.env.local`. Accounts (and properties) should already be linked to Jobber from an earlier
 * import. Run after jobs if you are migrating in order; invoices attach by client/property.
 *
 *   node scripts/jobber-import-invoices-only.mjs
 *
 * Optional: `JOBBER_ACCESS_TOKEN=…` in env to skip the browser OAuth step.
 * If Jobber throttles, tune `JOBBER_GRAPHQL_PAGE_SIZE`, `JOBBER_PAGINATION_DELAY_MS` in
 * `.env.local` (see header in `api/_jobberImport.mjs`).
 */
import http from 'http';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { runJobberImport } from '../api/_jobberImport.mjs';

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      env[key] = val;
    }
  } catch { /* optional */ }
  return { ...process.env, ...env };
}

const env = loadEnv();
const REDIRECT_URI = 'http://localhost:3456/callback';
const JOBBER_CLIENT_ID = env.JOBBER_CLIENT_ID;
const JOBBER_CLIENT_SECRET = env.JOBBER_CLIENT_SECRET;

async function getAccessToken() {
  return new Promise((resolve, reject) => {
    const state = randomBytes(16).toString('hex');
    const authUrl =
      `https://api.getjobber.com/api/oauth/authorize` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(JOBBER_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&state=${state}`;

    console.log('\n──────────────────────────────────────────────');
    console.log('  Open this URL in your browser to authorize:');
    console.log('──────────────────────────────────────────────');
    console.log(`\n  ${authUrl}\n`);
    console.log('Waiting for authorization...\n');

    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/callback')) return;

      const url = new URL(req.url, 'http://localhost:3456');
      const code = url.searchParams.get('code');
      const retState = url.searchParams.get('state');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>✅ Authorized! You can close this tab.</h2><p>Return to your terminal.</p></body></html>');
      server.close();

      if (retState !== state) {
        reject(new Error('OAuth state mismatch — possible CSRF'));
        return;
      }
      if (!code) {
        reject(new Error('No authorization code received'));
        return;
      }

      const tokenRes = await fetch('https://api.getjobber.com/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: JOBBER_CLIENT_ID,
          client_secret: JOBBER_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          code,
        }),
      });

      if (!tokenRes.ok) {
        const txt = await tokenRes.text();
        reject(new Error(`Token exchange failed: ${tokenRes.status} ${txt}`));
        return;
      }

      const body = await tokenRes.json();
      if (!body.access_token) {
        reject(new Error('Token response missing access_token'));
        return;
      }
      resolve(body.access_token);
    });

    server.listen(3456, () => {});
    server.on('error', reject);
  });
}

async function main() {
  const missing = [];
  if (!JOBBER_CLIENT_ID) missing.push('JOBBER_CLIENT_ID');
  if (!JOBBER_CLIENT_SECRET) missing.push('JOBBER_CLIENT_SECRET');
  if (missing.length) {
    console.error('\n❌  Missing:', missing.join(', '), '\n');
    process.exit(1);
  }

  const token = env.JOBBER_ACCESS_TOKEN ?? (await getAccessToken());
  await runJobberImport(token, {
    skipClients: true,
    skipQuotes: true,
    skipJobs: true,
  });
}

main().catch(err => {
  console.error('\n❌  Import failed:', err.message);
  process.exit(1);
});
