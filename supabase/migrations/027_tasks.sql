-- Task board — server-backed.
--
-- Tasks and the board's column configuration previously lived only in browser
-- localStorage (`tasksBoard` / `tasksColumns_v1`). That meant two people editing
-- the board never saw each other's work, and clearing site data wiped the lot —
-- the same failure mode that lost field pre-trips before 026.
--
-- RLS is enabled with no anon policies (same pattern as fleet_* and jobs) —
-- all access goes through the Vercel API on the service role.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null default '',
  description text not null default '',
  -- Column id; matches a `task_columns.column_id` value. Free text rather than a
  -- foreign key so deleting a column can never delete the work inside it.
  status text not null default 'todo',
  priority text not null default 'medium',
  due_date timestamptz,
  labels text[] not null default '{}',
  assignee_id text,
  assignee_name text not null default '',
  -- When the current assignee was set; drives the "new for you" inbox badge.
  assignee_since timestamptz,
  created_by_user_id text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_tenant_id_idx on public.tasks (tenant_id);
create index if not exists tasks_tenant_status_idx on public.tasks (tenant_id, status);
create index if not exists tasks_tenant_due_idx on public.tasks (tenant_id, due_date);

alter table public.tasks enable row level security;

comment on table public.tasks is
  'Task board rows; written via /api/tasks (service role). Replaces the tasksBoard localStorage blob.';

-- Board columns are shared configuration, so they belong next to the tasks
-- rather than in each browser. `sort_order` drives left-to-right board order.
create table if not exists public.task_columns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  column_id text not null,
  label text not null default '',
  builtin boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, column_id)
);

create index if not exists task_columns_tenant_order_idx
  on public.task_columns (tenant_id, sort_order);

alter table public.task_columns enable row level security;

comment on table public.task_columns is
  'Shared task board column configuration; written via /api/tasks (service role).';
