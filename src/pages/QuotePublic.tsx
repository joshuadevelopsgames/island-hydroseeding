/**
 * Public quote view + client approval — /quote/:token
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { CheckCircle2, Loader2, Lock } from 'lucide-react';
import QuoteDesignPreview from '@/components/quotes/QuoteDesignPreview';
import { ctxFromBundle } from '@/components/quotes/buildDesignContext';
import { resolveClientBranding, type TenantBrandingApi } from '@/lib/tenantBranding';
import { QUOTE_DESIGNS, type Quote, type QuoteBundle, type QuoteDesign, type QuoteLineItem } from '@/lib/quotesTypes';

type PublicPayload = {
  quote: Quote;
  line_items: QuoteLineItem[];
  account: Record<string, unknown> | null;
  property: Record<string, unknown> | null;
  branding: TenantBrandingApi | null;
  has_payment_method: boolean;
  payment_setup_available: boolean;
  stripe_publishable_key: string | null;
  error?: string;
};

function SetupCardForm({ onDone }: { onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setErr(null);
    setBusy(true);
    const { error } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    });
    if (error) {
      setErr(error.message ?? 'Could not save card.');
      setBusy(false);
    } else {
      await onDone();
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-raised)]/50 p-4">
        <PaymentElement />
      </div>
      {err && <p className="text-sm text-[var(--color-danger)]">{err}</p>}
      <button
        type="submit"
        disabled={busy || !stripe}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: 'var(--primary-green)' }}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Save card on file
      </button>
      <p className="flex items-center justify-center gap-1 text-center text-xs text-[var(--text-muted)]">
        <Lock className="h-3 w-3" /> Secured by Stripe
      </p>
    </form>
  );
}

export default function QuotePublic() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicPayload | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [approved, setApproved] = useState(false);
  const [approveErr, setApproveErr] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!token) return;
    const r = await fetch(`/api/public-quote?token=${encodeURIComponent(token)}`);
    const j = (await r.json()) as PublicPayload;
    if (!r.ok || j.error) throw new Error((j as { error?: string }).error || 'Not found');
    setData(j);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setLoadErr('Invalid link.');
      setLoading(false);
      return;
    }
    refetch()
      .catch((e) => setLoadErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [token, refetch]);

  const bundle: QuoteBundle | null = useMemo(() => {
    if (!data?.quote) return null;
    const acc = data.account;
    return {
      quote: data.quote,
      line_items: data.line_items ?? [],
      tax_lines: [],
      quote_notes: [],
      quote_attachments: [],
      account: acc
        ? {
            id: String(acc.id),
            name: String(acc.name ?? ''),
            company: (acc.company as string | null) ?? null,
            phone: (acc.phone as string | null) ?? null,
            email: (acc.email as string | null) ?? null,
          }
        : null,
      property: (data.property as QuoteBundle['property']) ?? null,
    };
  }, [data]);

  const branding = resolveClientBranding(data?.branding);
  const ctx = useMemo(() => {
    if (!bundle) return null;
    return ctxFromBundle(bundle, data?.branding ?? undefined, branding);
  }, [bundle, data?.branding, branding]);

  const design = (data?.quote?.template_design as QuoteDesign) || 'editorial';
  const safeDesign = QUOTE_DESIGNS.includes(design) ? design : 'editorial';

  const pk = data?.stripe_publishable_key || import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  const stripePromise = useMemo(() => (pk ? loadStripe(pk) : null), [pk]);

  const needsPmGate = data ? data.payment_setup_available && !data.has_payment_method : false;
  const canApprove =
    data &&
    ['Sent', 'Awaiting Response', 'Changes Requested'].includes(data.quote.status) &&
    !approved &&
    !needsPmGate;

  const startSetup = async () => {
    if (!token) return;
    setSetupLoading(true);
    setApproveErr(null);
    try {
      const r = await fetch('/api/public-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setup_intent', token }),
      });
      const j = (await r.json()) as { clientSecret?: string; error?: string };
      if (!r.ok) throw new Error(j.error || 'Setup failed');
      setSetupSecret(j.clientSecret ?? null);
    } catch (e) {
      setApproveErr((e as Error).message);
    } finally {
      setSetupLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!token) return;
    setApproving(true);
    setApproveErr(null);
    try {
      const r = await fetch('/api/public-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', token }),
      });
      const j = (await r.json()) as { error?: string; message?: string; quote?: Quote };
      if (!r.ok) {
        if (j.error === 'needs_payment_method') {
          setApproveErr(j.message || 'Add a payment method first.');
        } else {
          throw new Error(j.error || 'Could not approve');
        }
        return;
      }
      setApproved(true);
      await refetch();
    } catch (e) {
      setApproveErr((e as Error).message);
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-[var(--text-muted)]">
        <Loader2 className="h-6 w-6 animate-spin" /> Loading quote…
      </div>
    );
  }

  if (loadErr || !data || !ctx || !bundle) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center text-[var(--color-danger)]">
        {loadErr || 'Quote not found.'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 text-center">
        <p className="text-sm font-medium text-[var(--primary-green)]">{branding.companyName}</p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{data.quote.title}</h1>
        <p className="text-sm text-[var(--text-muted)]">Quote #{data.quote.quote_number}</p>
      </div>

      <div className="overflow-x-auto">
        <QuoteDesignPreview design={safeDesign} ctx={ctx} autoFit />
      </div>

      {approved || data.quote.status === 'Approved' || data.quote.status === 'Converted' ? (
        <div className="mt-8 flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="font-medium">Thank you — this quote has been approved.</span>
        </div>
      ) : (
        <div className="mx-auto mt-8 max-w-md space-y-4">
          {data.payment_setup_available && !data.has_payment_method && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              A payment method on file is required before you can approve this quote.
            </div>
          )}

          {approveErr && <p className="text-center text-sm text-[var(--color-danger)]">{approveErr}</p>}

          {data.payment_setup_available && !data.has_payment_method && stripePromise && setupSecret && (
            <Elements stripe={stripePromise} options={{ clientSecret: setupSecret }}>
              <SetupCardForm onDone={() => void refetch().then(() => setSetupSecret(null))} />
            </Elements>
          )}

          {data.payment_setup_available && !data.has_payment_method && !setupSecret && (
            <button
              type="button"
              onClick={() => void startSetup()}
              disabled={setupLoading || !pk}
              className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-raised)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-50"
            >
              {setupLoading ? 'Preparing…' : 'Add payment method'}
            </button>
          )}

          {canApprove && (
            <button
              type="button"
              onClick={() => void handleApprove()}
              disabled={approving}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
              style={{ background: 'var(--primary-green)' }}
            >
              {approving && <Loader2 className="h-5 w-5 animate-spin" />}
              Approve quote
            </button>
          )}
        </div>
      )}
    </div>
  );
}
