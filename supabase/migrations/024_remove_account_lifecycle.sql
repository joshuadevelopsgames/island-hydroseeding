-- account_lifecycle duplicated pipeline intent (see 020 backfill). Pipeline status remains canonical.
alter table public.crm_accounts drop column if exists account_lifecycle cascade;
