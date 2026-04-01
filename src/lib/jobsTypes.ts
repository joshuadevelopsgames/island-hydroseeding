export type JobStatus = 'Active' | 'Late' | 'Requires Invoicing' | 'Completed' | 'Archived';
export type JobType = 'One-off' | 'Recurring';
export type VisitStatus = 'Scheduled' | 'In Progress' | 'Completed' | 'Overdue';

export type Job = {
  id: string;
  account_id: string;
  property_id: string | null;
  quote_id: string | null;
  job_number: number;
  title: string;
  job_type: string;
  status: string;
  billing_frequency: string;
  automatic_payments: boolean;
  start_date: string | null;
  end_date: string | null;
  salesperson_id: string | null;
  total_price: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type JobLineItem = {
  id: string;
  job_id: string;
  product_service_name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order: number;
  created_at: string;
};

export type JobVisit = {
  id: string;
  job_id: string;
  scheduled_at: string;
  completed_at: string | null;
  assigned_to: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type JobExpense = {
  id: string;
  job_id: string;
  description: string;
  amount: number;
  category: string | null;
  receipt_url: string | null;
  created_at: string;
};

export type JobTimeEntry = {
  id: string;
  job_id: string;
  user_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string;
};

export type JobBundle = {
  job: Job;
  line_items: JobLineItem[];
  visits: JobVisit[];
  expenses: JobExpense[];
  time_entries: JobTimeEntry[];
  account: { id: string; name: string; company: string | null; phone: string | null; email: string | null } | null;
  property: { id: string; address: string; city: string | null; province: string | null; postal_code: string | null } | null;
};

// Profitability calc
export type JobProfitability = {
  totalPrice: number;
  lineItemCost: number;
  labourCost: number;
  expensesCost: number;
  profit: number;
  profitMargin: number;
};
