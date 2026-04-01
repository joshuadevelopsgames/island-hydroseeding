import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Download, Loader2, Search } from 'lucide-react';
import { MorphingPlusX } from '@/components/MorphingPlusX';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { crmKeys, useCrmAccounts, useCrmMutations } from '@/hooks/useCrm';
import { formatErrorForUi, importLegacyLeads as postLegacyLeads } from '@/lib/crmApi';
import { formatInVancouver } from '@/lib/vancouverTime';
import type { CrmAccountStatus, CrmAccountType, LegacyLead } from '@/lib/crmTypes';

const LEGACY_LEADS_KEY = 'crmLeads';

function accountsToCsv(accounts: { name: string; company: string | null; account_type: string; status: string; phone: string | null; email: string | null; address: string | null; notes: string | null }[]) {
  const headers = ['name', 'company', 'account_type', 'status', 'phone', 'email', 'address', 'notes'];
  const escape = (v: string | null | undefined) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const a of accounts) {
    lines.push(headers.map((h) => escape(a[h as keyof typeof a] as string | null)).join(','));
  }
  return lines.join('\n');
}

function statusBadge(status: string) {
  const s = status as CrmAccountStatus;
  const map: Partial<Record<CrmAccountStatus, 'default' | 'secondary' | 'outline'>> = {
    'New Lead': 'outline',
    Contacted: 'secondary',
    'Estimate Sent': 'secondary',
    'Won / Closed': 'default',
    Lost: 'outline',
  };
  return <Badge variant={map[s] ?? 'secondary'}>{status}</Badge>;
}

export default function CRM() {
  const qc = useQueryClient();
  const { data: accounts = [], isLoading, isError, error, refetch } = useCrmAccounts();
  const m = useCrmMutations();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const legacyDone = useRef(false);

  useEffect(() => {
    if (legacyDone.current) return;
    legacyDone.current = true;
    let cancelled = false;
    void (async () => {
      const raw = localStorage.getItem(LEGACY_LEADS_KEY);
      if (!raw) return;
      try {
        const leads = JSON.parse(raw) as LegacyLead[];
        if (!Array.isArray(leads) || leads.length === 0) return;
        await postLegacyLeads(leads);
        if (cancelled) return;
        localStorage.removeItem(LEGACY_LEADS_KEY);
        void qc.invalidateQueries({ queryKey: crmKeys.accounts() });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qc]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.company ?? '').toLowerCase().includes(q) ||
        (a.email ?? '').toLowerCase().includes(q) ||
        (a.phone ?? '').toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const exportCsv = () => {
    const blob = new Blob([accountsToCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm-accounts-${formatInVancouver(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <p className="page-kicker">Sales</p>
      <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="mb-2 flex items-center gap-2">
            <Building2 size={28} aria-hidden className="shrink-0 text-[var(--primary-green)]" />
            Accounts &amp; CRM
          </h1>
          <p className="text-secondary mb-0">Accounts with contacts, interaction timeline, and research notes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={filtered.length === 0}
            onClick={exportCsv}
          >
            <Download size={16} aria-hidden /> Export
          </button>
          <button
            type="button"
            className="btn btn-primary page-toolbar__cta"
            aria-expanded={createOpen}
            onClick={() => setCreateOpen((v) => !v)}
          >
            <MorphingPlusX isOpen={createOpen} size={16} />
            {createOpen ? 'Close' : 'New account'}
          </button>
        </div>
      </div>

      {isError && (
        <div className="card mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="min-w-0 max-w-full break-words text-sm">
            <span className="font-semibold text-[var(--color-danger)]">{formatErrorForUi(error)}</span>{' '}
            <span className="text-secondary">
              Deploy with Supabase + run migration 002, or use{' '}
              <code className="whitespace-normal break-all rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-xs">
                vercel dev
              </code>{' '}
              for local API.
            </span>
          </p>
          <button type="button" className="btn btn-secondary shrink-0" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      )}

      <div className="card min-w-0 overflow-hidden p-0">
        <div className="flex flex-col gap-4 border-b border-[var(--border-color)] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="mb-1 flex items-center gap-2 text-[1.125rem] font-semibold">
              <Building2 size={20} aria-hidden className="shrink-0 text-[var(--primary-green)]" />
              Accounts
            </h3>
            <p className="mb-0 text-sm text-secondary">
              {isLoading ? 'Loading counts…' : `${filtered.length} shown · ${accounts.length} total`}
            </p>
          </div>
          <div className="relative w-full min-w-0 sm:max-w-xs">
            <Search
              size={18}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              type="search"
              className="w-full pl-10"
              placeholder="Search name, company, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search accounts"
            />
          </div>
        </div>

        <div className="max-h-[min(60vh,520px)] overflow-y-auto">
          <div className="divide-y divide-[var(--border-color)]">
            {isLoading && accounts.length === 0 && (
              <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-secondary">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                <span>Loading accounts…</span>
              </div>
            )}
            {filtered.map((a) => (
              <Link
                key={a.id}
                to={`/crm/accounts/${a.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-[var(--surface-hover)]"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{a.name}</p>
                  {(a.company || a.email || a.phone) && (
                    <p className="mt-0.5 truncate text-sm text-secondary">
                      {[a.company, a.phone, a.email].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{a.account_type}</Badge>
                  {statusBadge(a.status)}
                </div>
              </Link>
            ))}
            {!isLoading && filtered.length === 0 && (
              <div className="px-6 py-16 text-center text-sm text-secondary">
                {accounts.length === 0 ? 'No accounts yet. Create one with New account.' : 'No accounts match your search.'}
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateAccountDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={(payload) => m.createAccount.mutateAsync(payload)} />
    </div>
  );
}

function CreateAccountDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (p: Record<string, unknown>) => Promise<unknown>;
}) {
  const [type, setType] = useState<CrmAccountType>('Residential');
  const [status, setStatus] = useState<CrmAccountStatus>('New Lead');
  const [pending, setPending] = useState(false);

  const submit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    try {
      await onCreate({
        name: String(fd.get('name') ?? '').trim(),
        company: String(fd.get('company') ?? '').trim() || null,
        account_type: type,
        status,
        marketing_source: String(fd.get('marketing_source') ?? '') || null,
        phone: String(fd.get('phone') ?? '').trim() || null,
        email: String(fd.get('email') ?? '').trim() || null,
        address: String(fd.get('address') ?? '').trim() || null,
        notes: String(fd.get('notes') ?? '') || null,
      });
      onOpenChange(false);
      e.currentTarget.reset();
      setType('Residential');
      setStatus('New Lead');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
          <DialogDescription>Add a company or property account. You can attach contacts on the next screen.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="acc-name">Account name *</Label>
              <Input id="acc-name" name="name" required placeholder="Display name" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="acc-company">Company / property</Label>
              <Input id="acc-company" name="company" placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <select
                className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-color)] px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as CrmAccountType)}
              >
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
                <option value="Municipal">Municipal</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <select
                className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-color)] px-3 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as CrmAccountStatus)}
              >
                <option>New Lead</option>
                <option>Contacted</option>
                <option>Estimate Sent</option>
                <option>Won / Closed</option>
                <option>Lost</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-phone">Phone</Label>
              <Input id="acc-phone" name="phone" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-email">Email</Label>
              <Input id="acc-email" name="email" type="email" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="acc-addr">Address</Label>
              <Input id="acc-addr" name="address" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="acc-src">Marketing source</Label>
              <Input id="acc-src" name="marketing_source" placeholder="Referral, web, etc." />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="acc-notes">Notes</Label>
              <Textarea id="acc-notes" name="notes" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <button type="button" className="btn btn-secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? 'Saving…' : 'Create'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
