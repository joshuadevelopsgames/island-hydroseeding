-- ============================================================
-- Island Hydroseeding — Auth migration
-- Run this in Supabase SQL Editor (Project > SQL Editor > New query)
-- Then register the hook in: Authentication > Hooks > Custom Access Token
-- ============================================================

-- 1. user_permissions table
--    Maps each Supabase auth user to their app-level access.
CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin     BOOLEAN      NOT NULL DEFAULT false,
  allowed_pages TEXT[]      NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Only service-role (server) and the auth hook can touch this table.
-- Authenticated users should never read/write their own permissions directly.
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.user_permissions
  USING (true)
  WITH CHECK (true);

-- 2. Custom Access Token Hook
--    Injects `app_is_admin` and `app_allowed_pages` into every JWT.
--    Register this function in: Authentication > Hooks > Custom Access Token Hook
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims   jsonb;
  perms    record;
BEGIN
  SELECT is_admin, allowed_pages
    INTO perms
    FROM public.user_permissions
   WHERE user_id = (event->>'user_id')::uuid;

  claims := event -> 'claims';

  IF perms IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_is_admin}',       to_jsonb(perms.is_admin));
    claims := jsonb_set(claims, '{app_allowed_pages}',  to_jsonb(perms.allowed_pages));
  ELSE
    -- User exists in auth but has no permissions row — no access until admin grants it
    claims := jsonb_set(claims, '{app_is_admin}',       'false');
    claims := jsonb_set(claims, '{app_allowed_pages}',  '[]'::jsonb);
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant the auth system permission to call the hook
GRANT USAGE  ON SCHEMA public                          TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
GRANT ALL    ON TABLE public.user_permissions          TO supabase_auth_admin;

-- ============================================================
-- After running this SQL:
-- 1. Go to Authentication > Hooks in the Supabase dashboard
-- 2. Enable "Custom Access Token Hook"
-- 3. Select the function: public.custom_access_token_hook
-- 4. Save
--
-- Then create your first admin user:
--   a. Go to Authentication > Users > Invite user
--   b. After they sign up, run:
--      INSERT INTO public.user_permissions (user_id, is_admin, allowed_pages)
--      VALUES ('<uuid>', true, ARRAY[
--        '/', '/crm', '/requests', '/quotes', '/jobs', '/invoices',
--        '/payments', '/schedule', '/time', '/pre-trips', '/documents',
--        '/tasks', '/assets', '/issues', '/fuel', '/equipment', '/inventory'
--      ]);
-- ============================================================
