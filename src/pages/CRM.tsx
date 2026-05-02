import { useEffect, useMemo, useRef, useState, type FormEventHandler } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, Building2, Download, Loader2, Search } from 'lucide-react';
import { MorphingPlusX } from '@/components/MorphingPlusX';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';
import { formatInVancouver } from '@/lib/vancouverTime';
import { formatPhone, normalizePhoneForSave } from '@/lib/phone';
import type { CrmAccount, CrmAccountStatus, CrmAccountType, LegacyLead } from '@/lib/crmTypes';

const LEGACY_LEADS_KEY = 'crmLeads';

const ACCOUNT_TYPES: CrmAccountType[] = ['Residential', 'Commercial', 'Municipal'];

const PIPELINE_STATUSES: CrmAccountStatus[] = [
  'New Lead',
  'Contacted',
  'Estimate Sent',
  'Won / Closed',
  'Lost',
];

const FILTER_SELECT_CLASS =
  'h-10 min-w-[10rem] shrink-0 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-color)] px-3 text-sm text-[var(--text-primary)]';

type TypeFilter = 'all' | CrmAccountType;
type StatusFilter = 'all' | CrmAccountStatus;
type SortKey = 'name_asc' | 'name_desc' | 'updated_desc' | 'updated_asc' | 'type_asc';

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
  return (
    <Badge variant={map[s] ?? 'secondary'} className="whitespace-nowrap">
      {status}
    </Badge>
  );
}

function typeBadge(type: string) {
  const t = type as CrmAccountType;
  const variantClass: Partial<Record<CrmAccountType, string>> = {
    Residential:
      'border-emerald-700/55 bg-emerald-100 text-emerald-950 dark:border-emerald-400/55 dark:bg-emerald-950 dark:text-emerald-50',
    Commercial:
      'border-sky-700/55 bg-sky-100 text-sky-950 dark:border-sky-400/55 dark:bg-sky-950 dark:text-sky-50',
    Municipal:
      'border-violet-700/55 bg-violet-100 text-violet-950 dark:border-violet-400/55 dark:bg-violet-950 dark:text-violet-50',
  };
  return (
    <Badge
      variant="outline"
      className={cn(
        'whitespace-nowrap text-xs font-semibold',
        variantClass[t] ??
          'border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)]'
      )}
    >
      {type}
    </Badge>
  );
}

function compareUpdated(a: CrmAccount, b: CrmAccount, dir: 1 | -1): number {
  const ta = new Date(a.updated_at).getTime();
  const tb = new Date(b.updated_at).getTime();
  if (ta !== tb) return ta > tb ? dir : -dir;
  return (a.name || '').localeCompare(b.name || '');
}

function sortedAccounts(list: CrmAccount[], sortBy: SortKey): CrmAccount[] {
  const copy = [...list];
  copy.sort((a, b) => {
    switch (sortBy) {
      case 'name_asc':
        return (a.name || '').localeCompare(b.name || '');
      case 'name_desc':
        return (b.name || '').localeCompare(a.name || '');
      case 'updated_desc':
        return compareUpdated(a, b, -1);
      case 'updated_asc':
        return compareUpdated(a, b, 1);
      case 'type_asc':
        return (a.account_type || '').localeCompare(b.account_type || '') || (a.name || '').localeCompare(b.name || '');
      default:
        return 0;
    }
  });
  return copy;
}

export default function CRM() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: accounts = [], isLoading, isError, error, refetch } = useCrmAccounts();
  const m = useCrmMutations();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('name_asc');
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
    let next = accounts;
    if (q) {
      next = next.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.company ?? '').toLowerCase().includes(q) ||
          (a.email ?? '').toLowerCase().includes(q) ||
          (a.phone ?? '').toLowerCase().includes(q)
      );
    }
    if (typeFilter !== 'all') {
      next = next.filter((a) => a.account_type === typeFilter);
    }
    if (statusFilter !== 'all') {
      next = next.filter((a) => a.status === statusFilter);
    }
    return sortedAccounts(next, sortBy);
  }, [accounts, search, typeFilter, statusFilter, sortBy]);

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

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="mb-0.5 flex items-center gap-2 text-lg font-semibold">
            <Building2 size={20} aria-hidden className="shrink-0 text-[var(--primary-green)]" />
            Accounts
          </h2>
          <p className="mb-0 text-sm text-[var(--text-secondary)]">
            {isLoading ? 'Loading counts…' : `${filtered.length} shown · ${accounts.length} total`}
          </p>
        </div>
      </div>

      <Card className="mb-4 min-w-0 overflow-hidden p-4">
        <div className="flex min-w-0 flex-row flex-nowrap items-center gap-3 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="relative min-w-[11rem] max-w-md shrink-0 grow basis-[14rem] sm:max-w-none sm:basis-auto sm:flex-1">
            <Search
              size={18}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <Input
              type="search"
              className="w-full min-w-0 pl-10"
              placeholder="Search name, company, email, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search accounts"
            />
          </div>
          <select
            className={cn(FILTER_SELECT_CLASS, 'shrink-0')}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            aria-label="Filter by account type"
          >
            <option value="all">All types</option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className={cn(FILTER_SELECT_CLASS, 'shrink-0')}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by lead status"
          >
            <option value="all">All statuses</option>
            {PIPELINE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex shrink-0 items-center gap-2">
            <ArrowUpDown size={16} aria-hidden className="shrink-0 text-[var(--text-muted)]" />
            <select
              className={cn(FILTER_SELECT_CLASS, 'min-w-[11rem]', 'shrink-0')}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Sort accounts"
            >
              <option value="name_asc">Sort: Name A–Z</option>
              <option value="name_desc">Sort: Name Z–A</option>
              <option value="updated_desc">Sort: Recently updated</option>
              <option value="updated_asc">Sort: Oldest update</option>
              <option value="type_asc">Sort: Account type</option>
            </select>
          </div>
        </div>
      </Card>

      <Card className="min-w-0 overflow-hidden p-0">
        <div className="max-h-[min(70vh,640px)] overflow-auto">
          {isLoading && accounts.length === 0 ? (
            <div className="flex items-center justify-center gap-3 px-6 py-20 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
              <span>Loading accounts…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-[var(--text-secondary)]">
              {accounts.length === 0
                ? 'No accounts yet. Create one with New account.'
                : 'No accounts match your filters or search.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
                <thead className="sticky top-0 z-[1] border-b border-[var(--border-color)] bg-[var(--surface-raised)]">
                  <tr className="text-left text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-4 py-3 sm:px-6 w-[26%]">Account</th>
                    <th className="px-3 py-3 w-[13%]">Type</th>
                    <th className="px-3 py-3 w-[16%]">Status</th>
                    <th className="px-3 py-3 w-[15%]">Phone</th>
                    <th className="px-3 py-3 min-w-[8rem] w-[22%]">Email</th>
                    <th className="px-4 py-3 text-right sm:px-6 w-[13%]">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)] bg-[var(--surface-color)]">
                  {filtered.map((a) => (
                    <tr
                      key={a.id}
                      tabIndex={0}
                      role="button"
                      onClick={() => navigate(`/crm/accounts/${a.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/crm/accounts/${a.id}`);
                        }
                      }}
                      className="cursor-pointer transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-green)] focus-visible:ring-inset"
                    >
                      <td className="px-4 py-3 sm:px-6 align-middle">
                        <div className="min-w-0 font-medium text-[var(--text-primary)]">{a.name}</div>
                        {a.company ? (
                          <div className="mt-0.5 truncate text-[var(--text-secondary)]">{a.company}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 align-middle">{typeBadge(a.account_type)}</td>
                      <td className="px-3 py-3 align-middle">{statusBadge(a.status)}</td>
                      <td className="px-3 py-3 align-middle text-[var(--text-primary)] whitespace-nowrap">
                        {formatPhone(a.phone) || '—'}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <span className="line-clamp-2 break-all text-[var(--text-secondary)]">
                          {a.email || '—'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-[var(--text-secondary)] sm:px-6 align-middle">
                        {formatInVancouver(a.updated_at, 'MMM d, yyyy')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

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

  const submit: FormEventHandler<HTMLFormElement> = async (e) => {
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
        phone: normalizePhoneForSave(String(fd.get('phone') ?? '')),
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
        <form onSubmit={submit} className="min-w-0 space-y-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-4">
            <div className="flex min-w-0 flex-col gap-2.5 sm:col-span-2">
              <Label htmlFor="acc-name">Account name *</Label>
              <Input id="acc-name" name="name" required placeholder="Display name" />
            </div>
            <div className="flex min-w-0 flex-col gap-2.5 sm:col-span-2">
              <Label htmlFor="acc-company">Company / property</Label>
              <Input id="acc-company" name="company" placeholder="Optional" />
            </div>
            <div className="flex min-w-0 flex-col gap-2.5">
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
            <div className="flex min-w-0 flex-col gap-2.5">
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
            <div className="flex min-w-0 flex-col gap-2.5">
              <Label htmlFor="acc-phone">Phone</Label>
              <Input id="acc-phone" name="phone" />
            </div>
            <div className="flex min-w-0 flex-col gap-2.5">
              <Label htmlFor="acc-email">Email</Label>
              <Input id="acc-email" name="email" type="email" />
            </div>
            <div className="flex min-w-0 flex-col gap-2.5 sm:col-span-2">
              <Label htmlFor="acc-addr">Address</Label>
              <Input id="acc-addr" name="address" />
            </div>
            <div className="flex min-w-0 flex-col gap-2.5 sm:col-span-2">
              <Label htmlFor="acc-src">Marketing source</Label>
              <Input id="acc-src" name="marketing_source" placeholder="Referral, web, etc." />
            </div>
            <div className="flex min-w-0 flex-col gap-2.5 sm:col-span-2">
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
