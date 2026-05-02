export type QuoteStatus = 'Draft' | 'Sent' | 'Awaiting Response' | 'Changes Requested' | 'Approved' | 'Converted';

export const QUOTE_STATUS_OPTIONS: readonly QuoteStatus[] = [
  'Draft',
  'Sent',
  'Awaiting Response',
  'Changes Requested',
  'Approved',
  'Converted',
];

export type ProductService = {
  id: string;
  name: string;
  description: string | null;
  default_unit_price: number | null;
  unit_label: string;
  category: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const QUOTE_DESIGNS = ['editorial', 'technical', 'field', 'statement'] as const;
export type QuoteDesign = typeof QUOTE_DESIGNS[number];

export type QuoteSectionVisibility = {
  header?: boolean;
  parties?: boolean;
  stats_banner?: boolean;
  scope_table?: boolean;
  terms?: boolean;
  summary?: boolean;
  deposit?: boolean;
  accept_block?: boolean;
  footer_quote?: boolean;
  footer_meta?: boolean;
  optional_addons?: boolean;
  /** Invoices only — controls the PAID watermark. Even when status === 'Paid'
   * the user can hide it (e.g. for a clean reprint). Default behavior follows
   * isPaid; setting this to false force-hides, true force-shows. */
  paid_stamp?: boolean;
};

/** Overridable copy for the chosen design. All fields optional — renderer falls back to stock text. */
export type QuoteCustomText = {
  footer_quote?: string;
  accept_heading?: string;
  accept_body?: string;
  issued_by_heading?: string;
  issued_by_body?: string;
  terms_paragraphs?: string[];
  banner_stats?: { label: string; value: string; sub?: string }[];
};

export type QuoteTemplate = {
  id: string;
  name: string;
  introduction_text: string | null;
  contract_text: string | null;
  line_items_json: QuoteLineItemDraft[];
  template_design: QuoteDesign;
  is_default: boolean;
  section_visibility: QuoteSectionVisibility;
  custom_text: QuoteCustomText;
  created_at: string;
  updated_at: string;
};

export type QuoteLineItemDraft = {
  product_service_name: string;
  description: string | null;
  /** Groups consecutive lines under a section heading (Jobber-style). */
  section_title?: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order: number;
};

export type QuoteLineItem = QuoteLineItemDraft & {
  id: string;
  quote_id: string;
  created_at: string;
};

export type CrmProperty = {
  id: string;
  account_id: string;
  address: string;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Quote = {
  id: string;
  account_id: string;
  property_id: string | null;
  quote_number: number;
  title: string;
  status: string;
  salesperson_id: string | null;
  introduction: string | null;
  contract_disclaimer: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  deposit_required: boolean;
  deposit_amount: number | null;
  /** Policy flag only; enforce with Stripe — never store card numbers here. */
  require_payment_method_on_file: boolean;
  /** Non-secret quote-level JSON (import hints, UI, etc.). */
  metadata: Record<string, unknown>;
  approval_token: string | null;
  notes: string | null;
  template_id: string | null;
  template_design: QuoteDesign;
  section_visibility: QuoteSectionVisibility;
  custom_text: QuoteCustomText;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  approved_at: string | null;
  converted_at: string | null;
};

export type QuoteTaxLine = {
  id: string;
  quote_id: string;
  label: string;
  registration_number: string | null;
  rate: number;
  amount: number;
  sort_order: number;
  created_at: string;
};

export type QuoteNote = {
  id: string;
  quote_id: string;
  body: string;
  kind: string;
  extra: Record<string, unknown>;
  created_by_user_id: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteAttachment = {
  id: string;
  quote_id: string;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  storage_path: string;
  attachment_kind: string;
  created_at: string;
  signed_url?: string | null;
};

export type QuoteBundle = {
  quote: Quote;
  line_items: QuoteLineItem[];
  tax_lines: QuoteTaxLine[];
  quote_notes: QuoteNote[];
  quote_attachments: QuoteAttachment[];
  account: { id: string; name: string; company: string | null; phone: string | null; email: string | null } | null;
  property: CrmProperty | null;
};

export type CrmTag = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};
