/**
 * Public quote view + client approval (token in URL). No auth — token is the credential.
 *
 * GET  ?token=<approval_token>
 * POST { action: 'approve' | 'setup_intent', token }
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { insertCommLog } from './_commLogServer';

function getDb(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
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

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const NOW_ISO = () => new Date().toISOString();

const APPROVABLE_STATUSES = new Set(['Sent', 'Awaiting Response', 'Changes Requested']);

async function accountHasPaymentMethod(
  stripe: Stripe,
  customerId: string,
  stripeAccount: string | null
): Promise<boolean> {
  const opts = stripeAccount ? { stripeAccount } : undefined;
  try {
    const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card' }, opts);
    return (list.data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getDb();

  try {
    if (req.method === 'GET') {
      const token = String(req.query.token ?? '').trim();
      if (!token) return res.status(400).json({ error: 'token required' });

      const { data: quote, error } = await db.from('quotes').select('*').eq('approval_token', token).maybeSingle();
      if (error || !quote) return res.status(404).json({ error: 'Quote not found' });

      const tid = quote.tenant_id as string;
      const qid = quote.id as string;

      const { data: line_items } = await db
        .from('quote_line_items')
        .select('*')
        .eq('quote_id', qid)
        .eq('tenant_id', tid)
        .order('sort_order', { ascending: true });

      const { data: tenantRow } = await db
        .from('tenants')
        .select(
          'display_name, public_tagline, public_brand_logo_url, public_etransfer_email, public_gst_registration, public_footer_note'
        )
        .eq('id', tid)
        .single();

      let account: Record<string, unknown> | null = null;
      if (quote.account_id) {
        const { data: acc } = await db
          .from('crm_accounts')
          .select('id, name, company, phone, email, stripe_customer_id')
          .eq('id', quote.account_id)
          .eq('tenant_id', tid)
          .maybeSingle();
        account = acc;
      }

      let property = null;
      if (quote.property_id) {
        const { data: prop } = await db
          .from('crm_properties')
          .select('address, city, province, postal_code')
          .eq('id', quote.property_id)
          .eq('tenant_id', tid)
          .maybeSingle();
        property = prop;
      }

      const { data: tenantStripe } = await db
        .from('tenants')
        .select('stripe_connect_account_id, stripe_connect_charges_enabled')
        .eq('id', tid)
        .single();

      const connectedId = (tenantStripe?.stripe_connect_account_id as string | null) ?? null;
      const connectOk = Boolean(connectedId && tenantStripe?.stripe_connect_charges_enabled);
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      const requirePm = Boolean(quote.require_payment_method_on_file);
      const pmEnforcement = requirePm && Boolean(stripeKey) && connectOk;

      let has_payment_method = false;
      const custId = account?.stripe_customer_id as string | undefined;
      if (pmEnforcement && custId && stripeKey) {
        const stripe = new Stripe(stripeKey);
        has_payment_method = await accountHasPaymentMethod(stripe, custId, connectOk ? connectedId : null);
      }

      const publishable =
        process.env.STRIPE_PUBLISHABLE_KEY || process.env.VITE_STRIPE_PUBLISHABLE_KEY || null;

      return res.status(200).json({
        quote,
        line_items: line_items ?? [],
        account,
        property,
        branding: tenantRow ?? null,
        has_payment_method,
        payment_setup_available: pmEnforcement,
        stripe_publishable_key: publishable,
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = parseBody(req);
    const action = String(body.action ?? '');
    const token = String(body.token ?? '').trim();
    if (!token) return res.status(400).json({ error: 'token required' });

    const { data: quote, error: qErr } = await db.from('quotes').select('*').eq('approval_token', token).maybeSingle();
    if (qErr || !quote) return res.status(404).json({ error: 'Quote not found' });

    const tid = quote.tenant_id as string;
    const qid = quote.id as string;

    if (action === 'approve') {
      if (!APPROVABLE_STATUSES.has(String(quote.status))) {
        return res.status(400).json({ error: 'This quote cannot be approved in its current state.' });
      }

      const { data: tenantStripe } = await db
        .from('tenants')
        .select('stripe_connect_account_id, stripe_connect_charges_enabled')
        .eq('id', tid)
        .single();

      const connectedId = (tenantStripe?.stripe_connect_account_id as string | null) ?? null;
      const connectOk = Boolean(connectedId && tenantStripe?.stripe_connect_charges_enabled);
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      const requirePm = Boolean(quote.require_payment_method_on_file);
      const pmEnforcement = requirePm && Boolean(stripeKey) && connectOk;

      if (pmEnforcement && quote.account_id) {
        const { data: acc } = await db
          .from('crm_accounts')
          .select('stripe_customer_id')
          .eq('id', quote.account_id)
          .eq('tenant_id', tid)
          .maybeSingle();
        const custId = acc?.stripe_customer_id as string | undefined;
        if (!custId) {
          return res.status(400).json({ error: 'needs_payment_method', message: 'Add a card on file before approving.' });
        }
        const stripe = new Stripe(stripeKey!);
        const ok = await accountHasPaymentMethod(stripe, custId, connectOk ? connectedId : null);
        if (!ok) {
          return res.status(400).json({ error: 'needs_payment_method', message: 'Add a card on file before approving.' });
        }
      }

      const t = NOW_ISO();
      const { data: updated, error: upErr } = await db
        .from('quotes')
        .update({
          status: 'Approved',
          approved_at: (quote.approved_at as string | null) ?? t,
          sent_at: (quote.sent_at as string | null) ?? t,
          updated_at: t,
          converted_at: null,
        })
        .eq('id', qid)
        .eq('tenant_id', tid)
        .select('*')
        .single();
      if (upErr) return res.status(500).json({ error: upErr.message });

      await insertCommLog(db, {
        tenant_id: tid,
        account_id: (quote.account_id as string) ?? null,
        kind: 'email',
        subject: `Quote #${quote.quote_number} approved (client)`,
        body: 'Approved via public quote link.',
        related_entity_type: 'quote',
        related_entity_id: qid,
        status: 'approved',
      });

      return res.status(200).json({ quote: updated });
    }

    if (action === 'setup_intent') {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) return res.status(503).json({ error: 'Stripe is not configured' });

      const { data: tenantStripe } = await db
        .from('tenants')
        .select('stripe_connect_account_id, stripe_connect_charges_enabled')
        .eq('id', tid)
        .single();

      const connectedId = tenantStripe?.stripe_connect_account_id as string | null | undefined;
      const connectOk = Boolean(connectedId && tenantStripe?.stripe_connect_charges_enabled);
      if (!connectOk) {
        return res.status(503).json({ error: 'Stripe Connect is not enabled for this business.' });
      }

      if (!quote.account_id) return res.status(400).json({ error: 'Quote has no account' });

      const { data: acc, error: aErr } = await db
        .from('crm_accounts')
        .select('id, name, email, stripe_customer_id')
        .eq('id', quote.account_id)
        .eq('tenant_id', tid)
        .single();
      if (aErr || !acc) return res.status(404).json({ error: 'Account not found' });

      const stripe = new Stripe(stripeKey);
      const reqOpts = { stripeAccount: connectedId! };

      let customerId = acc.stripe_customer_id as string | null;
      if (!customerId) {
        const cust = await stripe.customers.create(
          {
            email: (acc.email as string | null) ?? undefined,
            name: String(acc.name ?? ''),
            metadata: { crm_account_id: acc.id as string },
          },
          reqOpts
        );
        customerId = cust.id;
        await db
          .from('crm_accounts')
          .update({ stripe_customer_id: customerId })
          .eq('id', acc.id)
          .eq('tenant_id', tid);
      }

      const si = await stripe.setupIntents.create(
        {
          customer: customerId,
          payment_method_types: ['card'],
          usage: 'off_session',
        },
        reqOpts
      );

      return res.status(200).json({ clientSecret: si.client_secret, customerId });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    console.error('[public-quote]', e);
    return res.status(500).json({ error: msg });
  }
}
