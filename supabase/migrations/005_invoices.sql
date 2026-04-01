-- Phase 3: Invoices module.
-- Server access via service role / Vercel API only (RLS on, no anon policies).

-- ═══════════════════════════════════════════
-- Invoices
-- ═══════════════════════════════════════════
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.crm_accounts (id) on delete set null,
  property_id uuid references public.crm_properties (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  invoice_number serial,
  title text,
  status text not null default 'Draft',
  issue_date date not null default current_date,
  due_date date not null default (current_date + interval '30 days'),
  subtotal numeric(12,2) not null default 0,
  tax_rate numeric(5,4) not null default 0.05,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  notes text,
  payment_terms text default 'Net 30',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_account_id_idx on public.invoices (account_id);
create index if not exists invoices_job_id_idx on public.invoices (job_id);
create index if not exists invoices_status_idx on public.invoices (status);

-- ═══════════════════════════════════════════
-- Invoice line items
-- ═══════════════════════════════════════════
create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  product_service_name text not null,
  description text,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invoice_line_items_invoice_id_idx on public.invoice_line_items (invoice_id);

-- ═══════════════════════════════════════════
-- Invoice payments
-- ═══════════════════════════════════════════
create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  amount numeric(12,2) not null,
  payment_method text,
  payment_date date not null default current_date,
  reference_number text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists invoice_payments_invoice_id_idx on public.invoice_payments (invoice_id);

-- ═══════════════════════════════════════════
-- RLS (service role only)
-- ═══════════════════════════════════════════
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.invoice_payments enable row level security;

comment on table public.invoices is 'Client invoices; read/write via Vercel /api/invoices';
comment on table public.invoice_line_items is 'Line items belonging to an invoice';
comment on table public.invoice_payments is 'Payment records against invoices';
