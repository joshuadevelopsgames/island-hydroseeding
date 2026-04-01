-- Phase 2: Requests (lead intake) and Jobs (work execution).
-- Server access via service role / Vercel API only (RLS on, no anon policies).

-- ═══════════════════════════════════════════
-- Requests (work requests / lead intake)
-- ═══════════════════════════════════════════
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.crm_accounts (id) on delete set null,
  property_id uuid references public.crm_properties (id) on delete set null,
  title text,
  description text,
  status text not null default 'New',
  source text default 'phone',
  assigned_to text,
  contact_name text,
  contact_phone text,
  contact_email text,
  requested_at timestamptz not null default now(),
  converted_at timestamptz,
  converted_quote_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists requests_status_idx on public.requests (status);
create index if not exists requests_account_id_idx on public.requests (account_id);
create index if not exists requests_requested_at_idx on public.requests (requested_at desc);

-- ═══════════════════════════════════════════
-- Jobs
-- ═══════════════════════════════════════════
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.crm_accounts (id) on delete cascade,
  property_id uuid references public.crm_properties (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  job_number serial,
  title text not null,
  job_type text not null default 'One-off',
  status text not null default 'Active',
  billing_frequency text default 'Upon job completion',
  automatic_payments boolean not null default false,
  start_date date,
  end_date date,
  salesperson_id text,
  total_price numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_account_id_idx on public.jobs (account_id);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);

-- ═══════════════════════════════════════════
-- Job line items
-- ═══════════════════════════════════════════
create table if not exists public.job_line_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  product_service_name text not null,
  description text,
  quantity numeric(12,2) not null default 0,
  unit_price numeric(12,4) not null default 0,
  total numeric(12,2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists job_line_items_job_id_idx on public.job_line_items (job_id);

-- ═══════════════════════════════════════════
-- Job visits (scheduled work)
-- ═══════════════════════════════════════════
create table if not exists public.job_visits (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  scheduled_at timestamptz not null,
  completed_at timestamptz,
  assigned_to text,
  status text not null default 'Scheduled',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_visits_job_id_idx on public.job_visits (job_id);
create index if not exists job_visits_scheduled_at_idx on public.job_visits (scheduled_at);
create index if not exists job_visits_status_idx on public.job_visits (status);

-- ═══════════════════════════════════════════
-- Job expenses
-- ═══════════════════════════════════════════
create table if not exists public.job_expenses (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null default 0,
  category text,
  receipt_url text,
  created_at timestamptz not null default now()
);

create index if not exists job_expenses_job_id_idx on public.job_expenses (job_id);

-- ═══════════════════════════════════════════
-- Job time entries (labour tracking)
-- ═══════════════════════════════════════════
create table if not exists public.job_time_entries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id text,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes int,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists job_time_entries_job_id_idx on public.job_time_entries (job_id);

-- ═══════════════════════════════════════════
-- RLS (service role only)
-- ═══════════════════════════════════════════
alter table public.requests enable row level security;
alter table public.jobs enable row level security;
alter table public.job_line_items enable row level security;
alter table public.job_visits enable row level security;
alter table public.job_expenses enable row level security;
alter table public.job_time_entries enable row level security;

comment on table public.requests is 'Work requests / lead intake; read/write via Vercel /api/requests';
comment on table public.jobs is 'Jobs / work orders; read/write via Vercel /api/jobs';
comment on table public.job_visits is 'Scheduled visits for jobs';
comment on table public.job_expenses is 'Expenses tracked against jobs';
comment on table public.job_time_entries is 'Labour time tracked against jobs';
