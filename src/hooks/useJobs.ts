import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJobs, fetchJobBundle, jobsPost } from '@/lib/jobsApi';
import type { Job } from '@/lib/jobsTypes';

export const jobsKeys = {
  all: ['jobs'] as const,
  list: () => [...jobsKeys.all, 'list'] as const,
  detail: (id: string) => [...jobsKeys.all, 'detail', id] as const,
};

export function useJobs() {
  return useQuery({
    queryKey: jobsKeys.list(),
    queryFn: fetchJobs,
  });
}

export function useJobDetail(jobId: string | undefined) {
  return useQuery({
    queryKey: jobsKeys.detail(jobId ?? ''),
    queryFn: () => fetchJobBundle(jobId!),
    enabled: Boolean(jobId),
  });
}

export function useJobsMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: jobsKeys.all });
  };

  const createJob = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      jobsPost<{ job: Job }>({ action: 'job.create', ...payload }),
    onSuccess: invalidate,
  });

  const updateJob = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      jobsPost<{ job: Job }>({ action: 'job.update', ...payload }),
    onSuccess: invalidate,
  });

  const deleteJob = useMutation({
    mutationFn: (id: string) => jobsPost({ action: 'job.delete', id }),
    onSuccess: invalidate,
  });

  const createLineItem = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      jobsPost({ action: 'line_item.create', ...payload }),
    onSuccess: invalidate,
  });

  const updateLineItem = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      jobsPost({ action: 'line_item.update', ...payload }),
    onSuccess: invalidate,
  });

  const deleteLineItem = useMutation({
    mutationFn: (id: string) => jobsPost({ action: 'line_item.delete', id }),
    onSuccess: invalidate,
  });

  const createVisit = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      jobsPost({ action: 'visit.create', ...payload }),
    onSuccess: invalidate,
  });

  const updateVisit = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      jobsPost({ action: 'visit.update', ...payload }),
    onSuccess: invalidate,
  });

  const completeVisit = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      jobsPost({ action: 'visit.complete', ...payload }),
    onSuccess: invalidate,
  });

  const createExpense = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      jobsPost({ action: 'expense.create', ...payload }),
    onSuccess: invalidate,
  });

  const deleteExpense = useMutation({
    mutationFn: (id: string) => jobsPost({ action: 'expense.delete', id }),
    onSuccess: invalidate,
  });

  const createTimeEntry = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      jobsPost({ action: 'time_entry.create', ...payload }),
    onSuccess: invalidate,
  });

  const deleteTimeEntry = useMutation({
    mutationFn: (id: string) => jobsPost({ action: 'time_entry.delete', id }),
    onSuccess: invalidate,
  });

  return {
    createJob,
    updateJob,
    deleteJob,
    createLineItem,
    updateLineItem,
    deleteLineItem,
    createVisit,
    updateVisit,
    completeVisit,
    createExpense,
    deleteExpense,
    createTimeEntry,
    deleteTimeEntry,
  };
}
