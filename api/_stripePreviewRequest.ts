/**
 * Stripe preview / Accounts v2 HTTP calls (not all exposed on the Node SDK surface).
 * Uses STRIPE_API_VERSION (e.g. 2026-02-25.clover from Workbench). No API version on the SDK client.
 */

function previewVersion(): string {
  const v = process.env.STRIPE_API_VERSION?.trim();
  if (v) return v;
  throw new Error('STRIPE_API_VERSION is required for Accounts v2 / preview API calls (set in Workbench, e.g. 2026-02-25.clover)');
}

export async function stripePreviewPost<T = unknown>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');

  const res = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Stripe-Version': previewVersion(),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Stripe preview API non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const err = parsed as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Stripe preview API ${res.status}: ${text.slice(0, 300)}`);
  }

  return parsed as T;
}
