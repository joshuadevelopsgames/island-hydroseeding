-- Optional: platform SaaS fee subscription billed to the tenant's Stripe balance (Accounts v2 customer configuration).
alter table public.tenants add column if not exists stripe_platform_saas_subscription_id text;

comment on column public.tenants.stripe_platform_saas_subscription_id is
  'Stripe Subscription id when the workspace pays platform SaaS fees via customer_account + stripe_balance (blueprint)';
