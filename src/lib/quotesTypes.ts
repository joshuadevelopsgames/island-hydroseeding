export type QuoteStatus = 'Draft' | 'Sent' | 'Awaiting Response' | 'Changes Requested' | 'Approved' | 'Converted';

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
  approval_token: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  approved_at: string | null;
  converted_at: string | null;
};

export type QuoteBundle = {
  quote: Quote;
  line_items: QuoteLineItem[];
  account: { id: string; name: string; company: string | null; phone: string | null; email: string | null } | null;
  property: CrmProperty | null;
};

export type CrmTag = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};
