-- QuickBooks Online (per-tenant OAuth). Tokens stored encrypted at rest (application layer).

alter table public.tenants add column if not exists quickbooks_realm_id text unique;
alter table public.tenants add column if not exists quickbooks_access_token_encrypted text;
alter table public.tenants add column if not exists quickbooks_refresh_token_encrypted text;
alter table public.tenants add column if not exists quickbooks_token_expires_at timestamptz;
alter table public.tenants add column if not exists quickbooks_refresh_token_expires_at timestamptz;
alter table public.tenants add column if not exists quickbooks_connected_at timestamptz;

comment on column public.tenants.quickbooks_realm_id is 'Intuit company (realm) id for QuickBooks Online API';
comment on column public.tenants.quickbooks_access_token_encrypted is 'AES-256-GCM ciphertext (base64) of OAuth access token';
comment on column public.tenants.quickbooks_refresh_token_encrypted is 'AES-256-GCM ciphertext (base64) of OAuth refresh token';

create index if not exists tenants_quickbooks_realm_id_idx on public.tenants (quickbooks_realm_id)
  where quickbooks_realm_id is not null;
