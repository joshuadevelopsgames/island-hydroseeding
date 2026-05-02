import type { InvoiceLineItem } from '@/lib/invoicesTypes';
import type { QuoteSectionVisibility, QuoteCustomText, CrmProperty } from '@/lib/quotesTypes';
import type { TenantBrand, DesignLineItem } from '@/components/quotes/designs/types';

/**
 * Read-only data shape every invoice design renderer takes. Mirrors quote DesignContext
 * but with invoice-specific fields (issue/due dates, balance due, payments, status).
 */
export type InvoiceDesignContext = {
  invoiceNumber: string | number;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;

  title: string;
  notes: string | null;
  introduction: string | null;
  contractDisclaimer: string | null;

  account: { name: string; company: string | null; phone: string | null; email: string | null } | null;
  property: CrmProperty | null;

  tenant: TenantBrand;

  items: DesignLineItem[];

  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balanceDue: number;

  status: string;
  isPaid: boolean;
  isOverdue: boolean;

  sectionVisibility: QuoteSectionVisibility;
  customText: QuoteCustomText;
};

export type InvoiceDraftInput = {
  invoiceNumber?: string | number;
  title: string | null;
  notes: string | null;
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
};
