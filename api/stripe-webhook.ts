/**
 * /api/stripe-webhook — Stripe webhook handler
 *
 * Dedicated endpoint with body parser disabled so we can access the raw bytes
 * for stripe.webhooks.constructEvent signature verification.
 *
 * Vercel Cron / Stripe sends POST requests with stripe-signature header.
 * Add this URL as the webhook endpoint in your Stripe dashboard:
 *   https://island-hydroseeding.vercel.app/api/stripe-webhook
 *
 * Events handled:
 *   payment_intent.succeeded → mark invoice Paid, record payment row
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { randomUUID } from 'crypto';
import { syncInvoiceFinancials } from './_invoiceSync';

// Tell Vercel NOT to parse the body — Stripe signature verification needs raw bytes
export const config = { api: { bodyParser: false } };

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' });
}

function getDb() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig    = req.headers['stripe-signature'] as string | undefined;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) return res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET not set' });
  if (!sig)    return res.status(400).json({ error: 'Missing stripe-signature' });

  let event: Stripe.Event;
  try {
    const rawBody = await getRawBody(req);
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err: any) {
    console.error('[stripe-webhook] verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
    }
  } catch (err: any) {
    console.error('[stripe-webhook] handler error:', err);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
}

async function handlePaymentSucceeded(pi: Stripe.PaymentIntent) {
  const db        = getDb();
  const invoiceId = pi.metadata?.invoice_id;
  if (!invoiceId) return;

  const { data: invoice } = await db
    .from('invoices')
    .select('id, tenant_id, status')
    .eq('id', invoiceId)
    .single();

  if (!invoice || invoice.status === 'Paid') return;

  const metaTenant = pi.metadata?.tenant_id;
  if (metaTenant && metaTenant !== invoice.tenant_id) {
    console.error('[stripe-webhook] tenant_id mismatch for invoice', invoiceId);
    return;
  }

  const tenantId = invoice.tenant_id as string;

  const amountPaid = pi.amount_received / 100;
  const now        = new Date().toISOString();

  // Record payment row
  await db.from('invoice_payments').insert({
    id:               randomUUID(),
    tenant_id:        tenantId,
    invoice_id:       invoiceId,
    amount:           amountPaid,
    payment_method:   'stripe',
    payment_date:     now.slice(0, 10),
    reference_number: pi.id,
    notes:            'Online payment via Stripe',
    created_at:       now,
  });

  await syncInvoiceFinancials(db, invoiceId, tenantId);

  console.log(`[stripe-webhook] Invoice ${invoiceId} synced after PI ${pi.id}`);
}
