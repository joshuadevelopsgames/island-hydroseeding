import InvoiceDesignPreview from './InvoiceDesignPreview';
import type { InvoiceDesignContext } from './designs/types';
import { fmtDate as fmtDateShort, toDesignItems, type TenantBrand } from '@/components/quotes/designs/types';
import {
  QUOTE_DESIGNS,
  type QuoteDesign,
  type QuoteSectionVisibility,
  type QuoteCustomText,
} from '@/lib/quotesTypes';
import type { ResolvedClientBranding } from '@/lib/tenantBranding';

/**
 * Public-invoice payload from /api/stripe?action=invoice_by_token. Kept
 * loose-typed since this component is reached without auth and the source
 * type is defined on the page itself.
 */
type PublicInvoiceShape = {
  invoice_number: number;
  title: string | null;
  status: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  payment_terms: string | null;
  notes: string | null;
  template_design?: string | null;
  section_visibility?: Record<string, boolean> | null;
  custom_text?: Record<string, unknown> | null;
};

type Props = {
  invoice: PublicInvoiceShape;
  lineItems: Array<{
    id: string;
    product_service_name: string;
    description: string | null;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  account: { name: string; company: string | null; email: string | null; phone: string | null } | null;
  property: { address: string; city: string | null; province: string | null; postal_code: string | null } | null;
  branding: ResolvedClientBranding;
  isOverdue: boolean;
};

function tenantBrandFromBranding(b: ResolvedClientBranding): TenantBrand {
  const env = (k: string): string | null => {
    const v = ((import.meta.env as Record<string, string | undefined>)[k] ?? '').trim();
    return v || null;
  };
  return {
    name: b.companyName,
    tagline: b.tagline,
    logoUrl: b.logoUrl,
    phone: env('VITE_TENANT_PHONE'),
    email: env('VITE_TENANT_EMAIL') ?? b.etransfer ?? null,
    website: env('VITE_TENANT_WEBSITE'),
    gstNumber: b.gst || null,
    wcbNumber: env('VITE_TENANT_WCB'),
    footerNote: b.footerNote,
    insurance: env('VITE_TENANT_INSURANCE'),
    ownerName: env('VITE_TENANT_OWNER_NAME'),
  };
}

export default function InvoicePayDesignBlock({
  invoice,
  lineItems,
  account,
  property,
  branding,
  isOverdue,
}: Props) {
  const designSlug = (invoice.template_design ?? 'editorial') as QuoteDesign;
  const design: QuoteDesign = (QUOTE_DESIGNS as readonly string[]).includes(designSlug)
    ? designSlug
    : 'editorial';

  const subtotal = Number(invoice.subtotal) || 0;
  const taxRate = Number(invoice.tax_rate) || 0.05;
  const taxAmount =
    invoice.tax_amount != null && !Number.isNaN(Number(invoice.tax_amount))
      ? Number(invoice.tax_amount)
      : Math.max(0, Number(invoice.total) - subtotal);
  const total = Number(invoice.total) || 0;
  const amountPaid = Number(invoice.amount_paid) || 0;
  const balanceDue = Number(invoice.balance_due) || total - amountPaid;

  const ctx: InvoiceDesignContext = {
    invoiceNumber: invoice.invoice_number,
    issueDate: fmtDateShort(invoice.issue_date),
    dueDate: fmtDateShort(invoice.due_date),
    paymentTerms: invoice.payment_terms || 'Net 30',
    title: invoice.title || 'Invoice',
    notes: invoice.notes,
    introduction: null,
    contractDisclaimer: null,
    account,
    property: property
      ? {
          id: '',
          account_id: '',
          address: property.address,
          city: property.city,
          province: property.province,
          postal_code: property.postal_code,
          notes: null,
          created_at: '',
          updated_at: '',
        }
      : null,
    tenant: tenantBrandFromBranding(branding),
    items: toDesignItems(
      lineItems.map((it, i) => ({
        ...it,
        sort_order: i,
      }))
    ),
    subtotal,
    taxRate,
    taxAmount,
    total,
    amountPaid,
    balanceDue,
    status: invoice.status,
    isPaid: invoice.status === 'Paid' || balanceDue <= 0.01,
    isOverdue,
    sectionVisibility: (invoice.section_visibility ?? {}) as QuoteSectionVisibility,
    customText: (invoice.custom_text ?? {}) as QuoteCustomText,
  };

  return <InvoiceDesignPreview design={design} ctx={ctx} />;
}
