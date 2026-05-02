/**
 * Default tenant resolution for API routes (phase 1).
 * All authenticated CRM/invoice data is scoped to this tenant until JWT carries `tenant_id`.
 *
 * MUST match the seed row in `supabase/migrations/009_multi_tenancy.sql`.
 * Set `DEFAULT_TENANT_ID` in Vercel env to this UUID (recommended for production).
 */
export const ISLAND_TENANT_ID = 'a3d8e7f1-2b4c-4a21-9e5f-6c0d1e2f3a4b';

export function resolveTenantId(): string {
  const fromEnv = process.env.DEFAULT_TENANT_ID?.trim();
  if (fromEnv) return fromEnv;
  return ISLAND_TENANT_ID;
}
