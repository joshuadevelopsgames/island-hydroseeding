export type CrmAccountType = 'Residential' | 'Commercial' | 'Municipal';

export type CrmAccountStatus =
  | 'New Lead'
  | 'Contacted'
  | 'Estimate Sent'
  | 'Won / Closed'
  | 'Lost';

export type AccountLifecycle = 'Lead' | 'Active' | 'Inactive' | 'Archived';

export type CrmTag = {
  id: string;
  name: string;
  color: string | null;
};

export type CrmLeadSource = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type CrmAccount = {
  id: string;
  name: string;
  company: string | null;
  account_type: string;
  status: string;
  account_lifecycle?: AccountLifecycle;
  marketing_source: string | null;
  lead_source_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Sum of invoice amount_paid (Phase 2) */
  lifetime_value?: number;
  /** Sum of invoice balance_due */
  current_balance?: number;
  tags?: CrmTag[];
  lead_source_name?: string | null;
  /** Stripe Customer on the Connect account (card on file). */
  stripe_customer_id?: string | null;
};

export type CrmContactTier = 'primary' | 'secondary' | 'tertiary' | 'other';

export const CRM_CONTACT_TIER_RANK: Record<CrmContactTier, number> = {
  primary: 0,
  secondary: 1,
  tertiary: 2,
  other: 3,
};

export type CrmContact = {
  id: string;
  account_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  tier: CrmContactTier;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmProperty = {
  id: string;
  account_id: string;
  label: string | null;
  address: string;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  is_default: boolean;
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

export type CrmCommLogKind = 'email' | 'sms' | 'call';

export type CrmCommLog = {
  id: string;
  tenant_id: string;
  account_id: string | null;
  contact_id: string | null;
  property_id: string | null;
  kind: CrmCommLogKind | string;
  direction: string;
  subject: string | null;
  body: string | null;
  sent_by: string | null;
  sent_at: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  status: string | null;
  created_at: string;
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
