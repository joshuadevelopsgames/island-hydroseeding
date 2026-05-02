-- Phase 1 of the Jobber-gap plan: properly model multi-property + multi-contact accounts.
-- Schema for crm_properties and crm_contacts already exists (003 / 002). This migration:
--   1. Adds is_default + label to crm_properties so we can pick a default service site per account.
--   2. Adds tier + sort_order to crm_contacts so contacts can be ranked Primary / Secondary / Tertiary / Other.
--   3. Backfills a default property row from crm_accounts.address for accounts that have an address but no property.
--   4. Backfills a primary contact row from crm_accounts.phone/email for accounts with no contact yet.
--   5. Marks one existing property per account as is_default if none is set.
--   6. Maps existing crm_contacts.is_primary = true to tier = 'primary'.
--
-- crm_accounts.address / phone / email are deliberately left in place. They still serve as the legacy
-- single-address / single-contact path until quotes, invoices, etc. are switched over to read via property_id.

-- ───────────────────────────────────────────────
-- crm_properties: is_default + label
-- ───────────────────────────────────────────────
alter table public.crm_properties
  add column if not exists is_default boolean not null default false,
  add column if not exists label text;

-- One default property per account (when set). Partial index so accounts with zero defaults are allowed
-- mid-migration; backfill below promotes one row per account to is_default.
create unique index if not exists crm_properties_one_default_per_account_idx
  on public.crm_properties (account_id)
  where is_default = true;

-- ───────────────────────────────────────────────
-- crm_contacts: tier + sort_order
-- ───────────────────────────────────────────────
alter table public.crm_contacts
  add column if not exists tier text not null default 'other',
  add column if not exists sort_order int not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_contacts_tier_check'
  ) then
    alter table public.crm_contacts
      add constraint crm_contacts_tier_check
      check (tier in ('primary', 'secondary', 'tertiary', 'other'));
  end if;
end $$;

-- At most one of each ranked tier per account. 'other' is unconstrained because there can be many.
create unique index if not exists crm_contacts_one_primary_per_account_idx
  on public.crm_contacts (account_id) where tier = 'primary';
create unique index if not exists crm_contacts_one_secondary_per_account_idx
  on public.crm_contacts (account_id) where tier = 'secondary';
create unique index if not exists crm_contacts_one_tertiary_per_account_idx
  on public.crm_contacts (account_id) where tier = 'tertiary';

-- ───────────────────────────────────────────────
-- Backfill: existing is_primary = true → tier = 'primary'
-- ───────────────────────────────────────────────
update public.crm_contacts
   set tier = 'primary'
 where is_primary = true
   and tier = 'other';

-- ───────────────────────────────────────────────
-- Backfill: create a default property for accounts that have an address but no property row
-- ───────────────────────────────────────────────
insert into public.crm_properties (tenant_id, account_id, address, is_default, label)
select a.tenant_id,
       a.id,
       a.address,
       true,
       'Main'
  from public.crm_accounts a
 where a.address is not null
   and length(trim(a.address)) > 0
   and not exists (
     select 1 from public.crm_properties p where p.account_id = a.id
   );

-- ───────────────────────────────────────────────
-- Backfill: ensure each account that has any properties has exactly one is_default = true.
-- Pick the earliest by created_at as the default.
-- ───────────────────────────────────────────────
with ranked as (
  select id,
         account_id,
         row_number() over (partition by account_id order by created_at asc, id asc) as rn
    from public.crm_properties
   where account_id in (
     select account_id from public.crm_properties group by account_id having bool_or(is_default) = false
   )
)
update public.crm_properties p
   set is_default = true
  from ranked r
 where p.id = r.id and r.rn = 1;

-- ───────────────────────────────────────────────
-- Backfill: create a primary contact for accounts with no contact rows but with phone or email on the account
-- ───────────────────────────────────────────────
insert into public.crm_contacts (tenant_id, account_id, name, phone, email, is_primary, tier, sort_order)
select a.tenant_id,
       a.id,
       coalesce(nullif(trim(a.name), ''), 'Primary contact'),
       a.phone,
       a.email,
       true,
       'primary',
       0
  from public.crm_accounts a
 where (a.phone is not null or a.email is not null)
   and not exists (
     select 1 from public.crm_contacts c where c.account_id = a.id
   );

comment on column public.crm_properties.is_default is 'Default service property for the account; one per account.';
comment on column public.crm_properties.label is 'Friendly label, e.g. Main, Cabin, Shop.';
comment on column public.crm_contacts.tier is 'primary | secondary | tertiary | other. Each ranked tier is unique per account.';
comment on column public.crm_contacts.sort_order is 'Tie-break ordering within a tier; smaller renders first.';
