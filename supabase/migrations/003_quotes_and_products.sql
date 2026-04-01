-- Phase 1: Properties, products catalog, quote templates, and quotes.
-- Server access via service role / Vercel API only (RLS on, no anon policies).

-- ═══════════════════════════════════════════
-- Client properties (multiple addresses per account)
-- ═══════════════════════════════════════════
create table if not exists public.crm_properties (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.crm_accounts (id) on delete cascade,
  address text not null,
  city text,
  province text default 'British Columbia',
  postal_code text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_properties_account_id_idx on public.crm_properties (account_id);

-- ═══════════════════════════════════════════
-- Products / services catalog
-- ═══════════════════════════════════════════
create table if not exists public.products_services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  default_unit_price numeric(12,2),
  unit_label text default 'sq ft',
  category text default 'Hydroseeding',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════
-- Quote templates (reusable configurations)
-- ═══════════════════════════════════════════
create table if not exists public.quote_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  introduction_text text,
  contract_text text,
  line_items_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════
-- Quotes
-- ═══════════════════════════════════════════
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.crm_accounts (id) on delete cascade,
  property_id uuid references public.crm_properties (id) on delete set null,
  quote_number serial,
  title text not null,
  status text not null default 'Draft',
  salesperson_id text,
  introduction text,
  contract_disclaimer text,
  subtotal numeric(12,2) not null default 0,
  tax_rate numeric(5,4) not null default 0.05,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  deposit_required boolean not null default false,
  deposit_amount numeric(12,2),
  approval_token text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  approved_at timestamptz,
  converted_at timestamptz
);

create index if not exists quotes_account_id_idx on public.quotes (account_id);
create index if not exists quotes_status_idx on public.quotes (status);
create index if not exists quotes_created_at_idx on public.quotes (created_at desc);
create unique index if not exists quotes_approval_token_idx on public.quotes (approval_token) where approval_token is not null;

-- ═══════════════════════════════════════════
-- Quote line items
-- ═══════════════════════════════════════════
create table if not exists public.quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  product_service_name text not null,
  description text,
  quantity numeric(12,2) not null default 0,
  unit_price numeric(12,4) not null default 0,
  total numeric(12,2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists quote_line_items_quote_id_idx on public.quote_line_items (quote_id);

-- ═══════════════════════════════════════════
-- Tags (for clients)
-- ═══════════════════════════════════════════
create table if not exists public.crm_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text default '#6B7280',
  created_at timestamptz not null default now()
);

create table if not exists public.crm_account_tags (
  account_id uuid not null references public.crm_accounts (id) on delete cascade,
  tag_id uuid not null references public.crm_tags (id) on delete cascade,
  primary key (account_id, tag_id)
);

-- ═══════════════════════════════════════════
-- RLS (service role only)
-- ═══════════════════════════════════════════
alter table public.crm_properties enable row level security;
alter table public.products_services enable row level security;
alter table public.quote_templates enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_line_items enable row level security;
alter table public.crm_tags enable row level security;
alter table public.crm_account_tags enable row level security;

-- ═══════════════════════════════════════════
-- Seed default products for Island Hydroseeding
-- ═══════════════════════════════════════════
insert into public.products_services (name, description, default_unit_price, unit_label, category) values
  ('Hydroseeding - MOT Revegetation - (Residential)', 'with Premier Pacific "MOT / Vancouver Island Coast Mix", consisting of, by weight:
37% Perennial Ryegrass
29% Creeping Red Fescue
17% Hard Fescue
9% Timothy
5% Canada Bluegrass
3% Red Top
nb: varieties subject to change based on availability
& fertilizer: Nutrien AG 18-18-18 +2S', 0.25, 'sq ft', 'Hydroseeding'),

  ('Hydroseeding - MOT Revegetation - (Commercial)', 'with Premier Pacific "MOT / Vancouver Island Coast Mix"
& fertilizer: Nutrien AG 18-18-18 +2S
Commercial application rate', 0.20, 'sq ft', 'Hydroseeding'),

  ('Overseeding', 'Over-seeding of existing lawn area with hydroseeding application', 0.15, 'sq ft', 'Hydroseeding'),

  ('Grass Seed - Supply Only', 'Grass seed supply only, no application', 3.50, 'lb', 'Materials'),

  ('Fertilizer Treatment', 'Fertilizer application: Nutrien AG 18-18-18 +2S', 0.08, 'sq ft', 'Hydroseeding'),

  ('Erosion Control Blanket', 'Supply and install erosion control blanket', 2.50, 'sq ft', 'Erosion Control'),

  ('Mobilization', 'Equipment mobilization to job site', 250.00, 'ea', 'Mobilization')
on conflict do nothing;

-- Seed default contract/disclaimer text
insert into public.quote_templates (name, introduction_text, contract_text, line_items_json) values
  ('Standard Hydroseeding',
   'Thank you for considering Island Hydroseeding Ltd. for your project. We are pleased to present this estimate for your review.',
   'We are pleased to present this estimate for Hydroseeding Services. Please note that the following services are not included:
- Additional mobilizations, Traffic control, Ground preparation, Protective signage / fencing, Mowing, Weeding, Additional fertilizer application

Please also note the following general terms & conditions:
- Changed or cancelled bookings may incur extra charges.
- Pricing is based on estimated quantities and the quoted price represents the minimum charge.
- If actual area is greater than the area reported by customer, additional per-square-foot and mobilization charges will apply.
- Any additional site visits outside of the original agreement will be subject to an extra mobilization fee.
- Estimate assumes access to within 150'' / 45m of all areas to be seeded.
- This estimate is valid for 30 days.
- Errors & omissions excepted.

Our Guarantee and What to Expect:
We guarantee a professional hydroseeding application using high-quality seed, mulch, and fertilizer applied at the correct rate. While we can''t guarantee final growth results due to variables like weather, soil, and watering (which are outside our control), we''re committed to helping you succeed. We''re always happy to answer questions and offer tips to give your new lawn the best chance to thrive!',
   '[]'::jsonb)
on conflict do nothing;

comment on table public.crm_properties is 'Client property addresses; read/write via Vercel API';
comment on table public.products_services is 'Product/service catalog for line items';
comment on table public.quote_templates is 'Reusable quote templates';
comment on table public.quotes is 'Client quotes; read/write via Vercel /api/quotes';
comment on table public.quote_line_items is 'Line items belonging to a quote';
