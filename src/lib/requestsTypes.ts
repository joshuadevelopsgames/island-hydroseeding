export type RequestStatus = 'New' | 'Assessment Scheduled' | 'Assessment Complete' | 'Converted' | 'Archived';
export type RequestSource = 'website' | 'phone' | 'email' | 'referral' | 'other';

export type WorkRequest = {
  id: string;
  account_id: string | null;
  property_id: string | null;
  title: string | null;
  description: string | null;
  status: string;
  source: string;
  assigned_to: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  requested_at: string;
  converted_at: string | null;
  converted_quote_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
