/**
 * Platform SaaS subscription billed to a connected Account v2 using stripe_balance (blueprint “Charge subscriptions”).
 *
 * Requires:
 *   STRIPE_PLATFORM_SAAS_PRICE_ID — recurring Price on your platform (create in Dashboard or API).
 *   Tenant has completed Connect with Accounts v2 customer + merchant configuration.
 *
 * POST { action: 'create_platform_saas_subscription' }
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { requireAuth } from './_auth';
import { resolveTenantId } from './_tenant';

function getDb() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function getStripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseBody(req);
  const action = String(body.action ?? '');
  if (action !== 'create_platform_saas_subscription') {
    return res.status(400).json({ error: 'Unknown action' });
  }

  const priceId = process.env.STRIPE_PLATFORM_SAAS_PRICE_ID?.trim();
  if (!priceId) {
    return res.status(400).json({
      error: 'STRIPE_PLATFORM_SAAS_PRICE_ID is not set. Create a recurring Price in Stripe and add the id to your environment.',
    });
  }

  const db = getDb();
  const tenantId = resolveTenantId();
  const stripe = getStripe();

  const { data: tenant, error: te } = await db
    .from('tenants')
    .select('stripe_connect_account_id, stripe_platform_saas_subscription_id')
    .eq('id', tenantId)
    .single();

  if (te || !tenant?.stripe_connect_account_id) {
    return res.status(400).json({ error: 'Connect a Stripe account for this workspace first.' });
  }

  const acct = tenant.stripe_connect_account_id as string;

  if (tenant.stripe_platform_saas_subscription_id) {
    return res.status(200).json({
      subscription_id: tenant.stripe_platform_saas_subscription_id,
      already_exists: true,
    });
  }

  try {
    // Preview / Accounts v2 — Stripe SDK types may lag `stripe_balance` and `customer_account`.
    const setup = await stripe.setupIntents.create({
      payment_method_types: ['stripe_balance'],
      confirm: true,
      customer_account: acct,
      usage: 'off_session',
      payment_method_data: { type: 'stripe_balance' },
    } as any);

    const pmRef = setup.payment_method;
    const defaultPm =
      typeof pmRef === 'string' ? pmRef : pmRef && typeof pmRef === 'object' && 'id' in pmRef
        ? (pmRef as { id: string }).id
        : null;

    if (!defaultPm) {
      return res.status(502).json({
        error: 'SetupIntent did not return a stripe_balance payment method. Confirm Accounts v2 customer configuration and API access.',
      });
    }

    const sub = await stripe.subscriptions.create({
      customer_account: acct,
      default_payment_method: defaultPm,
      items: [{ price: priceId, quantity: 1 }],
      payment_settings: {
        payment_method_types: ['stripe_balance'],
      },
    } as any);

    await db
      .from('tenants')
      .update({ stripe_platform_saas_subscription_id: sub.id })
      .eq('id', tenantId);

    return res.status(200).json({ subscription_id: sub.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[platformSaasSubscription]', msg);
    return res.status(502).json({
      error: msg,
      hint: 'Balance-billing subscriptions require preview APIs / Accounts v2 customer setup. See Stripe blueprint and Workbench API version.',
    });
  }
}
