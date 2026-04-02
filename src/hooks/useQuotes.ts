import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchQuotes,
  fetchQuoteBundle,
  quotesPost,
  fetchProducts,
  fetchTemplates,
  fetchAccountProperties,
  productsPost,
} from '@/lib/quotesApi';
import type { Quote, QuoteTemplate } from '@/lib/quotesTypes';

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
  });

  const updateQuote = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      quotesPost<{ quote: Quote }>({ action: 'quote.update', ...payload }),
    onSuccess: invalidate,
  });

  const deleteQuote = useMutation({
    mutationFn: (id: string) => quotesPost({ action: 'quote.delete', id }),
    onSuccess: invalidate,
  });

  const createLineItem = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      quotesPost({ action: 'line_item.create', ...payload }),
    onSuccess: invalidate,
  });

  const updateLineItem = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      quotesPost({ action: 'line_item.update', ...payload }),
    onSuccess: invalidate,
  });

  const deleteLineItem = useMutation({
    mutationFn: (id: string) => quotesPost({ action: 'line_item.delete', id }),
    onSuccess: invalidate,
  });

  const sendQuote = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      quotesPost<{ quote: Quote }>({ action: 'quote.send', ...payload }),
    onSuccess: invalidate,
  });

  const convertQuote = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      quotesPost<{ quote: Quote }>({ action: 'quote.convert', ...payload }),
    onSuccess: invalidate,
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
  });

  const updateTemplate = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      productsPost<{ template: QuoteTemplate }>({ action: 'template.update', ...payload }),
    onSuccess: invalidate,
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) =>
      productsPost({ action: 'template.delete', id }),
    onSuccess: invalidate,
  });

  return { createTemplate, updateTemplate, deleteTemplate };
}
