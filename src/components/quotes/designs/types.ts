import type {
  QuoteLineItem,
  QuoteLineItemDraft,
  CrmProperty,
  QuoteSectionVisibility,
  QuoteCustomText,
} from '@/lib/quotesTypes';

/**
 * Read-only data shape every design renderer takes. The QuoteDesignPreview wrapper
 * builds this from the editor's live state (when previewing a draft) or from a
 * persisted QuoteBundle (when rendering a saved/sent quote).
 */
export type DesignContext = {
  // Identifying numbers / dates
  quoteNumber: string | number;
  issuedDate: string;       // formatted ISO short date
  expiresDate: string;      // formatted ISO short date
  validityDays: number;

  // Quote scope
  title: string;
  introduction: string | null;
  contractDisclaimer: string | null;
  notes: string | null;

  // Client + property
  account: { name: string; company: string | null; phone: string | null; email: string | null } | null;
  property: CrmProperty | null;

  // Issuing tenant
  tenant: TenantBrand;

  // Items (read-only render shape)
  items: DesignLineItem[];

  // Money
  subtotal: number;
  optionalSubtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  depositRequired: boolean;
  depositAmount: number;
  depositPct: number;       // 0-100, derived from depositAmount/total

  // Acceptance
  isAccepted: boolean;
  acceptedSignatureName: string | null;
  acceptedAt: string | null;

  // Per-template overrides
  sectionVisibility: QuoteSectionVisibility;
  customText: QuoteCustomText;

  /**
   * When provided, designs render text fields as click-to-edit. Parents
   * (QuoteDetail.CreateQuoteMode and template editor) wire this to update
   * their form state, giving two-way binding between the inputs and preview.
   * Omit on read-only / public views.
   */
  onFieldEdit?: (field: import('./EditableText').EditableField, value: string) => void;
};

export type DesignLineItem = {
  id: string | number;
  code: string;             // synthesized e.g. "L-01"
  description: string;      // primary line label
  detail: string | null;    // sub-detail (often "area" in source designs)
  quantity: number;
  unit: string;             // "ea", "sq ft", etc.
  rate: number;
  amount: number;
  isOptional: boolean;
  /** First row of a section block — render a heading above this line */
  sectionHeading?: string | null;
};

export type TenantBrand = {
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  gstNumber: string | null;
  wcbNumber: string | null;
  footerNote: string | null;
  insurance: string | null;
  ownerName: string | null;
};

// ─────────────────────────────────────────────────────────────
// Helpers shared by all four designs
// ─────────────────────────────────────────────────────────────

export const fmtMoney = (n: number): string =>
  '$' + (Number(n) || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtNum = (n: number): string =>
  (Number(n) || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-CA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
};

export const synthCode = (i: number, prefix = 'L'): string =>
  `${prefix}-${String(i + 1).padStart(2, '0')}`;

/** Show a section unless it's been explicitly disabled. Unknown keys default to true. */
export const isVisible = (sv: QuoteSectionVisibility, key: keyof QuoteSectionVisibility): boolean =>
  sv[key] !== false;

/** Convert a saved or draft line item array into the design renderer's read-only shape. */
export function toDesignItems(
  items: (QuoteLineItem | (QuoteLineItemDraft & { is_optional?: boolean }))[]
): DesignLineItem[] {
  let prevSectionKey = '';
  return items.map((it, i) => {
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.unit_price) || 0;
    const st = (it as QuoteLineItem).section_title;
    const raw = st != null ? String(st).trim() : '';
    const sectionKey = raw;
    const sectionHeading =
      sectionKey && sectionKey !== prevSectionKey ? raw : null;
    if (sectionKey) prevSectionKey = sectionKey;
    return {
      id: 'id' in it && it.id ? it.id : i,
      code: synthCode(i),
      description: it.product_service_name || 'Line item',
      detail: it.description ?? null,
      quantity: qty,
      unit: 'ea',
      rate,
      amount: qty * rate,
      isOptional: 'is_optional' in it ? Boolean((it as { is_optional?: boolean }).is_optional) : false,
      sectionHeading,
    };
  });
}
