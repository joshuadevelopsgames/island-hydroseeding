import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatInVancouver } from '@/lib/vancouverTime';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
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

const INTERACTION_KINDS = [
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'note', label: 'Note' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'site_visit', label: 'Site visit' },
  { value: 'other', label: 'Other' },
] as const;

export default function CrmAccountDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { data, isLoading, isError, error, refetch } = useCrmAccountDetail(accountId);
  const m = useCrmMutations();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const account = data?.account;

  const sortedInteractions = useMemo(
    () => [...(data?.interactions ?? [])].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)),
    [data?.interactions]
  );

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

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/crm" className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary-green)]">
            <ArrowLeft className="h-4 w-4" /> Accounts
          </Link>
          <h1 className="mb-1">{account.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {account.company && <span className="text-sm text-[var(--text-muted)]">{account.company}</span>}
            <Badge variant="outline">{account.account_type}</Badge>
            <Badge variant="secondary">{account.status}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            Edit account
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <EditAccountDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        account={account}
        onSave={(patch) => m.updateAccount.mutateAsync({ id: account.id, ...patch })}
      />

      <Tabs defaultValue="contacts">
        <TabsList className="w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>

        <TabsContent value="contacts">
          <ContactsTab accountId={account.id} contacts={data?.contacts ?? []} m={m} />
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
        <TabsContent value="overview">
          <OverviewCard account={account} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewCard({ account }: { account: NonNullable<ReturnType<typeof useCrmAccountDetail>['data']>['account'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Account details</CardTitle>
        <CardDescription>Read-only summary — use Edit account to change fields.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          <span className="font-semibold text-[var(--text-primary)]">Phone:</span>{' '}
          <span className="text-[var(--text-secondary)]">{account.phone ?? '—'}</span>
        </p>
        <p>
          <span className="font-semibold text-[var(--text-primary)]">Email:</span>{' '}
          <span className="text-[var(--text-secondary)]">{account.email ?? '—'}</span>
        </p>
        <p>
          <span className="font-semibold text-[var(--text-primary)]">Address:</span>{' '}
          <span className="text-[var(--text-secondary)]">{account.address ?? '—'}</span>
        </p>
        <p>
          <span className="font-semibold text-[var(--text-primary)]">Marketing:</span>{' '}
          <span className="text-[var(--text-secondary)]">{account.marketing_source ?? '—'}</span>
        </p>
        {account.notes && (
          <p className="whitespace-pre-wrap text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">Notes:</span> {account.notes}
          </p>
        )}
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
      phone: String(fd.get('phone') ?? '').trim() || null,
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
                        {[c.phone, c.email].filter(Boolean).join(' · ')}
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
        <form onSubmit={submit} className="space-y-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-4">
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
        phone: String(fd.get('phone') ?? '').trim() || null,
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
