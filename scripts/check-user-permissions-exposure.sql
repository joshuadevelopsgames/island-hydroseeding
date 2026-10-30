-- Read-only check: is public.user_permissions open to the browser roles?
-- Paste the whole file into the Supabase SQL editor and run it. It changes
-- nothing, and everything comes back in one result grid (the editor only shows
-- the last statement's results). Read the first row, then the rest.
--
-- Run it before 20261030_user_permissions_lockdown.sql to see whether the live
-- database is affected, and again afterwards to confirm the fix.

with target as (
  select c.oid, c.relowner, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  where c.oid = 'public.user_permissions'::regclass
),
grants as (
  select r.rolname, array_agg(pr.priv order by pr.priv) as privs
  from (values ('anon'), ('authenticated')) as r (rolname)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as pr (priv)
  where has_table_privilege(r.rolname, 'public.user_permissions', pr.priv)
  group by r.rolname
),
browser_policies as (
  select *
  from pg_policies
  where schemaname = 'public'
    and tablename = 'user_permissions'
    and permissive = 'PERMISSIVE'
    and roles && array['public', 'anon', 'authenticated']::name[]
),
hook as (
  select
    p.prosecdef,
    owner.rolname as owner_name,
    owner.rolsuper or owner.rolbypassrls
      or (p.proowner = t.relowner and not t.relforcerowsecurity) as reads_without_policy
  from pg_proc p
  join pg_roles owner on owner.oid = p.proowner
  cross join target t
  where p.oid = to_regprocedure('public.custom_access_token_hook(jsonb)')
),
report as (
  -- The answer.
  select 0 as section, 'VERDICT' as item,
    case
      when not exists (select 1 from grants) then 'NOT AFFECTED'
      when not (select relrowsecurity from target) then 'AFFECTED'
      when exists (select 1 from browser_policies) then 'AFFECTED'
      else 'NOT AFFECTED'
    end as status,
    case
      when not exists (select 1 from grants)
        then 'anon and authenticated have no table access'
      when not (select relrowsecurity from target)
        then 'RLS is off and the browser roles have table grants'
      when exists (select 1 from browser_policies)
        then 'The browser roles have table grants and a policy letting them through'
      else 'Grants remain, but no policy lets them through. Still run the migration.'
    end as detail

  -- What the verdict is based on.
  union all
  select 1, 'RLS on user_permissions',
    case when relrowsecurity then 'OK' else 'BAD' end,
    format('enabled=%s, forced=%s', relrowsecurity, relforcerowsecurity)
  from target

  union all
  select 2, 'Grants: ' || r.rolname,
    case when g.privs is null then 'OK' else 'BAD' end,
    coalesce(array_to_string(g.privs, ', '), 'none')
  from (values ('anon'), ('authenticated')) as r (rolname)
  left join grants g using (rolname)

  union all
  select 3, 'Policy: ' || policyname,
    case
      when permissive = 'PERMISSIVE'
        and roles && array['public', 'anon', 'authenticated']::name[] then 'BAD'
      else 'OK'
    end,
    format('roles=%s, cmd=%s, using=%s, check=%s', roles, cmd, qual, with_check)
  from pg_policies
  where schemaname = 'public' and tablename = 'user_permissions'

  -- What the fix relies on. Both must be OK before running the migration.
  union all
  select 4, 'Hook reads the table without the policy',
    case when h.prosecdef and h.reads_without_policy then 'OK' else 'BAD' end,
    format('security_definer=%s, owner=%s', h.prosecdef, h.owner_name)
  from hook h

  union all
  select 4, 'Hook function exists',
    case when exists (select 1 from hook) then 'OK' else 'BAD' end,
    'public.custom_access_token_hook(jsonb)'

  union all
  select 5, 'service_role can bypass RLS and use the table',
    case
      when rolbypassrls
        and has_table_privilege('service_role', 'public.user_permissions', 'SELECT')
        and has_table_privilege('service_role', 'public.user_permissions', 'INSERT')
        and has_table_privilege('service_role', 'public.user_permissions', 'UPDATE')
        and has_table_privilege('service_role', 'public.user_permissions', 'DELETE')
      then 'OK' else 'BAD'
    end,
    format('bypassrls=%s', rolbypassrls)
  from pg_roles
  where rolname = 'service_role'

  -- The same mistake anywhere else.
  union all
  select 6, format('Other policy: %s.%s / %s', schemaname, tablename, policyname),
    'REVIEW',
    format('roles=%s, cmd=%s, using=%s, check=%s', roles, cmd, qual, with_check)
  from pg_policies
  where schemaname in ('public', 'storage')
    and not (schemaname = 'public' and tablename = 'user_permissions')
    and roles && array['public', 'anon', 'authenticated']::name[]

  union all
  select 7, 'RLS off: ' || c.relname, 'BAD',
    'Browser-reachable with no row filtering if the roles have grants'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity

  -- Who holds admin now. If the hole was open, confirm you recognise every row.
  -- updated_at proves nothing: a client that could edit the row could set it too.
  union all
  select 8, 'Admin: ' || coalesce(u.email, p.user_id::text), 'REVIEW',
    format('created=%s, last_sign_in=%s, pages=%s',
      u.created_at::date, u.last_sign_in_at::date, cardinality(p.allowed_pages))
  from public.user_permissions p
  left join auth.users u on u.id = p.user_id
  where p.is_admin
)
select item, status, detail
from report
order by section, item;
