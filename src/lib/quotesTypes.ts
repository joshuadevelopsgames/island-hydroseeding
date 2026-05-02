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

export type QuoteTemplate = {
  id: string;
  name: string;
  introduction_text: string | null;
  contract_text: string | null;
  line_items_json: QuoteLineItemDraft[];
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
