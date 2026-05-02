import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchQuotes,
  fetchQuoteBundle,
  quotesPost,
  fetchProducts,
  fetchTemplates,
  fetchAccountProperties,
  productsPost,
} from '@/lib/quotesApi';
import { isOfflineQueuedError } from '@/lib/offlineMutationQueue';
import type { Quote, QuoteTemplate } from '@/lib/quotesTypes';
import type { Invoice } from '@/lib/invoicesTypes';
import { invoicesKeys } from '@/hooks/useInvoices';

function offlineQueuedSettled(invalidate: () => void) {
  return (_data: unknown, error: unknown) => {
    if (error && isOfflineQueuedError(error)) {
      toast.success('Saved offline — will sync when you reconnect');
      invalidate();
    }
  };
}

export const quotesKeys = {
  all: ['quotes'] as const,
  list: () => [...quotesKeys.all, 'list'] as const,
  detail: (id: string) => [...quotesKeys.all, 'detail', id] as const,
  products: () => ['products'] as const,
  templates: () => ['quote-templates'] as const,
  properties: (accountId: string) => ['properties', accountId] as const,
};

export function useQuotes() {
  return useQuery({
    queryKey: quotesKeys.list(),
    queryFn: fetchQuotes,
  });
}

export function useQuoteDetail(quoteId: string | undefined) {
  return useQuery({
    queryKey: quotesKeys.detail(quoteId ?? ''),
    queryFn: () => fetchQuoteBundle(quoteId!),
    enabled: Boolean(quoteId),
  });
}

export function useProducts() {
  return useQuery({
    queryKey: quotesKeys.products(),
    queryFn: fetchProducts,
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: quotesKeys.templates(),
    queryFn: fetchTemplates,
  });
}

export function useAccountProperties(accountId: string | undefined) {
  return useQuery({
    queryKey: quotesKeys.properties(accountId ?? ''),
    queryFn: () => fetchAccountProperties(accountId!),
    enabled: Boolean(accountId),
  });
}

export function useQuotesMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: quotesKeys.all });
  };

  const createQuote = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      quotesPost<{ quote: Quote }>({ action: 'quote.create', ...payload }),
    onSuccess: invalidate,
    onSettled: offlineQueuedSettled(invalidate),
  });

  const updateQuote = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      quotesPost<{ quote: Quote }>({ action: 'quote.update', ...payload }),
    onSuccess: invalidate,
    onSettled: offlineQueuedSettled(invalidate),
  });

  const deleteQuote = useMutation({
    mutationFn: (id: string) => quotesPost({ action: 'quote.delete', id }),
    onSuccess: invalidate,
    onSettled: offlineQueuedSettled(invalidate),
  });

  const createLineItem = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      quotesPost({ action: 'line_item.create', ...payload }),
    onSuccess: invalidate,
    onSettled: offlineQueuedSettled(invalidate),
  });

  const updateLineItem = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      quotesPost({ action: 'line_item.update', ...payload }),
    onSuccess: invalidate,
    onSettled: offlineQueuedSettled(invalidate),
  });

  const deleteLineItem = useMutation({
    mutationFn: (id: string) => quotesPost({ action: 'line_item.delete', id }),
    onSuccess: invalidate,
    onSettled: offlineQueuedSettled(invalidate),
  });

  const sendQuote = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      quotesPost<{ quote: Quote }>({ action: 'quote.send', ...payload }),
    onSuccess: invalidate,
    onSettled: offlineQueuedSettled(invalidate),
  });

  const convertQuote = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      quotesPost<{ quote: Quote }>({ action: 'quote.convert_to_job', ...payload }),
    onSuccess: invalidate,
    onSettled: offlineQueuedSettled(invalidate),
  });

  const invalidateQuotesAndInvoices = () => {
    invalidate();
    void qc.invalidateQueries({ queryKey: invoicesKeys.all });
  };

  const convertQuoteToInvoice = useMutation({
    mutationFn: (quoteId: string) =>
      quotesPost<{ invoice: Invoice }>({ action: 'quote.convert_to_invoice', quote_id: quoteId }),
    onSuccess: invalidateQuotesAndInvoices,
    onSettled: offlineQueuedSettled(invalidateQuotesAndInvoices),
  });

  return {
    createQuote,
    updateQuote,
    deleteQuote,
    createLineItem,
    updateLineItem,
    deleteLineItem,
    sendQuote,
    convertQuote,
    convertQuoteToInvoice,
  };
}

export function useTemplateMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: quotesKeys.templates() });
  };

  const createTemplate = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      productsPost<{ template: QuoteTemplate }>({ action: 'template.create', ...payload }),
    onSuccess: invalidate,
    onSettled: offlineQueuedSettled(invalidate),
  });

  const updateTemplate = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      productsPost<{ template: QuoteTemplate }>({ action: 'template.update', ...payload }),
    onSuccess: invalidate,
    onSettled: offlineQueuedSettled(invalidate),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) =>
      productsPost({ action: 'template.delete', id }),
    onSuccess: invalidate,
    onSettled: offlineQueuedSettled(invalidate),
  });

  const setDefaultTemplate = useMutation({
    mutationFn: (id: string) =>
      productsPost<{ template: QuoteTemplate }>({ action: 'template.set_default', id }),
    onSuccess: invalidate,
    onSettled: offlineQueuedSettled(invalidate),
  });

  return { createTemplate, updateTemplate, deleteTemplate, setDefaultTemplate };
}
