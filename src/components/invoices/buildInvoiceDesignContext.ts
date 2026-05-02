import type { InvoiceBundle, InvoiceLineItem } from '@/lib/invoicesTypes';
import type { CrmProperty, QuoteSectionVisibility, QuoteCustomText } from '@/lib/quotesTypes';
import type { TenantBrandingApi, ResolvedClientBranding } from '@/lib/tenantBranding';
import { fmtDate, toDesignItems, type TenantBrand } from '@/components/quotes/designs/types';
import type { InvoiceDesignContext } from './designs/types';

export function ctxFromInvoiceBundle(
  bundle: InvoiceBundle,
  tenantApi?: TenantBrandingApi,
  branding?: ResolvedClientBranding
): InvoiceDesignContext {
  const inv = bundle.invoice;
  const items = toDesignItems(bundle.line_items);
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const taxRate = Number(inv.tax_rate) || 0.05;
  const taxAmount = Number(inv.tax_amount) || subtotal * taxRate;
  const total = Number(inv.total) || subtotal + taxAmount;
  const amountPaid = Number(inv.amount_paid) || 0;
  const balanceDue = Number(inv.balance_due) || total - amountPaid;
  const dueIso = inv.due_date;
  const isOverdue = !inv.amount_paid || amountPaid < total
    ? Boolean(dueIso && new Date(dueIso) < new Date())
    : false;

  return {
    invoiceNumber: inv.invoice_number,
    issueDate: fmtDate(inv.issue_date),
    dueDate: fmtDate(inv.due_date),
    paymentTerms: inv.payment_terms || 'Net 30',
    title: inv.title || 'Invoice',
    notes: inv.notes,
    introduction: null,
    contractDisclaimer: null,
    account: bundle.account,
    property: bundle.property
      ? ({
          id: bundle.property.id,
          account_id: '',
          address: bundle.property.address,
          city: bundle.property.city,
          province: bundle.property.province,
          postal_code: bundle.property.postal_code,
          notes: null,
          created_at: '',
          updated_at: '',
        } as CrmProperty)
      : null,
    tenant: tenantBrandFromApi(tenantApi, branding),
    items,
    subtotal,
    taxRate,
    taxAmount,
    total,
    amountPaid,
    balanceDue,
    status: inv.status,
    isPaid: inv.status === 'Paid' || balanceDue <= 0.01,
    isOverdue,
    sectionVisibility: (inv.section_visibility ?? {}) as QuoteSectionVisibility,
    customText: (inv.custom_text ?? {}) as QuoteCustomText,
  };
}

export function ctxFromInvoiceDraft(input: {
  invoiceNumber?: string | number;
  title: string | null;
  notes?: string | null;
  account: { id: string; name: string; company: string | null; phone: string | null; email: string | null } | null;
  property: CrmProperty | null;
  lineItems: (InvoiceLineItem | { product_service_name: string; description: string | null; quantity: number; unit_price: number; sort_order: number })[];
  taxRate?: number;
  amountPaid?: number;
  paymentTerms?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  status?: string;
  sectionVisibility?: QuoteSectionVisibility;
  customText?: QuoteCustomText;
  tenantApi?: TenantBrandingApi;
  branding?: ResolvedClientBranding;
}): InvoiceDesignContext {
  const items = toDesignItems(
    input.lineItems as Parameters<typeof toDesignItems>[0]
  );
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const taxRate = input.taxRate ?? 0.05;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;
  const amountPaid = Number(input.amountPaid) || 0;
  const balanceDue = total - amountPaid;
  const issuedISO = input.issueDate || new Date().toISOString();
  const dueISO = input.dueDate || addDays(issuedISO, 30);
  const isOverdue = balanceDue > 0.01 && new Date(dueISO) < new Date();

  return {
    invoiceNumber: input.invoiceNumber ?? '—',
    issueDate: fmtDate(issuedISO),
    dueDate: fmtDate(dueISO),
    paymentTerms: input.paymentTerms || 'Net 30',
    title: input.title || 'Invoice',
    notes: input.notes ?? null,
    introduction: null,
    contractDisclaimer: null,
    account: input.account
      ? { name: input.account.name, company: input.account.company, phone: input.account.phone, email: input.account.email }
      : null,
    property: input.property,
    tenant: tenantBrandFromApi(input.tenantApi, input.branding),
    items,
    subtotal,
    taxRate,
    taxAmount,
    total,
    amountPaid,
    balanceDue,
    status: input.status ?? 'Draft',
    isPaid: input.status === 'Paid' || balanceDue <= 0.01,
    isOverdue,
    sectionVisibility: input.sectionVisibility ?? {},
    customText: input.customText ?? {},
  };
}

function envStr(k: string): string | null {
  const v = ((import.meta.env as Record<string, string | undefined>)[k] ?? '').trim();
  return v || null;
}

function tenantBrandFromApi(api: TenantBrandingApi | undefined, branding: ResolvedClientBranding | undefined): TenantBrand {
  return {
    name: branding?.companyName || api?.display_name || 'Your Company',
    tagline: branding?.tagline || api?.public_tagline || null,
    logoUrl: branding?.logoUrl ?? api?.public_brand_logo_url ?? null,
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

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
