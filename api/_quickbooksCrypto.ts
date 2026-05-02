/**
 * QuickBooks token encryption (AES-256-GCM) and OAuth state signing.
 * Used only from Vercel serverless routes — never import from the Vite client bundle.
 */
import crypto from 'crypto';

const GCM_IV_LEN = 12;
const GCM_TAG_LEN = 16;

function getEncryptionKey(): Buffer {
  const hex = process.env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY?.trim();
  if (!hex || hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      'QUICKBOOKS_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate: openssl rand -hex 32'
    );
  }
  return Buffer.from(hex, 'hex');
}

function getStateSecret(): Buffer {
  const s = process.env.QUICKBOOKS_STATE_SECRET?.trim();
  if (s && s.length >= 32) return crypto.createHash('sha256').update(s, 'utf8').digest();
  return getEncryptionKey();
}

export function encryptToken(plain: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(GCM_IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptToken(blob: string): string {
  const key = getEncryptionKey();
  const raw = Buffer.from(blob, 'base64');
  if (raw.length < GCM_IV_LEN + GCM_TAG_LEN) throw new Error('Invalid token blob');
  const iv = raw.subarray(0, GCM_IV_LEN);
  const tag = raw.subarray(GCM_IV_LEN, GCM_IV_LEN + GCM_TAG_LEN);
  const data = raw.subarray(GCM_IV_LEN + GCM_TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export type OAuthStatePayload = { tenantId: string; exp: number };

export function signOAuthState(tenantId: string, ttlMs = 10 * 60 * 1000): string {
  const payload: OAuthStatePayload = { tenantId, exp: Date.now() + ttlMs };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getStateSecret()).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function verifyOAuthState(state: string): OAuthStatePayload | null {
  try {
    const dot = state.indexOf('.');
    if (dot < 1) return null;
    const b64 = state.slice(0, dot);
    const sig = state.slice(dot + 1);
    const expected = crypto.createHmac('sha256', getStateSecret()).update(b64).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const json = Buffer.from(b64, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as OAuthStatePayload;
    if (!payload?.tenantId || typeof payload.exp !== 'number') return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
