/**
 * Tenant-facing branding (invoices, quotes, /pay) — API shape + env fallbacks.
 */

export type TenantBrandingApi = {
  display_name?: string | null;
  public_tagline?: string | null;
  public_brand_logo_url?: string | null;
  public_etransfer_email?: string | null;
  public_gst_registration?: string | null;
  public_footer_note?: string | null;
};

const COMPANY_NAME = 'Island Hydroseeding Ltd.';

const envStr = (k: string) =>
  ((import.meta.env as Record<string, string | undefined>)[k] ?? '').trim();

export const ETRANSFER_EMAIL_FALLBACK = envStr('VITE_ETRANSFER_EMAIL');
export const INVOICE_LOGO_URL_FALLBACK = envStr('VITE_INVOICE_LOGO_URL');
export const GST_REGISTRATION_FALLBACK = envStr('VITE_GST_REGISTRATION');

export type ResolvedClientBranding = {
  companyName: string;
  tagline: string;
  logoUrl: string | null;
  gst: string;
  etransfer: string;
  footerNote: string | null;
};

export function resolveClientBranding(b: TenantBrandingApi | null | undefined): ResolvedClientBranding {
  return {
    companyName: b?.display_name?.trim() || COMPANY_NAME,
    tagline:
      b?.public_tagline?.trim() || 'Professional Hydroseeding & Site Restoration',
    logoUrl: (b?.public_brand_logo_url?.trim() || INVOICE_LOGO_URL_FALLBACK || null) as string | null,
    gst: b?.public_gst_registration?.trim() || GST_REGISTRATION_FALLBACK || '',
    etransfer: b?.public_etransfer_email?.trim() || ETRANSFER_EMAIL_FALLBACK || '',
    footerNote: b?.public_footer_note?.trim() || null,
  };
}
