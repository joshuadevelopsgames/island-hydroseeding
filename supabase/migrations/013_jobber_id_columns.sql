-- Jobber migration dedup columns (scripts/jobber-migrate.mjs)
alter table public.crm_accounts add column if not exists jobber_id text;
alter table public.crm_properties add column if not exists jobber_id text;
alter table public.quotes add column if not exists jobber_id text;
alter table public.jobs add column if not exists jobber_id text;
alter table public.invoices add column if not exists jobber_id text;

create unique index if not exists crm_accounts_jobber_id_idx on public.crm_accounts (jobber_id) where jobber_id is not null;
create unique index if not exists crm_properties_jobber_id_idx on public.crm_properties (jobber_id) where jobber_id is not null;
create unique index if not exists quotes_jobber_id_idx on public.quotes (jobber_id) where jobber_id is not null;
create unique index if not exists jobs_jobber_id_idx on public.jobs (jobber_id) where jobber_id is not null;
create unique index if not exists invoices_jobber_id_idx on public.invoices (jobber_id) where jobber_id is not null;
