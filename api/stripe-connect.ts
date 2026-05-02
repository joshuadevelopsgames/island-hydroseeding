/**
 * Stripe Connect onboarding for the current tenant.
 *
 * Default: Accounts v1 Express (`accounts.create` + `accountLinks`).
 * Accounts v2 (blueprint): set STRIPE_CONNECT_USE_ACCOUNTS_V2=true, STRIPE_API_VERSION (Workbench preview, e.g. 2026-02-25.clover),
 * optional STRIPE_CONNECTED_ACCOUNT_DEFAULT_COUNTRY (default CA), STRIPE_SIMULATE_CONNECTED_ONBOARDING=true in test.
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
import { createOnboardingAccountLink, createUnifiedConnectedAccount } from './connectLinkedAccountV2';

function getDb() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function getStripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

function useAccountsV2(): boolean {
  return process.env.STRIPE_CONNECT_USE_ACCOUNTS_V2 === 'true';
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
      if (useAccountsV2()) {
        try {
          const country = (process.env.STRIPE_CONNECTED_ACCOUNT_DEFAULT_COUNTRY ?? 'CA').trim().toUpperCase();
          const created = await createUnifiedConnectedAccount({
            displayName: String(tenant.display_name ?? 'Workspace'),
            contactEmail: auth.email ?? '',
            tenantId,
            country,
          });
          accountId = created.id;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          res.status(502).json({
            error: msg,
            hint: 'Set STRIPE_API_VERSION to your Workbench preview (e.g. 2026-02-25.clover) and ensure Accounts v2 is enabled for your platform.',
          });
          return;
        }
      } else {
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
      }

      const { error: upErr } = await db
        .from('tenants')
        .update({ stripe_connect_account_id: accountId })
        .eq('id', tenantId);

      if (upErr) {
        res.status(500).json({ error: upErr.message });
        return;
      }
    }

    let linkUrl: string;
    let expiresAt: number | undefined;

    if (useAccountsV2()) {
      try {
        const link = await createOnboardingAccountLink({
          accountId,
          returnUrl,
          refreshUrl,
        });
        linkUrl = link.url;
        expiresAt = link.expires_at;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(502).json({ error: msg });
        return;
      }
    } else {
      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });
      linkUrl = link.url;
      expiresAt = link.expires_at;
    }

    res.status(200).json({ url: linkUrl, expires_at: expiresAt });
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
