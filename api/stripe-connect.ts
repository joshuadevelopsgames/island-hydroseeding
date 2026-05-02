/**
 * Stripe Connect onboarding for the current tenant (Express-style connected accounts).
 *
 * POST { action: 'create_account_link', return_url, refresh_url }
 *   Creates connected account if missing, then Account Link for onboarding.
 *
 * POST { action: 'create_login_link' }
 *   Express Dashboard login link (requires completed onboarding).
 *
 * GET  ?action=status
 *   Returns connection + capability flags for the dashboard.
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
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' });
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
  const db = getDb();
  const stripe = getStripe();

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const tenantId = resolveTenantId();

  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const action = String(req.query.action ?? 'status');
    if (action !== 'status') {
      res.status(400).json({ error: 'Unknown action' });
      return;
    }

    const { data: row, error } = await db
      .from('tenants')
      .select(
        'stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_details_submitted, stripe_connect_payouts_enabled'
      )
      .eq('id', tenantId)
      .single();

    if (error || !row) {
      res.status(500).json({ error: error?.message ?? 'Tenant not found' });
      return;
    }

    res.status(200).json({
      connected: Boolean(row.stripe_connect_account_id),
      charges_enabled: row.stripe_connect_charges_enabled,
      details_submitted: row.stripe_connect_details_submitted,
      payouts_enabled: row.stripe_connect_payouts_enabled,
      ready_for_payments: Boolean(
        row.stripe_connect_charges_enabled && row.stripe_connect_details_submitted
      ),
    });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseBody(req);
  const action = String(body.action ?? '');

  if (action === 'create_account_link') {
    const returnUrl = String(body.return_url ?? '').trim();
    const refreshUrl = String(body.refresh_url ?? '').trim();
    if (!returnUrl || !refreshUrl) {
      res.status(400).json({ error: 'return_url and refresh_url required' });
      return;
    }

    const { data: tenant, error: te } = await db
      .from('tenants')
      .select('id, stripe_connect_account_id, display_name')
      .eq('id', tenantId)
      .single();

    if (te || !tenant) {
      res.status(500).json({ error: te?.message ?? 'Tenant not found' });
      return;
    }

    let accountId = tenant.stripe_connect_account_id as string | null;

    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: 'express',
        country: 'CA',
        email: auth.email ?? undefined,
        business_profile: { name: String(tenant.display_name ?? '').slice(0, 100) || undefined },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { tenant_id: tenantId },
      });
      accountId = acct.id;

      const { error: upErr } = await db
        .from('tenants')
        .update({ stripe_connect_account_id: accountId })
        .eq('id', tenantId);

      if (upErr) {
        res.status(500).json({ error: upErr.message });
        return;
      }
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    res.status(200).json({ url: link.url, expires_at: link.expires_at });
    return;
  }

  if (action === 'create_login_link') {
    const { data: tenant, error: te } = await db
      .from('tenants')
      .select('stripe_connect_account_id')
      .eq('id', tenantId)
      .single();

    if (te || !tenant?.stripe_connect_account_id) {
      res.status(400).json({ error: 'No Stripe Connect account for this workspace' });
      return;
    }

    const login = await stripe.accounts.createLoginLink(tenant.stripe_connect_account_id as string);
    res.status(200).json({ url: login.url });
    return;
  }

  if (action === 'sync_account_status') {
    const { data: tenant, error: te } = await db
      .from('tenants')
      .select('stripe_connect_account_id')
      .eq('id', tenantId)
      .single();

    if (te || !tenant?.stripe_connect_account_id) {
      res.status(400).json({ error: 'No connected account' });
      return;
    }

    const acct = await stripe.accounts.retrieve(tenant.stripe_connect_account_id as string);
    await db
      .from('tenants')
      .update({
        stripe_connect_charges_enabled: Boolean(acct.charges_enabled),
        stripe_connect_details_submitted: Boolean(acct.details_submitted),
        stripe_connect_payouts_enabled: Boolean(acct.payouts_enabled),
      })
      .eq('id', tenantId);

    res.status(200).json({
      charges_enabled: acct.charges_enabled,
      details_submitted: acct.details_submitted,
      payouts_enabled: acct.payouts_enabled,
    });
    return;
  }

  res.status(400).json({ error: 'Unknown action' });
}
