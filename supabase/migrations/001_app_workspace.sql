-- Run in Supabase → SQL Editor (free tier). Stores one shared workspace blob for the Island Hydroseeding app.

create table if not exists public.app_workspace (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_workspace enable row level security;

-- Server routes use the service role and bypass RLS. No anon policies: the table is not exposed to browsers.

comment on table public.app_workspace is 'Synced app state; read/write only via Vercel API using SUPABASE_SERVICE_ROLE_KEY';
