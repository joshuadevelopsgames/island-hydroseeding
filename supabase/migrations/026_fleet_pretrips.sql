-- Vehicle pre-trip inspections (circle checks).
--
-- Previously these lived only in browser localStorage and rode along inside the
-- app_workspace JSON blob, which syncs last-write-wins. With several field
-- phones each pushing their whole copy, concurrent submissions silently
-- clobbered each other and records "slipped through". They are now first-class
-- rows written via /api/fleet-pretrips using the service role.
--
-- Photos reuse the existing private `account-attachments` Storage bucket under
-- the `pretrips/` path prefix (no new bucket needed); we keep only the object
-- paths here and mint short-lived signed URLs on read.
--
-- RLS is enabled with no anon policies (same pattern as fleet_* and jobs) —
-- all access goes through the Vercel API on the service role.

create table if not exists public.fleet_pretrips (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  type text not null default 'Truck',
  inspected_at timestamptz not null default now(),
  employee_name text not null default '',
  equipment_id text not null default '',
  location text not null default '',
  status text not null default 'Passed',
  remarks text not null default '',
  checklist jsonb not null default '{}'::jsonb,
  photo_paths text[] not null default '{}',
  created_by_user_id text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fleet_pretrips_tenant_id_idx
  on public.fleet_pretrips (tenant_id);
create index if not exists fleet_pretrips_inspected_at_idx
  on public.fleet_pretrips (tenant_id, inspected_at desc);

alter table public.fleet_pretrips enable row level security;

comment on table public.fleet_pretrips is
  'Vehicle pre-trip inspections; written via /api/fleet-pretrips (service role). Photos in the account-attachments bucket under pretrips/.';
