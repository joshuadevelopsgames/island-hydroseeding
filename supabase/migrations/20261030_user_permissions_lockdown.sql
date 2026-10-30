-- Lock public.user_permissions down to the server.
--
-- 20260401_user_permissions.sql created "service_role_full_access" with no TO
-- clause, so despite the name it applied to every role, anon and authenticated
-- included. Combined with Supabase's default table grants, anyone holding the
-- public anon key could read and rewrite this table, and a signed-in user could
-- give themselves is_admin = true. custom_access_token_hook copies that row into
-- the JWT claims api/_auth.ts trusts.
--
-- Nothing depends on the policy:
--   - The api/*.ts routes use the service role, which has BYPASSRLS.
--   - custom_access_token_hook is SECURITY DEFINER and runs as the table owner,
--     and RLS does not apply to a table's owner unless FORCE ROW LEVEL SECURITY
--     is set. It isn't.
--   - The ON DELETE CASCADE from auth.users runs as the table owner too, and
--     referential actions skip RLS.
--
-- RLS stays enabled with no policies, the same pattern as every other table in
-- public. Safe to run more than once.
--
-- Filename: a 028_ prefix would sort before 20260401_ and run before this table
-- exists, so this uses a later date prefix instead.

-- Stop before changing anything if the hook or the API would lose access. A hook
-- that can't read this table issues every user an empty, non-admin JWT, and the
-- app then has no admin left to fix it.
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_roles owner on owner.oid = p.proowner
    join pg_class t on t.oid = 'public.user_permissions'::regclass
    where p.oid = to_regprocedure('public.custom_access_token_hook(jsonb)')
      and p.prosecdef
      and (
        owner.rolsuper
        or owner.rolbypassrls
        or (p.proowner = t.relowner and not t.relforcerowsecurity)
      )
  ) then
    raise exception 'custom_access_token_hook would not be able to read user_permissions without the policy; no changes made';
  end if;

  if not exists (
    select 1 from pg_roles where rolname = 'service_role' and rolbypassrls
  ) then
    raise exception 'service_role does not have BYPASSRLS, so /api/team would lose access; no changes made';
  end if;
end $$;

drop policy if exists "service_role_full_access" on public.user_permissions;

revoke all on table public.user_permissions from anon, authenticated, public;

grant select, insert, update, delete on table public.user_permissions to service_role;
