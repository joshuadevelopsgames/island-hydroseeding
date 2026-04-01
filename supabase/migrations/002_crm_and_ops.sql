-- Relational CRM + lightweight ops (announcements, approvals). Server access via service role / Vercel API only (RLS on, no anon policies).

create table if not exists public.crm_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  account_type text not null default 'Residential',
  status text not null default 'New Lead',
  marketing_source text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.crm_accounts (id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_contacts_account_id_idx on public.crm_contacts (account_id);

create table if not exists public.crm_interactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.crm_accounts (id) on delete cascade,
  kind text not null,
  summary text not null,
  detail text,
  occurred_at timestamptz not null default now(),
  created_by_user_id text,
  created_at timestamptz not null default now()
);

create index if not exists crm_interactions_account_id_idx on public.crm_interactions (account_id);
create index if not exists crm_interactions_occurred_at_idx on public.crm_interactions (occurred_at desc);

create table if not exists public.crm_research_notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.crm_accounts (id) on delete cascade,
  title text,
  body text not null,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_research_notes_account_id_idx on public.crm_research_notes (account_id);

create table if not exists public.ops_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_approval_requests (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null,
  resource_id text not null,
  title text not null,
  detail text,
  status text not null default 'pending',
  requested_by text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ops_approval_requests_status_idx on public.ops_approval_requests (status);
create index if not exists ops_approval_requests_created_idx on public.ops_approval_requests (created_at desc);

-- updated_at is set in application (Vercel API) on writes

alter table public.crm_accounts enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_interactions enable row level security;
alter table public.crm_research_notes enable row level security;
alter table public.ops_announcements enable row level security;
alter table public.ops_approval_requests enable row level security;

comment on table public.crm_accounts is 'CRM accounts; read/write via Vercel /api/crm with service role';
comment on table public.ops_announcements is 'In-app banners; read via /api/ops';
