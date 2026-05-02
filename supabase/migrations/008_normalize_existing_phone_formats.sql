-- Backfill NANP-style phone formatting to match app display/normalize logic
-- (same rules as src/lib/phone.ts: 10 digits → "(NNN) NNN-NNNN",
--  leading 1 + 10 digits → "+1 (NNN) NNN-NNNN"; all other values unchanged).

update public.crm_accounts a
set phone = case
  when sub.d ~ '^\d{10}$' then
    '(' || substr(sub.d, 1, 3) || ') ' || substr(sub.d, 4, 3) || '-' || substr(sub.d, 7, 4)
  when sub.d ~ '^1\d{10}$' then
    '+1 ('
    || substr(sub.d, 2, 3)
    || ') '
    || substr(sub.d, 5, 3)
    || '-'
    || substr(sub.d, 8, 4)
  else a.phone
end
from (
  select id, regexp_replace(trim(phone), '\D', '', 'g') as d
  from public.crm_accounts
  where phone is not null
    and trim(phone) <> ''
) sub
where a.id = sub.id;

update public.crm_contacts c
set phone = case
  when sub.d ~ '^\d{10}$' then
    '(' || substr(sub.d, 1, 3) || ') ' || substr(sub.d, 4, 3) || '-' || substr(sub.d, 7, 4)
  when sub.d ~ '^1\d{10}$' then
    '+1 ('
    || substr(sub.d, 2, 3)
    || ') '
    || substr(sub.d, 5, 3)
    || '-'
    || substr(sub.d, 8, 4)
  else c.phone
end
from (
  select id, regexp_replace(trim(phone), '\D', '', 'g') as d
  from public.crm_contacts
  where phone is not null
    and trim(phone) <> ''
) sub
where c.id = sub.id;

update public.requests r
set contact_phone = case
  when sub.d ~ '^\d{10}$' then
    '(' || substr(sub.d, 1, 3) || ') ' || substr(sub.d, 4, 3) || '-' || substr(sub.d, 7, 4)
  when sub.d ~ '^1\d{10}$' then
    '+1 ('
    || substr(sub.d, 2, 3)
    || ') '
    || substr(sub.d, 5, 3)
    || '-'
    || substr(sub.d, 8, 4)
  else r.contact_phone
end
from (
  select id, regexp_replace(trim(contact_phone), '\D', '', 'g') as d
  from public.requests
  where contact_phone is not null
    and trim(contact_phone) <> ''
) sub
where r.id = sub.id;
