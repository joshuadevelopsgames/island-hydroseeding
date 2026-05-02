-- Phase 2: account lifecycle, lead sources, invoice rollups (computed in API), tag support uses existing crm_tags.
-- Phase 4: job profitability inputs — unit cost on line items & catalog, billable flag on expenses, hourly_rate on users, is_recurring on jobs.

-- ───────────────────────────────────────────────
-- Lead sources (per tenant)
-- ───────────────────────────────────────────────
create table if not exists public.crm_lead_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists crm_lead_sources_tenant_name_uq
  on public.crm_lead_sources (tenant_id, name);

create index if not exists crm_lead_sources_tenant_idx on public.crm_lead_sources (tenant_id);

alter table public.crm_lead_sources enable row level security;

-- Seed default sources for each tenant
insert into public.crm_lead_sources (tenant_id, name, sort_order)
select t.id, v.name, v.ord
from public.tenants t
cross join (
  values
    ('Website', 1),
    ('Referral', 2),
    ('Google', 3),
    ('Facebook', 4),
    ('Walk-in', 5),
    ('Other', 99)
) as v(name, ord)
on conflict (tenant_id, name) do nothing;

-- ───────────────────────────────────────────────
-- Accounts: lifecycle + lead source FK
-- ───────────────────────────────────────────────
alter table public.crm_accounts
  add column if not exists account_lifecycle text not null default 'Lead',
  add column if not exists lead_source_id uuid references public.crm_lead_sources (id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_accounts_account_lifecycle_check') then
    alter table public.crm_accounts
      add constraint crm_accounts_account_lifecycle_check
      check (account_lifecycle in ('Lead', 'Active', 'Inactive', 'Archived'));
  end if;
end $$;

-- Backfill lifecycle from pipeline status
update public.crm_accounts
set account_lifecycle = case status
  when 'Won / Closed' then 'Active'
  when 'Lost' then 'Inactive'
  when 'Active' then 'Active'
  else 'Lead'
end
where account_lifecycle = 'Lead';

-- Map marketing_source text to lead_source_id (best effort)
update public.crm_accounts a
set lead_source_id = ls.id
from public.crm_lead_sources ls
where ls.tenant_id = a.tenant_id
  and lower(trim(ls.name)) = lower(trim(coalesce(a.marketing_source, '')))
  and a.lead_source_id is null
  and coalesce(trim(a.marketing_source), '') <> '';

create index if not exists crm_accounts_lead_source_idx on public.crm_accounts (lead_source_id);
create index if not exists crm_accounts_lifecycle_idx on public.crm_accounts (account_lifecycle);

-- ───────────────────────────────────────────────
-- Team hourly rate (labour cost on jobs)
-- ───────────────────────────────────────────────
alter table public.user_permissions
  add column if not exists hourly_rate numeric(12,2) not null default 45;

-- ───────────────────────────────────────────────
-- Catalog default unit cost (materials / COGS estimate)
-- ───────────────────────────────────────────────
alter table public.products_services
  add column if not exists default_unit_cost numeric(12,4) not null default 0;

-- ───────────────────────────────────────────────
-- Job line items: per-line unit cost for profitability
-- ───────────────────────────────────────────────
alter table public.job_line_items
  add column if not exists unit_cost numeric(12,4) not null default 0;

-- ───────────────────────────────────────────────
-- Jobs: recurring flag for reporting
-- ───────────────────────────────────────────────
alter table public.jobs
  add column if not exists is_recurring boolean not null default false;

update public.jobs set is_recurring = true where job_type = 'Recurring';

-- ───────────────────────────────────────────────
-- Job expenses: billable passthrough + metadata
-- ───────────────────────────────────────────────
alter table public.job_expenses
  add column if not exists billable boolean not null default false,
  add column if not exists vendor text,
  add column if not exists expense_date date,
  add column if not exists entered_by text,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.job_expenses.billable is 'When true, expense is passed through to the client invoice; excluded from internal job cost.';
comment on column public.job_line_items.unit_cost is 'Internal cost per unit for margin calculation; separate from unit_price (revenue).';
