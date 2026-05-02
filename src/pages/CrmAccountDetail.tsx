import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { formatInVancouver } from '@/lib/vancouverTime';
import {
  Activity,
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Loader2,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  Upload,
} from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useCrmAccountDetail, useCrmMutations } from '@/hooks/useCrm';
import type { CrmAccountStatus, CrmAccountType } from '@/lib/crmTypes';
import { useAuth } from '@/context/AuthContext';
import { formatErrorForUi } from '@/lib/crmApi';
import { formatPhone, normalizePhoneForSave } from '@/lib/phone';
import {
  deleteAccountAttachment,
  listAccountAttachments,
  uploadAccountAttachment,
  type AccountAttachment,
} from '@/lib/accountAttachments';
import { toast } from 'sonner';
import { fetchJobsForAccount } from '@/lib/jobsApi';
import type { Job } from '@/lib/jobsTypes';
import { fetchQuotesForAccount } from '@/lib/quotesApi';
import type { Quote } from '@/lib/quotesTypes';
import { cn } from '@/lib/utils';

const INTERACTION_KINDS = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'note', label: 'Note' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'site_visit', label: 'Site visit' },
  { value: 'other', label: 'Other' },
] as const;

function relativeShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.floor(d / 7)} weeks ago`;
  return formatInVancouver(iso, 'MMM d, yyyy');
}

function interactionsHistogram(interactions: { occurred_at: string }[], numWeeks = 12) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const oldest = now - numWeeks * weekMs;
  const buckets = Array.from({ length: numWeeks }, () => 0);
  for (const it of interactions) {
    const t = new Date(it.occurred_at).getTime();
    if (t < oldest || t > now) continue;
    const idx = Math.floor((t - oldest) / weekMs);
    if (idx >= 0 && idx < numWeeks) buckets[idx]!++;
  }
  const total = buckets.reduce((a, b) => a + b, 0);
  const last4 = buckets.slice(-4).reduce((a, b) => a + b, 0);
  const prior8 = buckets.slice(0, 8).reduce((a, b) => a + b, 0);
  const avgPrior = prior8 / 8;
  const avgLast = last4 / 4;
  const pctChange =
    avgPrior === 0 ? (last4 > 0 ? 100 : 0) : Math.round(((avgLast - avgPrior) / avgPrior) * 100);
  return { buckets, total, last4, prior8, pctChange };
}

function accountInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

function parseNotesLines(notes: string | null): string[] {
  if (!notes?.trim()) return [];
  return notes
    .split(/\n+/)
    .map((s) => s.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean);
}

function money(n: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n);
}

export default function CrmAccountDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { data, isLoading, isError, error, refetch } = useCrmAccountDetail(accountId);
  const m = useCrmMutations();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState('info');
  const [metricsYear, setMetricsYear] = useState(() => new Date().getFullYear());
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const account = data?.account;

  const [quotesQuery, jobsQuery] = useQueries({
    queries: [
      {
        queryKey: ['quotes', 'list', 'account', accountId] as const,
        queryFn: () => fetchQuotesForAccount(accountId!),
        enabled: Boolean(accountId),
        staleTime: 60_000,
      },
      {
        queryKey: ['jobs', 'list', 'account', accountId] as const,
        queryFn: () => fetchJobsForAccount(accountId!),
        staleTime: 60_000,
        enabled: Boolean(accountId),
      },
    ],
  });

  const accountQuotes = quotesQuery.data ?? [];
  const accountJobs = jobsQuery.data ?? [];

  const sortedInteractions = useMemo(
    () => [...(data?.interactions ?? [])].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)),
    [data?.interactions]
  );

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2, y - 3, y - 4];
  }, []);

  const hist = useMemo(() => interactionsHistogram(sortedInteractions), [sortedInteractions]);

  if (isLoading) {
    return (
      <div className="min-w-0 space-y-6 text-sm text-[var(--text-muted)]">
        <Link to="/crm" className="inline-flex items-center gap-2 font-semibold text-[var(--primary-green)]">
          <ArrowLeft className="h-4 w-4 shrink-0" /> Back
        </Link>
        <div className="flex items-center gap-3 py-12">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
          <span>Loading account…</span>
        </div>
      </div>
    );
  }

  if (isError || !account) {
    return (
      <div className="min-w-0 space-y-4">
        <Link to="/crm" className="inline-flex items-center gap-2 font-semibold text-[var(--primary-green)]">
          <ArrowLeft className="h-4 w-4 shrink-0" /> Back to accounts
        </Link>
        <p className="max-w-full break-words text-sm text-[var(--color-danger)]">{isError ? formatErrorForUi(error) : 'Account not found.'}</p>
        <Button className="mt-3" variant="secondary" type="button" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const confirmDelete = async () => {
    await m.deleteAccount.mutateAsync(account.id);
    setDeleteOpen(false);
    navigate('/crm');
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={deleteOpen}
        title="Delete this account?"
        message="This removes all contacts, interactions, and research notes for this account."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteOpen(false)}
      />

      <div>
        <Link to="/crm" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary-green)]">
          <ArrowLeft className="h-4 w-4" /> Accounts
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 gap-4">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-green)] text-lg font-bold text-white"
              aria-hidden
            >
              {accountInitials(account.name)}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{account.name}</h1>
              {account.company && <p className="mt-0.5 text-sm text-[var(--text-muted)]">{account.company}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {crmStatusPill(account.status)}
                {crmTypeBadge(account.account_type)}
                <span className="font-mono text-xs text-[var(--text-muted)]">ID: {account.id}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <Calendar className="h-4 w-4 shrink-0" />
              <select
                className="h-9 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-color)] px-2 text-sm"
                value={metricsYear}
                onChange={(e) => setMetricsYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => {
                setTab('timeline');
                requestAnimationFrame(() =>
                  document.getElementById('log-interaction-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                );
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Log interaction
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      <EditAccountDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        account={account}
        onSave={(patch) => m.updateAccount.mutateAsync({ id: account.id, ...patch })}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 sm:w-auto">
          <TabsTrigger
            value="info"
            className="rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-[var(--primary-green)] data-[state=active]:bg-transparent"
          >
            Info
          </TabsTrigger>
          <TabsTrigger
            value="contacts"
            className="rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-[var(--primary-green)] data-[state=active]:bg-transparent"
          >
            Contacts
          </TabsTrigger>
          <TabsTrigger
            value="quotes"
            className="rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-[var(--primary-green)] data-[state=active]:bg-transparent"
          >
            Quotes
          </TabsTrigger>
          <TabsTrigger
            value="jobs"
            className="rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-[var(--primary-green)] data-[state=active]:bg-transparent"
          >
            Jobs
          </TabsTrigger>
          <TabsTrigger
            value="timeline"
            className="rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-[var(--primary-green)] data-[state=active]:bg-transparent"
          >
            Timeline
          </TabsTrigger>
          <TabsTrigger
            value="research"
            className="rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-[var(--primary-green)] data-[state=active]:bg-transparent"
          >
            Research
          </TabsTrigger>
          <TabsTrigger
            value="files"
            className="rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-[var(--primary-green)] data-[state=active]:bg-transparent"
          >
            Files
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-6 space-y-6">
          <InfoDashboard
            account={account}
            metricsYear={metricsYear}
            quotes={accountQuotes}
            jobs={accountJobs}
            quotesLoading={quotesQuery.isPending}
            jobsLoading={jobsQuery.isPending}
            interactions={sortedInteractions}
            hist={hist}
            breakdownOpen={breakdownOpen}
            onToggleBreakdown={() => setBreakdownOpen((v) => !v)}
            onEditNotes={() => setEditOpen(true)}
          />
        </TabsContent>
        <TabsContent value="contacts">
          <ContactsTab accountId={account.id} contacts={data?.contacts ?? []} m={m} />
        </TabsContent>
        <TabsContent value="quotes">
          <AccountQuotesTab quotes={accountQuotes} loading={quotesQuery.isPending} />
        </TabsContent>
        <TabsContent value="jobs">
          <AccountJobsTab jobs={accountJobs} loading={jobsQuery.isPending} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineTab
            accountId={account.id}
            interactions={sortedInteractions}
            userId={currentUser?.id ?? null}
            m={m}
          />
        </TabsContent>
        <TabsContent value="research">
          <ResearchTab accountId={account.id} notes={data?.research_notes ?? []} m={m} />
        </TabsContent>
        <TabsContent value="files">
          <FilesTab accountId={account.id} currentUserId={currentUser?.id ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function crmStatusPill(status: string) {
  const s = status as CrmAccountStatus | 'Active';
  const pill = cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
    s === 'Active' && 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100',
    s === 'New Lead' && 'bg-sky-50 text-blue-950 dark:bg-sky-950/45 dark:text-sky-100',
    s === 'Contacted' && 'bg-amber-50 text-amber-900 dark:bg-amber-950/45 dark:text-amber-100',
    s === 'Estimate Sent' && 'bg-violet-50 text-violet-900 dark:bg-violet-950/45 dark:text-violet-100',
    s === 'Won / Closed' && 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950/55 dark:text-emerald-100',
    s === 'Lost' && 'bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-200',
    ![
      'Active',
      'New Lead',
      'Contacted',
      'Estimate Sent',
      'Won / Closed',
      'Lost',
    ].includes(status) &&
      'border border-[var(--border-color)] bg-[var(--surface-raised)] text-[var(--text-secondary)]'
  );
  return (
    <span className={pill}>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current opacity-90" />
      {status}
    </span>
  );
}

function crmTypeBadge(type: string) {
  const t = type as CrmAccountType;
  const variantClass: Partial<Record<CrmAccountType, string>> = {
    Residential:
      'border-emerald-200/90 bg-emerald-50 text-emerald-800 dark:border-emerald-600/35 dark:bg-emerald-950/40 dark:text-emerald-100',
    Commercial:
      'border-sky-200/90 bg-sky-50 text-sky-800 dark:border-sky-600/35 dark:bg-sky-950/40 dark:text-sky-100',
    Municipal:
      'border-violet-200/90 bg-violet-50 text-violet-800 dark:border-violet-600/35 dark:bg-violet-950/40 dark:text-violet-100',
  };
  return (
    <Badge
      variant="outline"
      className={cn(
        'whitespace-nowrap text-xs font-medium',
        variantClass[t] ?? 'border-[var(--border-color)] bg-[var(--surface-raised)] text-[var(--text-secondary)]'
      )}
    >
      {type}
    </Badge>
  );
}

function InfoDashboard({
  account,
  metricsYear,
  quotes,
  jobs,
  quotesLoading,
  jobsLoading,
  interactions,
  hist,
  breakdownOpen,
  onToggleBreakdown,
  onEditNotes,
}: {
  account: NonNullable<ReturnType<typeof useCrmAccountDetail>['data']>['account'];
  metricsYear: number;
  quotes: Quote[];
  jobs: Job[];
  quotesLoading: boolean;
  jobsLoading: boolean;
  interactions: NonNullable<ReturnType<typeof useCrmAccountDetail>['data']>['interactions'];
  hist: ReturnType<typeof interactionsHistogram>;
  breakdownOpen: boolean;
  onToggleBreakdown: () => void;
  onEditNotes: () => void;
}) {
  const metrics = useMemo(() => {
    const y = metricsYear;
    const inYear = (iso: string) => new Date(iso).getFullYear() === y;
    const quotesY = quotes.filter((q) => inYear(q.created_at));
    const nonDraft = (q: Quote) => q.status !== 'Draft';
    const wonQ = (q: Quote) => q.status === 'Approved' || q.status === 'Converted';
    const decided = quotes.filter(nonDraft);
    const wonAll = decided.filter(wonQ);
    const winRate = decided.length ? Math.round((wonAll.length / decided.length) * 1000) / 10 : 0;
    const estValueY = quotesY.reduce((s, q) => s + q.total, 0);
    const jobsY = jobs.filter((j) => inYear(j.created_at));
    const wonJobValueY = jobsY.filter((j) => j.status === 'Completed').reduce((s, j) => s + j.total_price, 0);
    return {
      quotesYCount: quotesY.length,
      quotesTotalCount: quotes.length,
      winRate,
      estValueY,
      wonJobValueY,
      decidedCount: decided.length,
      wonQuoteCount: wonAll.length,
      jobsYCompleted: jobsY.filter((j) => j.status === 'Completed').length,
      jobsYTotal: jobsY.length,
    };
  }, [quotes, jobs, metricsYear]);

  const lastContact = interactions[0]?.occurred_at;
  const maxBar = Math.max(1, ...hist.buckets);
  const momentumLabel =
    hist.pctChange > 0 ? `Heating up +${hist.pctChange}%` : hist.pctChange < 0 ? `Cooling ${hist.pctChange}%` : 'Steady';

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Key dates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-[var(--text-muted)]">Last contact</span>
              <span className="font-medium text-[var(--text-primary)]">
                {lastContact ? relativeShort(lastContact) : '—'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--text-muted)]">Date created</span>
              <span className="font-medium text-[var(--text-primary)]">
                {formatInVancouver(account.created_at, 'MMM d, yyyy')}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--text-muted)]">Created by</span>
              <span className="text-[var(--text-secondary)]">—</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Quotes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {quotesLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <>
                <p className="text-3xl font-bold tabular-nums text-[var(--text-primary)]">{metrics.quotesYCount}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  in {metricsYear} · {metrics.quotesTotalCount} all time
                </p>
                <p className="mt-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  Win rate {metrics.winRate}%
                  <span className="ml-1 font-normal text-[var(--text-muted)]">
                    ({metrics.wonQuoteCount} won / {metrics.decidedCount} sent+)
                  </span>
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Work value
            </CardTitle>
          </CardHeader>
          <CardContent>
            {quotesLoading || jobsLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Quote total ({metricsYear})</p>
                  <p className="text-2xl font-bold tabular-nums">{money(metrics.estValueY)}</p>
                  <p className="text-xs text-[var(--text-muted)]">{metrics.quotesYCount} quotes</p>
                </div>
                <div className="mt-4 border-t border-[var(--border-color)] pt-4">
                  <p className="text-xs text-[var(--text-muted)]">Completed jobs ({metricsYear})</p>
                  <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {money(metrics.wonJobValueY)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {metrics.jobsYCompleted} completed / {metrics.jobsYTotal} jobs
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleBreakdown}
                  className="mt-3 flex items-center gap-1 text-xs font-semibold text-[var(--primary-green)]"
                >
                  {breakdownOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {breakdownOpen ? 'Hide' : 'Show'} calculation breakdown
                </button>
                {breakdownOpen && (
                  <ul className="mt-2 space-y-1 rounded-[var(--radius-sm)] bg-[var(--surface-raised)] p-3 text-xs text-[var(--text-secondary)]">
                    <li>
                      <strong className="text-[var(--text-primary)]">Quote total</strong> sums <code>quote.total</code>{' '}
                      for quotes created in {metricsYear}.
                    </li>
                    <li>
                      <strong className="text-[var(--text-primary)]">Win rate</strong> is won quotes (Approved or
                      Converted) ÷ non-draft quotes.
                    </li>
                    <li>
                      <strong className="text-[var(--text-primary)]">Completed jobs</strong> sums{' '}
                      <code>job.total_price</code> for jobs with status Completed in {metricsYear}.
                    </li>
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Activity className="h-4 w-4 text-[var(--primary-green)]" />
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Account momentum
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end">
            <div className="flex h-[100px] flex-1 items-end gap-1 border-b border-[var(--border-color)] pb-1">
              {hist.buckets.map((n, i) => {
                const barPx = Math.max(4, Math.round((n / maxBar) * 88));
                const isRecent = i >= hist.buckets.length - 4;
                return (
                  <div
                    key={i}
                    className="flex min-w-0 flex-1 flex-col justify-end"
                    title={`Week ${i + 1}: ${n} interaction(s)`}
                  >
                    <div
                      className={cn(
                        'w-full rounded-t transition-colors',
                        isRecent ? 'bg-sky-600 dark:bg-sky-500' : 'bg-sky-200 dark:bg-sky-800/80'
                      )}
                      style={{ height: `${barPx}px` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex shrink-0 flex-col gap-2 text-sm lg:w-52">
              <div className="flex justify-between gap-4">
                <span className="text-[var(--text-muted)]">Total (12w)</span>
                <span className="font-semibold tabular-nums">{hist.total}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[var(--text-muted)]">Last 4w</span>
                <span className="font-semibold tabular-nums">{hist.last4}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[var(--text-muted)]">Prior 8w</span>
                <span className="font-semibold tabular-nums">{hist.prior8}</span>
              </div>
              <span
                className={cn(
                  'inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                  hist.pctChange >= 0
                    ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100'
                    : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                )}
              >
                {momentumLabel}
              </span>
            </div>
          </div>
          <p className="mt-4 text-xs text-[var(--text-muted)]">
            Based on logged interactions (calls, emails, meetings, notes, etc.) in the last 12 weeks.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <AccountNotesCard notes={account.notes} onEdit={onEditNotes} />
        <GeneralInfoCard account={account} />
      </div>
    </>
  );
}

function AccountNotesCard({ notes, onEdit }: { notes: string | null; onEdit: () => void }) {
  const lines = parseNotesLines(notes);
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <StickyNote className="h-4 w-4 text-[var(--text-muted)]" />
          Account notes
        </CardTitle>
        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onEdit}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="flex gap-3 rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100"
          role="status"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200/80 text-amber-900 dark:bg-amber-900/80 dark:text-amber-100">
            !
          </span>
          <p className="pt-0.5 font-medium">Don&apos;t be creepy! Use notes for helpful context only.</p>
        </div>
        {lines.length > 0 ? (
          <ul className="list-disc space-y-2 pl-5 text-sm text-[var(--text-secondary)]">
            {lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">No notes yet. Click Edit to add context for your team.</p>
        )}
      </CardContent>
    </Card>
  );
}

function GeneralInfoCard({
  account,
}: {
  account: NonNullable<ReturnType<typeof useCrmAccountDetail>['data']>['account'];
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">General information</CardTitle>
        <CardDescription>Contact and marketing fields — use Edit to update.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          <span className="font-semibold text-[var(--text-primary)]">Phone</span>
          <br />
          <span className="text-[var(--text-secondary)]">{formatPhone(account.phone) || '—'}</span>
        </p>
        <p>
          <span className="font-semibold text-[var(--text-primary)]">Email</span>
          <br />
          <span className="text-[var(--text-secondary)]">{account.email ?? '—'}</span>
        </p>
        <p>
          <span className="font-semibold text-[var(--text-primary)]">Address</span>
          <br />
          <span className="text-[var(--text-secondary)]">{account.address ?? '—'}</span>
        </p>
        <p>
          <span className="font-semibold text-[var(--text-primary)]">Marketing source</span>
          <br />
          <span className="text-[var(--text-secondary)]">{account.marketing_source ?? '—'}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function AccountQuotesTab({ quotes, loading }: { quotes: Quote[]; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-12 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading quotes…
        </CardContent>
      </Card>
    );
  }
  if (quotes.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-[var(--text-muted)]">No quotes for this account yet.</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quotes</CardTitle>
        <CardDescription>Estimates linked to this account.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border-color)] text-[var(--text-muted)]">
              <th className="pb-2 pr-3 font-medium">#</th>
              <th className="pb-2 pr-3 font-medium">Title</th>
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 pr-3 font-medium">Total</th>
              <th className="pb-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="border-b border-[var(--border-color)]/60">
                <td className="py-2 pr-3 font-mono text-xs">{q.quote_number}</td>
                <td className="py-2 pr-3">
                  <Link className="font-medium text-[var(--primary-green)] hover:underline" to={`/quotes/${q.id}`}>
                    {q.title || 'Untitled'}
                  </Link>
                </td>
                <td className="py-2 pr-3">{q.status}</td>
                <td className="py-2 pr-3 tabular-nums">{money(q.total)}</td>
                <td className="py-2 text-[var(--text-muted)]">{formatInVancouver(q.created_at, 'MMM d, yyyy')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function AccountJobsTab({ jobs, loading }: { jobs: Job[]; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-12 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading jobs…
        </CardContent>
      </Card>
    );
  }
  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-[var(--text-muted)]">No jobs for this account yet.</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Jobs</CardTitle>
        <CardDescription>Work linked to this account.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border-color)] text-[var(--text-muted)]">
              <th className="pb-2 pr-3 font-medium">#</th>
              <th className="pb-2 pr-3 font-medium">Title</th>
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 pr-3 font-medium">Value</th>
              <th className="pb-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-b border-[var(--border-color)]/60">
                <td className="py-2 pr-3 font-mono text-xs">{j.job_number}</td>
                <td className="py-2 pr-3">
                  <Link className="font-medium text-[var(--primary-green)] hover:underline" to={`/jobs/${j.id}`}>
                    {j.title || 'Untitled'}
                  </Link>
                </td>
                <td className="py-2 pr-3">{j.status}</td>
                <td className="py-2 pr-3 tabular-nums">{money(j.total_price)}</td>
                <td className="py-2 text-[var(--text-muted)]">{formatInVancouver(j.created_at, 'MMM d, yyyy')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ContactsTab({
  accountId,
  contacts,
  m,
}: {
  accountId: string;
  contacts: NonNullable<ReturnType<typeof useCrmAccountDetail>['data']>['contacts'];
  m: ReturnType<typeof useCrmMutations>;
}) {
  const [open, setOpen] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);

  const submit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await m.createContact.mutateAsync({
      account_id: accountId,
      name: String(fd.get('name') ?? '').trim(),
      role: String(fd.get('role') ?? '') || null,
      phone: normalizePhoneForSave(String(fd.get('phone') ?? '')),
      email: String(fd.get('email') ?? '').trim() || null,
      is_primary: fd.get('primary') === 'on',
      notes: String(fd.get('notes') ?? '') || null,
    });
    setOpen(false);
    e.currentTarget.reset();
  };

  const pending = contacts.find((c) => c.id === delId);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Contacts</CardTitle>
          <CardDescription>People tied to this account.</CardDescription>
        </div>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          Add contact
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New contact</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="c-name">Name *</Label>
                <Input id="c-name" name="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="c-role">Role</Label>
                <Input id="c-role" name="role" placeholder="Estimator, owner…" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="c-phone">Phone</Label>
                  <Input id="c-phone" name="phone" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="c-email">Email</Label>
                  <Input id="c-email" name="email" type="email" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="primary" />
                Primary contact
              </label>
              <div className="space-y-2">
                <Label htmlFor="c-notes">Notes</Label>
                <Textarea id="c-notes" name="notes" rows={2} />
              </div>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={m.createContact.isPending}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={delId !== null}
          title="Remove contact?"
          message={pending ? `Remove ${pending.name}?` : ''}
          confirmLabel="Remove"
          variant="danger"
          onConfirm={() => {
            if (delId) void m.deleteContact.mutateAsync(delId);
            setDelId(null);
          }}
          onCancel={() => setDelId(null)}
        />

        <ScrollArea className="h-[min(50vh,400px)]">
          <ul className="space-y-3 pr-3">
            {contacts.map((c) => (
              <li key={c.id} className="rounded-[var(--radius-sm)] border border-[var(--border-color)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    {c.role && <p className="text-xs text-[var(--text-muted)]">{c.role}</p>}
                    {(c.phone || c.email) && (
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {[formatPhone(c.phone) || null, c.email].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {c.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{c.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {c.is_primary && <Badge variant="default">Primary</Badge>}
                    <Button type="button" size="sm" variant="destructive" onClick={() => setDelId(c.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
              </li>
            ))}
            {contacts.length === 0 && <p className="text-sm text-[var(--text-muted)]">No contacts yet.</p>}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function TimelineTab({
  accountId,
  interactions,
  userId,
  m,
}: {
  accountId: string;
  interactions: NonNullable<ReturnType<typeof useCrmAccountDetail>['data']>['interactions'];
  userId: string | null;
  m: ReturnType<typeof useCrmMutations>;
}) {
  const [kind, setKind] = useState<string>('note');

  const submit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const occurred = String(fd.get('occurred_at') ?? '').trim();
    await m.createInteraction.mutateAsync({
      account_id: accountId,
      kind,
      summary: String(fd.get('summary') ?? '').trim(),
      detail: String(fd.get('detail') ?? '') || null,
      occurred_at: occurred ? new Date(occurred).toISOString() : undefined,
      created_by_user_id: userId,
    });
    e.currentTarget.reset();
    setKind('note');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Interactions</CardTitle>
        <CardDescription>Calls, meetings, emails, and notes — newest first.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          id="log-interaction-form"
          onSubmit={submit}
          className="space-y-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Kind</Label>
              <select
                className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-color)] px-3 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {INTERACTION_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="i-when">When</Label>
              <Input id="i-when" name="occurred_at" type="datetime-local" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="i-sum">Summary *</Label>
            <Input id="i-sum" name="summary" required placeholder="Short headline" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="i-det">Detail</Label>
            <Textarea id="i-det" name="detail" rows={3} />
          </div>
          <Button type="submit" disabled={m.createInteraction.isPending}>
            Log interaction
          </Button>
        </form>

        <Separator />

        <ul className="space-y-4">
          {interactions.map((it) => (
            <li key={it.id} className="border-l-2 border-[var(--primary-green)] pl-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{it.kind}</p>
                <span className="text-xs text-[var(--text-muted)]">{formatInVancouver(it.occurred_at, 'MMM d, yyyy h:mm a')}</span>
              </div>
              <p className="mt-1 font-semibold text-[var(--text-primary)]">{it.summary}</p>
              {it.detail && <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{it.detail}</p>}
              <Button className="mt-2 h-8" type="button" variant="ghost" size="sm" onClick={() => void m.deleteInteraction.mutateAsync(it.id)}>
                Remove
              </Button>
            </li>
          ))}
          {interactions.length === 0 && <p className="text-sm text-[var(--text-muted)]">No interactions logged yet.</p>}
        </ul>
      </CardContent>
    </Card>
  );
}

function ResearchTab({
  accountId,
  notes,
  m,
}: {
  accountId: string;
  notes: NonNullable<ReturnType<typeof useCrmAccountDetail>['data']>['research_notes'];
  m: ReturnType<typeof useCrmMutations>;
}) {
  const [open, setOpen] = useState(false);

  const submit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await m.createResearchNote.mutateAsync({
      account_id: accountId,
      title: String(fd.get('title') ?? '') || null,
      body: String(fd.get('body') ?? '').trim(),
      source_url: String(fd.get('source_url') ?? '').trim() || null,
    });
    setOpen(false);
    e.currentTarget.reset();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Research notes</CardTitle>
          <CardDescription>Findings with optional source links.</CardDescription>
        </div>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          Add note
        </Button>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Research note</DialogTitle>
              <DialogDescription>Capture what you learned and where it came from.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="rn-title">Title</Label>
                <Input id="rn-title" name="title" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rn-body">Body *</Label>
                <Textarea id="rn-body" name="body" required rows={5} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rn-url">Source URL</Label>
                <Input id="rn-url" name="source_url" type="url" placeholder="https://…" />
              </div>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={m.createResearchNote.isPending}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <ul className="space-y-4">
          {notes.map((n) => (
            <ResearchNoteRow key={n.id} note={n} m={m} />
          ))}
          {notes.length === 0 && <p className="text-sm text-[var(--text-muted)]">No research notes yet.</p>}
        </ul>
      </CardContent>
    </Card>
  );
}

function ResearchNoteRow({
  note,
  m,
}: {
  note: NonNullable<ReturnType<typeof useCrmAccountDetail>['data']>['research_notes'][number];
  m: ReturnType<typeof useCrmMutations>;
}) {
  const [edit, setEdit] = useState(false);
  const submit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await m.updateResearchNote.mutateAsync({
      id: note.id,
      title: String(fd.get('title') ?? '') || null,
      body: String(fd.get('body') ?? '').trim(),
      source_url: String(fd.get('source_url') ?? '').trim() || null,
    });
    setEdit(false);
  };

  return (
    <li className="rounded-[var(--radius-md)] border border-[var(--border-color)] p-4">
      {!edit ? (
        <>
          {note.title && <p className="font-semibold">{note.title}</p>}
          <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{note.body}</p>
          {note.source_url && (
            <a href={note.source_url} className="mt-2 inline-block text-sm font-semibold text-[var(--primary-green)]" target="_blank" rel="noreferrer">
              Source
            </a>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setEdit(true)}>
              Edit
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => void m.deleteResearchNote.mutateAsync(note.id)}>
              Delete
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input name="title" defaultValue={note.title ?? ''} />
          </div>
          <div className="space-y-2">
            <Label>Body *</Label>
            <Textarea name="body" required rows={4} defaultValue={note.body} />
          </div>
          <div className="space-y-2">
            <Label>Source URL</Label>
            <Input name="source_url" type="url" defaultValue={note.source_url ?? ''} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={m.updateResearchNote.isPending}>
              Save
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEdit(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

function EditAccountDialog({
  open,
  onOpenChange,
  account,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: NonNullable<ReturnType<typeof useCrmAccountDetail>['data']>['account'];
  onSave: (patch: Record<string, unknown>) => Promise<unknown>;
}) {
  const [type, setType] = useState<CrmAccountType>(account.account_type as CrmAccountType);
  const [status, setStatus] = useState<CrmAccountStatus>(account.status as CrmAccountStatus);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(account.account_type as CrmAccountType);
    setStatus(account.status as CrmAccountStatus);
  }, [open, account.account_type, account.status]);

  const submit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    try {
      await onSave({
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
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
        </DialogHeader>
        <form key={account.updated_at} onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ea-name">Account name *</Label>
              <Input id="ea-name" name="name" required defaultValue={account.name} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ea-company">Company</Label>
              <Input id="ea-company" name="company" defaultValue={account.company ?? ''} />
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
              <Label htmlFor="ea-phone">Phone</Label>
              <Input id="ea-phone" name="phone" defaultValue={account.phone ?? ''} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ea-email">Email</Label>
              <Input id="ea-email" name="email" type="email" defaultValue={account.email ?? ''} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ea-addr">Address</Label>
              <Input id="ea-addr" name="address" defaultValue={account.address ?? ''} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ea-src">Marketing source</Label>
              <Input id="ea-src" name="marketing_source" defaultValue={account.marketing_source ?? ''} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="ea-notes">Notes</Label>
              <Textarea id="ea-notes" name="notes" rows={3} defaultValue={account.notes ?? ''} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilesTab({ accountId, currentUserId }: { accountId: string; currentUserId: string | null }) {
  const [files, setFiles] = useState<AccountAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await listAccountAttachments(accountId);
      setFiles(list);
    } catch (e) {
      setError(formatErrorForUi(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large', { description: 'Maximum upload size is 10 MB.' });
      return;
    }
    setUploading(true);
    try {
      const created = await uploadAccountAttachment(accountId, file);
      setFiles((prev) => [created, ...prev]);
      toast.success('File uploaded');
    } catch (e) {
      toast.error('Upload failed', { description: formatErrorForUi(e) });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteAccountAttachment(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
      toast.success('File deleted');
    } catch (e) {
      toast.error('Delete failed', { description: formatErrorForUi(e) });
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const pendingDelete = confirmDeleteId ? files.find((f) => f.id === confirmDeleteId) : null;

  return (
    <Card>
      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this file?"
        message={
          pendingDelete
            ? `Permanently delete “${pendingDelete.file_name}”? This cannot be undone.`
            : 'Permanently delete this file?'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-base">Files</CardTitle>
          <CardDescription>Upload documents or photos related to this account. Max 10 MB.</CardDescription>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="mr-2 h-4 w-4" />
          {uploading ? 'Uploading…' : 'Upload file'}
        </Button>
        <input ref={inputRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading files…
          </div>
        ) : error ? (
          <p className="py-6 text-sm text-red-600">{error}</p>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-color)] p-10 text-center">
            <FileText className="h-10 w-10 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No files yet for this account.</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="mr-2 h-4 w-4" /> Upload first file
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {files.map((f) => {
              const canDelete = !currentUserId || f.uploaded_by_user_id === currentUserId;
              return (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--border-color)] p-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <FileText className="h-5 w-5 flex-shrink-0 text-[var(--text-muted)]" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{f.file_name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {formatFileSize(f.file_size)} · {formatInVancouver(f.created_at, 'MMM d, yyyy')}
                        {f.uploaded_by_email ? ` · ${f.uploaded_by_email}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {f.signed_url && (
                      <Button asChild type="button" variant="ghost" size="sm">
                        <a href={f.signed_url} target="_blank" rel="noopener noreferrer" download={f.file_name}>
                          <Download className="mr-1.5 h-4 w-4" /> Download
                        </a>
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(f.id)}
                        disabled={deletingId === f.id}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
