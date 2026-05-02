-- Phase 7: communications log (append-only audit trail; app writes via /api/crm).

create table if not exists public.comm_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  account_id uuid references public.crm_accounts (id) on delete set null,
  contact_id uuid references public.crm_contacts (id) on delete set null,
  property_id uuid references public.crm_properties (id) on delete set null,
  kind text not null,
  direction text not null default 'outbound',
  subject text,
  body text,
  attachments jsonb not null default '[]'::jsonb,
  sent_by text,
  sent_at timestamptz not null default now(),
  related_entity_type text,
  related_entity_id text,
  status text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comm_log_kind_check') then
    alter table public.comm_log
      add constraint comm_log_kind_check
      check (kind in ('email', 'sms', 'call'));
  end if;
end $$;

create index if not exists comm_log_tenant_sent_at_idx on public.comm_log (tenant_id, sent_at desc);
create index if not exists comm_log_account_idx on public.comm_log (account_id) where account_id is not null;

alter table public.comm_log enable row level security;

comment on table public.comm_log is 'Account communications; written by Vercel /api/crm (service role).';
