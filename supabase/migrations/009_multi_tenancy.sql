-- Multi-tenancy (phase 1): tenants table + tenant_id on all org-scoped data.
-- Seed: Island Hydroseeding — id MUST match api/_tenant.ts ISLAND_TENANT_ID and DEFAULT_TENANT_ID in Vercel.

create table if not exists public.tenants (
  id uuid primary key,
  slug text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

comment on table public.tenants is 'Organization / tenant; all CRM and billing rows reference this id';

insert into public.tenants (id, slug, display_name)
values (
  'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b',
  'island-hydroseeding',
  'Island Hydroseeding Ltd.'
)
on conflict (id) do nothing;

-- ── Helper: add tenant_id + backfill + NOT NULL ─────────────────────────────
-- crm_accounts (root for many FKs)
alter table public.crm_accounts add column if not exists tenant_id uuid references public.tenants (id);
update public.crm_accounts set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.crm_accounts alter column tenant_id set not null;
create index if not exists crm_accounts_tenant_id_idx on public.crm_accounts (tenant_id);

-- crm_properties
alter table public.crm_properties add column if not exists tenant_id uuid references public.tenants (id);
update public.crm_properties set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.crm_properties alter column tenant_id set not null;
create index if not exists crm_properties_tenant_id_idx on public.crm_properties (tenant_id);

-- crm_contacts
alter table public.crm_contacts add column if not exists tenant_id uuid references public.tenants (id);
update public.crm_contacts set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.crm_contacts alter column tenant_id set not null;
create index if not exists crm_contacts_tenant_id_idx on public.crm_contacts (tenant_id);

-- crm_interactions
alter table public.crm_interactions add column if not exists tenant_id uuid references public.tenants (id);
update public.crm_interactions set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.crm_interactions alter column tenant_id set not null;
create index if not exists crm_interactions_tenant_id_idx on public.crm_interactions (tenant_id);

-- crm_research_notes
alter table public.crm_research_notes add column if not exists tenant_id uuid references public.tenants (id);
update public.crm_research_notes set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.crm_research_notes alter column tenant_id set not null;
create index if not exists crm_research_notes_tenant_id_idx on public.crm_research_notes (tenant_id);

-- ops
alter table public.ops_announcements add column if not exists tenant_id uuid references public.tenants (id);
update public.ops_announcements set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.ops_announcements alter column tenant_id set not null;
create index if not exists ops_announcements_tenant_id_idx on public.ops_announcements (tenant_id);

alter table public.ops_approval_requests add column if not exists tenant_id uuid references public.tenants (id);
update public.ops_approval_requests set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.ops_approval_requests alter column tenant_id set not null;
create index if not exists ops_approval_requests_tenant_id_idx on public.ops_approval_requests (tenant_id);

-- catalog & quotes
alter table public.products_services add column if not exists tenant_id uuid references public.tenants (id);
update public.products_services set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.products_services alter column tenant_id set not null;
create index if not exists products_services_tenant_id_idx on public.products_services (tenant_id);

alter table public.quote_templates add column if not exists tenant_id uuid references public.tenants (id);
update public.quote_templates set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.quote_templates alter column tenant_id set not null;
create index if not exists quote_templates_tenant_id_idx on public.quote_templates (tenant_id);

alter table public.quotes add column if not exists tenant_id uuid references public.tenants (id);
update public.quotes set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.quotes alter column tenant_id set not null;
create index if not exists quotes_tenant_id_idx on public.quotes (tenant_id);
create unique index if not exists quotes_tenant_quote_number_uq on public.quotes (tenant_id, quote_number);

alter table public.quote_line_items add column if not exists tenant_id uuid references public.tenants (id);
update public.quote_line_items set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.quote_line_items alter column tenant_id set not null;
create index if not exists quote_line_items_tenant_id_idx on public.quote_line_items (tenant_id);

-- tags: names unique per tenant
alter table public.crm_tags add column if not exists tenant_id uuid references public.tenants (id);
update public.crm_tags set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.crm_tags alter column tenant_id set not null;
create index if not exists crm_tags_tenant_id_idx on public.crm_tags (tenant_id);
alter table public.crm_tags drop constraint if exists crm_tags_name_key;
drop index if exists crm_tags_name_key;
create unique index if not exists crm_tags_tenant_name_uq on public.crm_tags (tenant_id, name);

alter table public.crm_account_tags add column if not exists tenant_id uuid references public.tenants (id);
update public.crm_account_tags set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.crm_account_tags alter column tenant_id set not null;

-- requests & jobs
alter table public.requests add column if not exists tenant_id uuid references public.tenants (id);
update public.requests set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.requests alter column tenant_id set not null;
create index if not exists requests_tenant_id_idx on public.requests (tenant_id);

alter table public.jobs add column if not exists tenant_id uuid references public.tenants (id);
update public.jobs set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.jobs alter column tenant_id set not null;
create index if not exists jobs_tenant_id_idx on public.jobs (tenant_id);
create unique index if not exists jobs_tenant_job_number_uq on public.jobs (tenant_id, job_number);

alter table public.job_line_items add column if not exists tenant_id uuid references public.tenants (id);
update public.job_line_items set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.job_line_items alter column tenant_id set not null;

alter table public.job_visits add column if not exists tenant_id uuid references public.tenants (id);
update public.job_visits set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.job_visits alter column tenant_id set not null;

alter table public.job_expenses add column if not exists tenant_id uuid references public.tenants (id);
update public.job_expenses set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.job_expenses alter column tenant_id set not null;

alter table public.job_time_entries add column if not exists tenant_id uuid references public.tenants (id);
update public.job_time_entries set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.job_time_entries alter column tenant_id set not null;

-- invoices
alter table public.invoices add column if not exists tenant_id uuid references public.tenants (id);
update public.invoices set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.invoices alter column tenant_id set not null;
create index if not exists invoices_tenant_id_idx on public.invoices (tenant_id);
create unique index if not exists invoices_tenant_invoice_number_uq on public.invoices (tenant_id, invoice_number);

alter table public.invoice_line_items add column if not exists tenant_id uuid references public.tenants (id);
update public.invoice_line_items set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.invoice_line_items alter column tenant_id set not null;
create index if not exists invoice_line_items_tenant_id_idx on public.invoice_line_items (tenant_id);

alter table public.invoice_payments add column if not exists tenant_id uuid references public.tenants (id);
update public.invoice_payments set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.invoice_payments alter column tenant_id set not null;
create index if not exists invoice_payments_tenant_id_idx on public.invoice_payments (tenant_id);

-- attachments
alter table public.crm_account_attachments add column if not exists tenant_id uuid references public.tenants (id);
update public.crm_account_attachments set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.crm_account_attachments alter column tenant_id set not null;
create index if not exists crm_account_attachments_tenant_id_idx on public.crm_account_attachments (tenant_id);

-- app workspace: composite PK (tenant_id, id)
alter table public.app_workspace add column if not exists tenant_id uuid references public.tenants (id);
update public.app_workspace set tenant_id = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b' where tenant_id is null;
alter table public.app_workspace alter column tenant_id set not null;
alter table public.app_workspace drop constraint if exists app_workspace_pkey;
alter table public.app_workspace add primary key (tenant_id, id);

alter table public.tenants enable row level security;
