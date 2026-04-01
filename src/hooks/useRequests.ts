import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchRequests, fetchRequestDetail, requestsPost } from '@/lib/requestsApi';
import type { WorkRequest } from '@/lib/requestsTypes';

export const requestsKeys = {
  all: ['requests'] as const,
  list: () => [...requestsKeys.all, 'list'] as const,
  detail: (id: string) => [...requestsKeys.all, 'detail', id] as const,
};

export function useRequests() {
  return useQuery({
    queryKey: requestsKeys.list(),
    queryFn: fetchRequests,
  });
}

export function useRequestDetail(id: string | undefined) {
  return useQuery({
    queryKey: requestsKeys.detail(id ?? ''),
    queryFn: () => fetchRequestDetail(id!),
    enabled: Boolean(id),
  });
}

export function useRequestsMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: requestsKeys.all });
  };

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => requestsPost<{ request: WorkRequest }>({ action: 'request.create', ...payload }),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: (payload: Record<string, unknown>) => requestsPost<{ request: WorkRequest }>({ action: 'request.update', ...payload }),
    onSuccess: invalidate,
  });

  const delete_ = useMutation({
    mutationFn: (id: string) => requestsPost({ action: 'request.delete', id }),
    onSuccess: invalidate,
  });

  const convertToQuote = useMutation({
    mutationFn: (payload: Record<string, unknown>) => requestsPost<{ quote_id: string }>({ action: 'request.convert_to_quote', ...payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: requestsKeys.all });
      void qc.invalidateQueries({ queryKey: ['quotes'] });
    },
  });

  return {
    create,
    update,
    delete: delete_,
    convertToQuote,
  };
}
