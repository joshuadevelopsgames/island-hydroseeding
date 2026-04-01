export type InvoiceStatus = 'Draft' | 'Sent' | 'Viewed' | 'Paid' | 'Overdue' | 'Bad Debt';

export type Invoice = {
  id: string;
  account_id: string | null;
  property_id: string | null;
  job_id: string | null;
  quote_id: string | null;
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
  notes: string | null;
  payment_terms: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceLineItem = {
  id: string;
  invoice_id: string;
  product_service_name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order: number;
  created_at: string;
};

export type InvoicePayment = {
  id: string;
  invoice_id: string;
  amount: number;
  payment_method: string | null;
  payment_date: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
};

export type InvoiceBundle = {
  invoice: Invoice;
  line_items: InvoiceLineItem[];
  payments: InvoicePayment[];
  account: { id: string; name: string; company: string | null; phone: string | null; email: string | null } | null;
  property: { id: string; address: string; city: string | null; province: string | null; postal_code: string | null } | null;
};
