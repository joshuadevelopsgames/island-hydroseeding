-- Quote extensions for Jobber-style parity (no raw payment credentials).
-- Card-on-file policy is a boolean only; actual payment methods live in Stripe.
--
-- Storage (run once in Supabase Dashboard → Storage):
--   Create private bucket "quote-attachments" (same pattern as account-attachments).
--   Files are accessed via signed URLs from /api/quote-attachments.

-- ═══════════════════════════════════════════
-- Quote header
-- ═══════════════════════════════════════════
alter table public.quotes
  add column if not exists require_payment_method_on_file boolean not null default false;

comment on column public.quotes.require_payment_method_on_file is
  'If true, require the client to keep a payment method on file (enforced via Stripe). Do not store PAN or card data here.';

alter table public.quotes
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.quotes.metadata is
  'Non-secret quote-level JSON (e.g. UI hints, import metadata).';

-- ═══════════════════════════════════════════
-- Line items: section headings (e.g. "Product / Service" blocks)
-- ═══════════════════════════════════════════
alter table public.quote_line_items
  add column if not exists section_title text;

comment on column public.quote_line_items.section_title is
  'Optional section heading; consecutive lines with the same section_title belong to one block.';

-- ═══════════════════════════════════════════
-- Detailed tax lines (GST label + registration + rate + amount)
-- ═══════════════════════════════════════════
create table if not exists public.quote_tax_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  label text not null,
  registration_number text,
  rate numeric(8, 6) not null,
  amount numeric(12, 2) not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists quote_tax_lines_quote_id_idx on public.quote_tax_lines (quote_id);
create index if not exists quote_tax_lines_tenant_id_idx on public.quote_tax_lines (tenant_id);

comment on table public.quote_tax_lines is 'Per-quote tax breakdown; amounts should match quotes.tax_amount when used.';

-- ═══════════════════════════════════════════
-- Quote notes (timeline / structured context)
-- ═══════════════════════════════════════════
create table if not exists public.quote_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  body text not null,
  kind text not null default 'internal',
  extra jsonb not null default '{}'::jsonb,
  created_by_user_id text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_notes_quote_id_idx on public.quote_notes (quote_id);
create index if not exists quote_notes_tenant_id_idx on public.quote_notes (tenant_id);
create index if not exists quote_notes_created_at_idx on public.quote_notes (created_at desc);

comment on table public.quote_notes is 'Multiple notes per quote; extra JSON for contact refs, lead source, links.';
comment on column public.quote_notes.kind is 'e.g. internal, client_message';

-- ═══════════════════════════════════════════
-- Quote attachments (files / images — metadata only; see Storage bucket)
-- ═══════════════════════════════════════════
create table if not exists public.quote_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  uploaded_by_user_id text,
  uploaded_by_email text,
  file_name text not null,
  file_size bigint,
  file_type text,
  storage_path text not null,
  attachment_kind text not null default 'file',
  created_at timestamptz not null default now()
);

create index if not exists quote_attachments_quote_id_idx on public.quote_attachments (quote_id);
create index if not exists quote_attachments_tenant_id_idx on public.quote_attachments (tenant_id);

comment on table public.quote_attachments is 'Quote file metadata; blobs live in Supabase Storage bucket quote-attachments.';
comment on column public.quote_attachments.attachment_kind is 'file | image | other';

alter table public.quote_tax_lines enable row level security;
alter table public.quote_notes enable row level security;
alter table public.quote_attachments enable row level security;
