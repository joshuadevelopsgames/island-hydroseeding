import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fetchApprovals, opsPost } from '@/lib/opsApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminApprovalsCard() {
  const { currentUser } = useAuth();
  const qc = useQueryClient();
  const enabled = Boolean(currentUser?.isAdmin);

  const { data: approvals = [] } = useQuery({
    queryKey: ['ops', 'approvals', 'pending'],
    queryFn: () => fetchApprovals('pending'),
    enabled,
    staleTime: 20_000,
  });

  const resolve = useMutation({
    mutationFn: (p: { id: string; status: 'approved' | 'rejected' }) =>
      opsPost<{ approval: unknown }>({
        action: 'approval.resolve',
        id: p.id,
        status: p.status,
        resolved_by: currentUser?.id ?? 'unknown',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ops', 'approvals'] });
    },
  });

  if (!enabled || approvals.length === 0) return null;

  return (
    <Card className="mb-6 border-[var(--border-color)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pending approvals</CardTitle>
        <CardDescription>Resolve workflow requests from the team.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {approvals.map((a) => (
          <div key={a.id} className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--surface-raised)] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-[var(--text-primary)]">{a.title}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {a.resource_type} · {a.resource_id}
                {a.requested_by ? ` · requested by ${a.requested_by}` : ''}
              </p>
              {a.detail && <p className="mt-1 text-sm text-[var(--text-secondary)]">{a.detail}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: a.id, status: 'rejected' })}
              >
                <X className="h-4 w-4" />
                Reject
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: a.id, status: 'approved' })}
              >
                <Check className="h-4 w-4" />
                Approve
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
