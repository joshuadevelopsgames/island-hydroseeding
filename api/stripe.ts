/**
 * /api/stripe — Stripe payment helpers (authenticated / internal use)
 *
 * GET  ?action=invoice_by_token&token=<pay_token>
 *   Returns public invoice summary for the client-facing /pay/:token page.
 *   No auth required — token acts as the credential.
 *
 * POST { action: 'create_payment_intent', invoice_id }
 *   Creates (or retrieves existing) Stripe PaymentIntent for the invoice.
 *   Returns { clientSecret }.
 *
 * POST { action: 'get_payment_link', invoice_id }
 *   Generates a pay_token for the invoice (idempotent) and returns the full URL.
 *
 * Webhook events are handled in /api/stripe-webhook.ts (separate file,
 * body parser disabled for signature verification).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { randomUUID } from 'crypto';

// ── helpers ───────────────────────────────────────────────────────────────────

function getDb(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function getStripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' });
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'string') { try { return JSON.parse(b) as Record<string, unknown>; } catch { return {}; } }
  return b as Record<string, unknown>;
}

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── main ──────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET')  return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('[stripe]', err);
    return res.status(500).json({ error: err?.message ?? 'Internal error' });
  }
}

// ── GET ───────────────────────────────────────────────────────────────────────

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { action, token } = req.query as Record<string, string>;

  if (action === 'invoice_by_token') {
    if (!token) return res.status(400).json({ error: 'token required' });

    const db = getDb();

    const { data: invoice, error } = await db
      .from('invoices')
      .select('id, invoice_number, title, status, issue_date, due_date, subtotal, tax_rate, tax_amount, total, amount_paid, balance_due, payment_terms, notes, account_id, property_id')
      .eq('pay_token', token)
      .single();

    if (error || !invoice) return res.status(404).json({ error: 'Invoice not found' });

    const { data: lineItems } = await db
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoice.id)
      .order('sort_order');

    const { data: account } = invoice.account_id
      ? await db.from('crm_accounts').select('name, company, email, phone').eq('id', invoice.account_id).single()
      : { data: null };

    const { data: property } = invoice.property_id
      ? await db.from('crm_properties').select('address, city, province, postal_code').eq('id', invoice.property_id).single()
      : { data: null };

    return res.status(200).json({ invoice, line_items: lineItems ?? [], account, property });
  }

  return res.status(400).json({ error: `Unknown GET action: ${action}` });
}

// ── POST ──────────────────────────────────────────────────────────────────────

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const body     = parseBody(req);
  const { action } = body;

  if (action === 'create_payment_intent') return createPaymentIntent(body, res);
  if (action === 'get_payment_link')      return getPaymentLink(body, req, res);

  return res.status(400).json({ error: `Unknown POST action: ${action}` });
}

// ── create_payment_intent ─────────────────────────────────────────────────────

async function createPaymentIntent(body: Record<string, unknown>, res: VercelResponse) {
  const { invoice_id } = body as { invoice_id: string };
  if (!invoice_id) return res.status(400).json({ error: 'invoice_id required' });

  const db  = getDb();
  const str = getStripe();

  const { data: invoice, error } = await db
    .from('invoices')
    .select('id, invoice_number, title, total, balance_due, status, stripe_payment_intent_id, account_id')
    .eq('id', invoice_id)
    .single();

  if (error || !invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'Paid') return res.status(400).json({ error: 'Invoice is already paid' });
  if ((invoice.balance_due ?? 0) <= 0) return res.status(400).json({ error: 'No balance due' });

  // Reuse existing PaymentIntent if still usable
  if (invoice.stripe_payment_intent_id) {
    try {
      const existing = await str.paymentIntents.retrieve(invoice.stripe_payment_intent_id);
      if (existing.status !== 'succeeded' && existing.status !== 'canceled') {
        return res.status(200).json({ clientSecret: existing.client_secret });
      }
    } catch {
      // Fall through — create a fresh one
    }
  }

  const { data: account } = invoice.account_id
    ? await db.from('crm_accounts').select('name, email').eq('id', invoice.account_id).single()
    : { data: null };

  const amountCents = Math.round((invoice.balance_due ?? invoice.total ?? 0) * 100);

  const pi = await str.paymentIntents.create({
    amount: amountCents,
    currency: 'cad',
    metadata: {
      invoice_id:     invoice.id,
      invoice_number: String(invoice.invoice_number),
      client_name:    account?.name ?? '',
    },
    description: `Invoice #${String(invoice.invoice_number).padStart(4, '0')}${invoice.title ? ` — ${invoice.title}` : ''}`,
    receipt_email: account?.email ?? undefined,
  });

  await db
    .from('invoices')
    .update({ stripe_payment_intent_id: pi.id, updated_at: new Date().toISOString() })
    .eq('id', invoice_id);

  return res.status(200).json({ clientSecret: pi.client_secret });
}

// ── get_payment_link ──────────────────────────────────────────────────────────

async function getPaymentLink(body: Record<string, unknown>, req: VercelRequest, res: VercelResponse) {
  const { invoice_id } = body as { invoice_id: string };
  if (!invoice_id) return res.status(400).json({ error: 'invoice_id required' });

  const db = getDb();

  const { data: invoice, error } = await db
    .from('invoices')
    .select('id, pay_token, status')
    .eq('id', invoice_id)
    .single();

  if (error || !invoice) return res.status(404).json({ error: 'Invoice not found' });

  let token = invoice.pay_token as string | null;

  if (!token) {
    token = randomUUID();
    await db
      .from('invoices')
      .update({ pay_token: token, updated_at: new Date().toISOString() })
      .eq('id', invoice_id);
  }

  const proto = req.headers['x-forwarded-proto'] ?? 'https';
  const host  = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'island-hydroseeding.vercel.app';
  const url   = `${proto}://${host}/pay/${token}`;

  return res.status(200).json({ url, token });
}
