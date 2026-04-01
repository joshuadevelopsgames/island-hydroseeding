import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel Cron hook — verify Authorization: Bearer ${CRON_SECRET} if CRON_SECRET is set.
 * Use for nightly digests, deactivating expired announcements (extend in Supabase SQL or here).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== secret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ ok: true, at: new Date().toISOString(), message: 'cron placeholder — add jobs as needed' });
}
