export type CrmAccountType = 'Residential' | 'Commercial' | 'Municipal';

export type CrmAccountStatus =
  | 'New Lead'
  | 'Contacted'
  | 'Estimate Sent'
  | 'Won / Closed'
  | 'Lost';

export type CrmAccount = {
  id: string;
  name: string;
  company: string | null;
  account_type: string;
  status: string;
  marketing_source: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmContact = {
  id: string;
  account_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmInteractionKind =
  | 'call'
  | 'email'
  | 'meeting'
  | 'note'
  | 'linkedin'
  | 'site_visit'
  | 'other';

export type CrmInteraction = {
  id: string;
  account_id: string;
  kind: string;
  summary: string;
  detail: string | null;
  occurred_at: string;
  created_by_user_id: string | null;
  created_at: string;
};

export type CrmResearchNote = {
  id: string;
  account_id: string;
  title: string | null;
  body: string;
  source_url: string | null;
  created_at: string;
  updated_at: string;
};

export type LegacyLead = {
  id: string;
  name: string;
  company: string;
  type: string;
  status: string;
  contact: string;
  marketingSource: string;
  lastContacted: string;
  notes: string;
};
