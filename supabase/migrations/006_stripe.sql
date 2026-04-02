-- Phase 6: Stripe payment integration.
-- Adds pay_token (for public client-facing payment URL) and
-- stripe_payment_intent_id (to track Stripe PaymentIntents) to invoices.

alter table public.invoices
  add column if not exists pay_token text unique,
  add column if not exists stripe_payment_intent_id text;

create index if not exists invoices_pay_token_idx on public.invoices (pay_token);
create index if not exists invoices_stripe_pi_idx  on public.invoices (stripe_payment_intent_id);

comment on column public.invoices.pay_token is
  'Random token used in the public /pay/:token URL — no auth required';
comment on column public.invoices.stripe_payment_intent_id is
  'Stripe PaymentIntent ID for the most recent online payment attempt';
