-- Fleet workspace: assets, fuel, road costs, issues, inventory, POs, maintenance work orders.
-- Synced from app via /api/fleet (service role); RLS on with no anon policies (same pattern as jobs).

-- ═══════════════════════════════════════════════════════════════════════════
-- Fleet assets
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.fleet_assets (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  type text not null default 'truck',
  unit_number text not null default '',
  vin text not null default '',
  notes text not null default '',
  odometer_km numeric(12, 2),
  engine_hours numeric(12, 2),
  odometer_updated_at timestamptz,
  pm_interval_km numeric(12, 2),
  pm_interval_hours numeric(12, 2),
  last_pm_odometer_km numeric(12, 2),
  last_pm_engine_hours numeric(12, 2),
  last_pm_at timestamptz,
  cvip jsonb not null default '{}'::jsonb,
  warranty_expires_at timestamptz,
  tire_notes text not null default '',
  last_tire_service_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fleet_assets_tenant_id_idx on public.fleet_assets (tenant_id);
create index if not exists fleet_assets_updated_at_idx on public.fleet_assets (updated_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fuel entries
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.fleet_fuel_entries (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  asset_id uuid,
  asset_label text not null default '',
  date timestamptz not null,
  volume numeric(14, 4) not null default 0,
  unit text not null default 'L',
  total_cost numeric(14, 2),
  odometer_km numeric(12, 2),
  station_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fleet_fuel_entries_tenant_id_idx on public.fleet_fuel_entries (tenant_id);
create index if not exists fleet_fuel_entries_date_idx on public.fleet_fuel_entries (date desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- Road costs
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.fleet_road_costs (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  asset_id uuid,
  asset_label text not null default '',
  type text not null default 'other',
  date timestamptz not null,
  amount numeric(14, 2) not null default 0,
  reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fleet_road_costs_tenant_id_idx on public.fleet_road_costs (tenant_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fleet issues / defects
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.fleet_issues (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  asset_id uuid,
  asset_label text not null default '',
  title text not null default '',
  description text not null default '',
  severity text not null default 'medium',
  status text not null default 'open',
  linked_work_order_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists fleet_issues_tenant_id_idx on public.fleet_issues (tenant_id);
create index if not exists fleet_issues_status_idx on public.fleet_issues (status);

-- ═══════════════════════════════════════════════════════════════════════════
-- Inventory stock (simple stock list)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.inventory_items (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  category text not null default 'General',
  quantity numeric(14, 4) not null default 0,
  unit text not null default 'units',
  threshold numeric(14, 4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_tenant_id_idx on public.inventory_items (tenant_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Purchase orders (inventory tab)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.fleet_purchase_orders (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  vendor text not null default '',
  ordered_at timestamptz not null,
  expected_at timestamptz,
  total numeric(14, 2),
  status text not null default 'draft',
  line_summary text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fleet_purchase_orders_tenant_id_idx on public.fleet_purchase_orders (tenant_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Maintenance work orders (equipment page)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.fleet_work_orders (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  asset_id uuid,
  asset_label text not null default '',
  title text not null default '',
  due_date timestamptz not null,
  status text not null default 'open',
  vendor text not null default '',
  estimated_cost numeric(14, 2),
  actual_cost numeric(14, 2),
  parts jsonb not null default '[]'::jsonb,
  odometer_at_service_km numeric(12, 2),
  warranty_flag boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists fleet_work_orders_tenant_id_idx on public.fleet_work_orders (tenant_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS (API / service role only)
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.fleet_assets enable row level security;
alter table public.fleet_fuel_entries enable row level security;
alter table public.fleet_road_costs enable row level security;
alter table public.fleet_issues enable row level security;
alter table public.inventory_items enable row level security;
alter table public.fleet_purchase_orders enable row level security;
alter table public.fleet_work_orders enable row level security;

comment on table public.fleet_assets is 'Fleet vehicles/equipment; synced via /api/fleet';
comment on table public.inventory_items is 'Parts/supplies stock; synced via /api/fleet';
