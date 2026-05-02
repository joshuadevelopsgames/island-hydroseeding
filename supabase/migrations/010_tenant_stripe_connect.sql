-- Stripe Connect (per-tenant) + public branding for invoice/quote client views.

-- Connected account id from Stripe (acct_…); onboarding via Account Links
alter table public.tenants add column if not exists stripe_connect_account_id text unique;
alter table public.tenants add column if not exists stripe_connect_charges_enabled boolean not null default false;
alter table public.tenants add column if not exists stripe_connect_details_submitted boolean not null default false;
alter table public.tenants add column if not exists stripe_connect_payouts_enabled boolean not null default false;

comment on column public.tenants.stripe_connect_account_id is 'Stripe Connect Express-style connected account (acct_…) for this tenant';

-- Public-facing document branding (matches /pay/:token and PDFs)
alter table public.tenants add column if not exists public_tagline text;
alter table public.tenants add column if not exists public_brand_logo_url text;
alter table public.tenants add column if not exists public_etransfer_email text;
alter table public.tenants add column if not exists public_gst_registration text;
alter table public.tenants add column if not exists public_footer_note text;

comment on column public.tenants.public_tagline is 'Subtitle under business name on client invoice/quote';
comment on column public.tenants.public_brand_logo_url is 'Optional logo URL for pay page and PDFs';

-- Which Stripe account created the PI (null = platform account)
alter table public.invoices add column if not exists stripe_payment_intent_connected_account_id text;

comment on column public.invoices.stripe_payment_intent_connected_account_id is
  'Stripe Connect account id if PI was created on connected account; null if platform';

create index if not exists tenants_stripe_connect_account_id_idx on public.tenants (stripe_connect_account_id)
  where stripe_connect_account_id is not null;

-- Default copy for first tenant (optional; teams can edit in Account → Business)
update public.tenants
set public_tagline = coalesce(public_tagline, 'Professional Hydroseeding & Site Restoration')
where id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b';
