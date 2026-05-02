-- Jobber OAuth refresh token (encrypted at rest; same AES key as QuickBooks: QUICKBOOKS_TOKEN_ENCRYPTION_KEY)

alter table public.tenants add column if not exists jobber_refresh_token_encrypted text;

comment on column public.tenants.jobber_refresh_token_encrypted is
  'AES-256-GCM ciphertext (base64) of Jobber OAuth refresh token; used by /api/cron/jobber-sync';
