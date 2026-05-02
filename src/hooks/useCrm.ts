import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  crmPost,
  fetchCrmAccountBundle,
  fetchCrmAccounts,
  fetchCrmLeadSources,
  importLegacyLeads,
} from '@/lib/crmApi';
import type { CrmAccount, CrmCommLog, LegacyLead } from '@/lib/crmTypes';

export const crmKeys = {
  all: ['crm'] as const,
  accounts: () => [...crmKeys.all, 'accounts'] as const,
  account: (id: string) => [...crmKeys.all, 'account', id] as const,
  leadSources: () => [...crmKeys.all, 'lead_sources'] as const,
};

export function useCrmAccounts() {
  return useQuery({
    queryKey: crmKeys.accounts(),
    queryFn: fetchCrmAccounts,
  });
}

export function useCrmAccountDetail(accountId: string | undefined) {
  return useQuery({
    queryKey: crmKeys.account(accountId ?? ''),
    queryFn: () => fetchCrmAccountBundle(accountId!),
    enabled: Boolean(accountId),
  });
}

export function useCrmLeadSources() {
  return useQuery({
    queryKey: crmKeys.leadSources(),
    queryFn: fetchCrmLeadSources,
  });
}

export function useCrmMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: crmKeys.all });
  };

  const createAccount = useMutation({
    mutationFn: (payload: Record<string, unknown>) => crmPost<{ account: CrmAccount }>({ action: 'account.create', ...payload }),
    onSuccess: invalidate,
  });

  const updateAccount = useMutation({
    mutationFn: (payload: Record<string, unknown>) => crmPost<{ account: CrmAccount }>({ action: 'account.update', ...payload }),
    onSuccess: invalidate,
  });

  const deleteAccount = useMutation({
    mutationFn: (id: string) => crmPost({ action: 'account.delete', id }),
    onSuccess: invalidate,
  });

  const createContact = useMutation({
    mutationFn: (payload: Record<string, unknown>) => crmPost({ action: 'contact.create', ...payload }),
    onSuccess: invalidate,
  });

  const updateContact = useMutation({
    mutationFn: (payload: Record<string, unknown>) => crmPost({ action: 'contact.update', ...payload }),
    onSuccess: invalidate,
  });

  const deleteContact = useMutation({
    mutationFn: (id: string) => crmPost({ action: 'contact.delete', id }),
    onSuccess: invalidate,
  });

  const createProperty = useMutation({
    mutationFn: (payload: Record<string, unknown>) => crmPost({ action: 'property.create', ...payload }),
    onSuccess: invalidate,
  });

  const updateProperty = useMutation({
    mutationFn: (payload: Record<string, unknown>) => crmPost({ action: 'property.update', ...payload }),
    onSuccess: invalidate,
  });

  const setDefaultProperty = useMutation({
    mutationFn: (id: string) => crmPost({ action: 'property.set_default', id }),
    onSuccess: invalidate,
  });

  const deleteProperty = useMutation({
    mutationFn: (id: string) => crmPost({ action: 'property.delete', id }),
    onSuccess: invalidate,
  });

  const createInteraction = useMutation({
    mutationFn: (payload: Record<string, unknown>) => crmPost({ action: 'interaction.create', ...payload }),
    onSuccess: invalidate,
  });

  const deleteInteraction = useMutation({
    mutationFn: (id: string) => crmPost({ action: 'interaction.delete', id }),
    onSuccess: invalidate,
  });

  const createResearchNote = useMutation({
    mutationFn: (payload: Record<string, unknown>) => crmPost({ action: 'research_note.create', ...payload }),
    onSuccess: invalidate,
  });

  const updateResearchNote = useMutation({
    mutationFn: (payload: Record<string, unknown>) => crmPost({ action: 'research_note.update', ...payload }),
    onSuccess: invalidate,
  });

  const deleteResearchNote = useMutation({
    mutationFn: (id: string) => crmPost({ action: 'research_note.delete', id }),
    onSuccess: invalidate,
  });

  const legacyImport = useMutation({
    mutationFn: (leads: LegacyLead[]) => importLegacyLeads(leads),
    onSuccess: invalidate,
  });

  const createLeadSource = useMutation({
    mutationFn: (payload: Record<string, unknown>) => crmPost({ action: 'lead_source.create', ...payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: crmKeys.leadSources() });
      invalidate();
    },
  });

  const createCommLog = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      crmPost<{ comm_log: CrmCommLog }>({ action: 'comm_log.create', ...payload }),
    onSuccess: (_data, vars) => {
      const aid = vars.account_id != null ? String(vars.account_id) : '';
      if (aid) void qc.invalidateQueries({ queryKey: crmKeys.account(aid) });
    },
  });

  return {
    createAccount,
    updateAccount,
    deleteAccount,
    createContact,
    updateContact,
    deleteContact,
    createProperty,
    updateProperty,
    setDefaultProperty,
    deleteProperty,
    createInteraction,
    deleteInteraction,
    createResearchNote,
    updateResearchNote,
    deleteResearchNote,
    legacyImport,
    createLeadSource,
    createCommLog,
  };
}
