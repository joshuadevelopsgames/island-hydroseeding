import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchInvoices, fetchInvoiceBundle, invoicesPost } from '@/lib/invoicesApi';
import type { Invoice } from '@/lib/invoicesTypes';

export const invoicesKeys = {
  all: ['invoices'] as const,
  list: () => [...invoicesKeys.all, 'list'] as const,
  detail: (id: string) => [...invoicesKeys.all, 'detail', id] as const,
};

export function useInvoices() {
  return useQuery({
    queryKey: invoicesKeys.list(),
    queryFn: fetchInvoices,
  });
}

export function useInvoiceDetail(invoiceId: string | undefined) {
  return useQuery({
    queryKey: invoicesKeys.detail(invoiceId ?? ''),
    queryFn: () => fetchInvoiceBundle(invoiceId!),
    enabled: Boolean(invoiceId),
  });
}

export function useInvoicesMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: invoicesKeys.all });
  };

  const createInvoice = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      invoicesPost<{ invoice: Invoice }>({ action: 'invoice.create', ...payload }),
    onSuccess: invalidate,
  });

  const updateInvoice = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      invoicesPost<{ invoice: Invoice }>({ action: 'invoice.update', ...payload }),
    onSuccess: invalidate,
  });

  const deleteInvoice = useMutation({
    mutationFn: (id: string) => invoicesPost({ action: 'invoice.delete', id }),
    onSuccess: invalidate,
  });

  const sendInvoice = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      invoicesPost<{ invoice: Invoice }>({ action: 'invoice.send', ...payload }),
    onSuccess: invalidate,
  });

  const markPaid = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      invoicesPost<{ invoice: Invoice }>({ action: 'invoice.mark_paid', ...payload }),
    onSuccess: invalidate,
  });

  const createLineItem = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      invoicesPost({ action: 'line_item.create', ...payload }),
    onSuccess: invalidate,
  });

  const updateLineItem = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      invoicesPost({ action: 'line_item.update', ...payload }),
    onSuccess: invalidate,
  });

  const deleteLineItem = useMutation({
    mutationFn: (id: string) => invoicesPost({ action: 'line_item.delete', id }),
    onSuccess: invalidate,
  });

  const createPayment = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      invoicesPost({ action: 'payment.create', ...payload }),
    onSuccess: invalidate,
  });

  const deletePayment = useMutation({
    mutationFn: (id: string) => invoicesPost({ action: 'payment.delete', id }),
    onSuccess: invalidate,
  });

  const createFromJob = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      invoicesPost<{ invoice: Invoice }>({ action: 'invoice.create_from_job', ...payload }),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  return {
    createInvoice,
    updateInvoice,
    deleteInvoice,
    sendInvoice,
    markPaid,
    createLineItem,
    updateLineItem,
    deleteLineItem,
    createPayment,
    deletePayment,
    createFromJob,
  };
}
