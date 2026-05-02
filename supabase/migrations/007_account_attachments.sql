-- Per-account file attachments. Files themselves live in Supabase Storage
-- under the `account-attachments` bucket; this table tracks metadata.
--
-- Bucket setup (run once in Supabase Dashboard → Storage):
--   1. Create bucket "account-attachments" (private — leave "Public bucket" off)
--   2. No RLS policies needed on the bucket; all reads/writes go through
--      the Vercel API using the service role.

create table if not exists public.crm_account_attachments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.crm_accounts (id) on delete cascade,
  uploaded_by_user_id text,
  uploaded_by_email text,
  file_name text not null,
  file_size bigint,
  file_type text,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists crm_account_attachments_account_id_idx
  on public.crm_account_attachments (account_id);

create index if not exists crm_account_attachments_created_at_idx
  on public.crm_account_attachments (created_at desc);

alter table public.crm_account_attachments enable row level security;
