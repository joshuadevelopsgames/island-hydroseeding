-- Stripe Customer id on the connected account (for SetupIntent / PM on file checks).

alter table public.crm_accounts
  add column if not exists stripe_customer_id text;

comment on column public.crm_accounts.stripe_customer_id is
  'Stripe Customer id (on the tenant Connect account) when the client saved a card for PM-on-file.';
