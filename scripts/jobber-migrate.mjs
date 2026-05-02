/**
 * Local CLI for Jobber → Supabase import. OAuth in browser, then runs api/_jobberImport.mjs.
 * Scheduled sync: Vercel Cron → /api/cron/jobber-sync (refresh token from DB or JOBBER_REFRESH_TOKEN).
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
  } catch { /* .env.local optional */ }
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
      res.end('<html><body><h2>✅ Authorized! You can close this tab.</h2><p>Return to your terminal to watch the migration.</p></body></html>');
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

      const { access_token, refresh_token } = await tokenRes.json();
      if (refresh_token) {
        console.log(
          '\n  Tip: save refresh token for cron — set JOBBER_REFRESH_TOKEN in Vercel or store encrypted in tenants (see api/cron/jobber-sync).\n',
        );
      }
      resolve(access_token);
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
  await runJobberImport(token);
}

main().catch(err => {
  console.error('\n❌  Migration failed:', err.message);
  process.exit(1);
});
