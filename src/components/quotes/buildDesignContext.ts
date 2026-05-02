import type {
  Quote,
  QuoteBundle,
  QuoteLineItem,
  QuoteLineItemDraft,
  QuoteSectionVisibility,
  QuoteCustomText,
  CrmProperty,
} from '@/lib/quotesTypes';
import type { TenantBrandingApi, ResolvedClientBranding } from '@/lib/tenantBranding';
import { DEFAULT_BRAND_LOGO_URL } from '@/lib/tenantBranding';
import type { DesignContext, TenantBrand } from './designs/types';
import { fmtDate, toDesignItems } from './designs/types';

/** Build a design context from a saved QuoteBundle (used on the public/sent view). */
export function ctxFromBundle(
  bundle: QuoteBundle,
  tenantApi?: TenantBrandingApi,
  branding?: ResolvedClientBranding
): DesignContext {
  const q = bundle.quote;
  const items = toDesignItems(bundle.line_items);
  const subtotal = items.filter((i) => !i.isOptional).reduce((s, i) => s + i.amount, 0);
  const optionalSubtotal = items.filter((i) => i.isOptional).reduce((s, i) => s + i.amount, 0);
  const taxRate = Number(q.tax_rate) || 0.05;
  const taxAmount = Number(q.tax_amount) || subtotal * taxRate;
  const total = Number(q.total) || subtotal + taxAmount;
  const depositAmount = Number(q.deposit_amount) || 0;
  const depositPct = total > 0 ? (depositAmount / total) * 100 : 0;
  const validityDays = computeValidityDays(q);

  return {
    quoteNumber: q.quote_number,
    issuedDate: fmtDate(q.created_at),
    expiresDate: fmtDate(addDays(q.created_at, validityDays)),
    validityDays,
    title: q.title,
    introduction: q.introduction,
    contractDisclaimer: q.contract_disclaimer,
    notes: q.notes,
    account: bundle.account,
    property: bundle.property,
    tenant: tenantBrandFromApi(tenantApi, branding),
    items,
    subtotal,
    optionalSubtotal,
    taxRate,
    taxAmount,
    total,
    depositRequired: Boolean(q.deposit_required),
    depositAmount,
    depositPct,
    isAccepted: Boolean(q.approved_at),
    acceptedSignatureName: q.approved_at ? bundle.account?.name ?? null : null,
    acceptedAt: q.approved_at ? fmtDate(q.approved_at) : null,
    sectionVisibility: (q.section_visibility ?? {}) as QuoteSectionVisibility,
    customText: (q.custom_text ?? {}) as QuoteCustomText,
  };
}

/** Build a design context from in-progress editor state (live preview while filling out the quote). */
export function ctxFromDraft(input: {
  quoteNumber?: string | number;
  title: string;
  introduction: string | null;
  contractDisclaimer: string | null;
  notes?: string | null;
  account: { id: string; name: string; company: string | null; phone: string | null; email: string | null } | null;
  property: CrmProperty | null;
  lineItems: (QuoteLineItem | (QuoteLineItemDraft & { is_optional?: boolean }))[];
  taxRate?: number;
  depositRequired: boolean;
  depositAmount: number;
  sectionVisibility?: QuoteSectionVisibility;
  customText?: QuoteCustomText;
  tenantApi?: TenantBrandingApi;
  branding?: ResolvedClientBranding;
  validityDays?: number;
}): DesignContext {
  const items = toDesignItems(input.lineItems);
  const subtotal = items.filter((i) => !i.isOptional).reduce((s, i) => s + i.amount, 0);
  const optionalSubtotal = items.filter((i) => i.isOptional).reduce((s, i) => s + i.amount, 0);
  const taxRate = input.taxRate ?? 0.05;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;
  const depositAmount = Number(input.depositAmount) || 0;
  const depositPct = total > 0 ? (depositAmount / total) * 100 : 0;
  const validityDays = input.validityDays ?? 30;
  const issuedISO = new Date().toISOString();

  return {
    quoteNumber: input.quoteNumber ?? '—',
    issuedDate: fmtDate(issuedISO),
    expiresDate: fmtDate(addDays(issuedISO, validityDays)),
    validityDays,
    title: input.title,
    introduction: input.introduction,
    contractDisclaimer: input.contractDisclaimer,
    notes: input.notes ?? null,
    account: input.account
      ? {
          name: input.account.name,
          company: input.account.company,
          phone: input.account.phone,
          email: input.account.email,
        }
      : null,
    property: input.property,
    tenant: tenantBrandFromApi(input.tenantApi, input.branding),
    items,
    subtotal,
    optionalSubtotal,
    taxRate,
    taxAmount,
    total,
    depositRequired: input.depositRequired,
    depositAmount,
    depositPct,
    isAccepted: false,
    acceptedSignatureName: null,
    acceptedAt: null,
    sectionVisibility: input.sectionVisibility ?? {},
    customText: input.customText ?? {},
  };
}

function envStr(k: string): string | null {
  const v = ((import.meta.env as Record<string, string | undefined>)[k] ?? '').trim();
  return v || null;
}

function tenantBrandFromApi(
  api: TenantBrandingApi | undefined,
  branding: ResolvedClientBranding | undefined
): TenantBrand {
  return {
    name: branding?.companyName || api?.display_name || 'Your Company',
    tagline: branding?.tagline || api?.public_tagline || null,
    logoUrl:
      branding?.logoUrl?.trim() || api?.public_brand_logo_url?.trim() || DEFAULT_BRAND_LOGO_URL,
    phone: envStr('VITE_TENANT_PHONE'),
    email: envStr('VITE_TENANT_EMAIL') ?? branding?.etransfer ?? null,
    website: envStr('VITE_TENANT_WEBSITE'),
    gstNumber: branding?.gst || api?.public_gst_registration || null,
    wcbNumber: envStr('VITE_TENANT_WCB'),
    footerNote: branding?.footerNote ?? api?.public_footer_note ?? null,
    insurance: envStr('VITE_TENANT_INSURANCE'),
    ownerName: envStr('VITE_TENANT_OWNER_NAME'),
  };
}

function computeValidityDays(q: Quote): number {
  // Simple default; templates may override later via custom_text.
  const meta = q.metadata as Record<string, unknown> | undefined;
  if (meta && typeof meta.validity_days === 'number') return meta.validity_days;
  return 30;
}

function addDays(iso: string | null, days: number): string {
  if (!iso) return new Date(Date.now() + days * 86400_000).toISOString();
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
