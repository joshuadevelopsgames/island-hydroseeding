import type { VercelRequest } from '@vercel/node';

export function publicAppUrl(req: VercelRequest, pathname: string): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? '';
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${proto}://${host}${path}`;
}
