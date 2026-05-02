/**
 * /pay/:token — Public client-facing payment page
 * No auth required. Token in URL acts as the credential.
 *
 * Stripe: PaymentIntent is created with POST create_payment_intent (unchanged flow).
 * PaymentElement + confirmPayment must stay wired the same.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Lock,
  Mail,
  FileText,
  Printer,
  Share2,
} from 'lucide-react';
import './invoicePayPrint.css';
import {
  resolveClientBranding,
  INVOICE_LOGO_URL_FALLBACK,
  type TenantBrandingApi,
} from '@/lib/tenantBranding';
import InvoicePayDesignBlock from '@/components/invoices/InvoicePayDesignBlock';

// ── types ─────────────────────────────────────────────────────────────────────

interface PublicInvoice {
  id: string;
  invoice_number: number;
  title: string | null;
  status: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  payment_terms: string | null;
  notes: string | null;
  /** Snapshot of the design at create time; falls back to 'editorial'. */
  template_design?: string | null;
  section_visibility?: Record<string, boolean> | null;
  custom_text?: Record<string, unknown> | null;
}

interface PublicLineItem {
  id: string;
  product_service_name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total: number;
}

interface PublicAccount {
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
}

interface PublicProperty {
  address: string;
  city: string | null;
  province: string | null;
  postal_code: string | null;
}

interface InvoiceData {
  invoice: PublicInvoice;
  line_items: PublicLineItem[];
  account: PublicAccount | null;
  property: PublicProperty | null;
  branding?: TenantBrandingApi | null;
}

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string)
  : null;

const CAD = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtDateTime() {
  return new Date().toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function parseLocalYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return new Date(s);
  return new Date(y, m - 1, d);
}

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isPastDue(dueDateStr: string, balanceDue: number): boolean {
  if (balanceDue <= 0) return false;
  const due = startOfLocalDay(parseLocalYmd(dueDateStr));
  const today = startOfLocalDay(new Date());
  return due < today;
}

function formatProperty(p: PublicProperty): string {
  const parts = [p.address, p.city, p.province].filter(Boolean).join(', ');
  return [parts, p.postal_code].filter(Boolean).join(p.postal_code ? ' ' : '');
}

function taxAmountFor(invoice: PublicInvoice): number {
  if (invoice.tax_amount != null && !Number.isNaN(Number(invoice.tax_amount))) {
    return Number(invoice.tax_amount);
  }
  return Math.max(0, Number(invoice.total) - Number(invoice.subtotal));
}

// ── brand mark (optional custom logo URL) ─────────────────────────────────────

function BrandMark({ logoUrl, className }: { logoUrl?: string | null; className?: string }) {
  const src = logoUrl?.trim() || INVOICE_LOGO_URL_FALLBACK;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={className ?? 'h-11 w-auto max-w-[200px] object-contain object-left'}
        height={44}
        decoding="async"
      />
    );
  }
  return (
    <img
      src="/invoice-brand-mark.svg"
      alt=""
      width={44}
      height={44}
      className={className ?? 'h-11 w-11 shrink-0'}
      decoding="async"
    />
  );
}

// ── status chip ───────────────────────────────────────────────────────────────

function InvoiceStatusChip({ invoice }: { invoice: PublicInvoice }) {
  const balance = Number(invoice.balance_due ?? 0);
  if (balance <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Paid
      </span>
    );
  }
  if (isPastDue(invoice.due_date, balance)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/90 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-800">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
        Past due
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/90 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
      Due {fmtDate(invoice.due_date)}
    </span>
  );
}

// ── checkout form ─────────────────────────────────────────────────────────────

function CheckoutForm({
  balanceDue,
  onSuccess,
}: {
  balanceDue: number;
  onSuccess: () => void | Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setErrMsg(null);
    setPaying(true);

    const { error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (error) {
      setErrMsg(error.message ?? 'Payment failed. Please try again.');
      setPaying(false);
    } else {
      try {
        await Promise.resolve(onSuccess());
      } finally {
        setPaying(false);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-raised)]/50 p-4">
        <PaymentElement />
      </div>

      {errMsg && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200/80 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {errMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={paying || !stripe}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: 'var(--primary-green)' }}
      >
        {paying && <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />}
        {paying ? 'Processing…' : `Pay ${CAD.format(balanceDue)}`}
      </button>

      <div className="flex flex-col items-center gap-1 text-center text-xs text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          Encrypted checkout · Apple Pay, Google Pay, and cards where available · processed by{' '}
          <a
            href="https://stripe.com"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text-primary)]"
          >
            Stripe
          </a>
        </span>
      </div>
    </form>
  );
}

// ── payment received / receipt (print-friendly) ─────────────────────────────

function PaymentReceivedScreen({ data, payUrl }: { data: InvoiceData; payUrl: string }) {
  const { invoice, line_items, account, property } = data;
  const br = resolveClientBranding(data.branding);
  const taxPct = Math.round((invoice.tax_rate ?? 0.05) * 100);
  const taxAmt = taxAmountFor(invoice);
  const invNo = String(invoice.invoice_number).padStart(4, '0');
  const amountPaidDisplay =
    Number(invoice.amount_paid) > 0.005
      ? Number(invoice.amount_paid)
      : Number(invoice.balance_due) < 0.005
        ? Number(invoice.total)
        : Number(invoice.amount_paid);

  const handleShare = async () => {
    const title = `Invoice #${invNo} — ${br.companyName}`;
    const text = `Invoice #${invNo} — Total ${CAD.format(invoice.total)}. Paid.`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url: payUrl });
      }
    } catch {
      /* user cancelled or share unavailable */
    }
  };

  return (
    <div className="invoice-pay-root min-h-screen pb-16" style={{ background: 'var(--bg-color)' }}>
      <header className="invoice-pay-header border-b border-[var(--border-color)] bg-[var(--surface-color)]">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <BrandMark logoUrl={br.logoUrl} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary-green)]">{br.companyName}</p>
              <p className="text-xs text-[var(--text-muted)]">{br.tagline}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-primary)]">Payment received</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Receipt · Invoice #{invNo}</p>
            </div>
          </div>
          <div className="invoice-pay-receipt-actions flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--surface-raised)]"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4 shrink-0" aria-hidden />
              Print / Save as PDF
            </button>
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--surface-raised)]"
                onClick={() => void handleShare()}
              >
                <Share2 className="h-4 w-4 shrink-0" aria-hidden />
                Share
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <article
          className="invoice-pay-receipt space-y-6 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-color)] p-6 shadow-[var(--shadow-sm)] sm:p-8"
          aria-label="Payment receipt"
        >
          <div className="flex items-start gap-3 border-b border-[var(--border-color)] pb-6">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
              style={{ background: 'var(--light-green)' }}
            >
              <CheckCircle2 className="h-7 w-7" style={{ color: 'var(--color-success)' }} aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Thank you — your payment was successful.</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Recorded {fmtDateTime()}</p>
            </div>
          </div>

          {(account || property) && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Bill to</h2>
              {account ? (
                <div className="text-[var(--text-primary)]">
                  <p className="font-semibold">{account.name}</p>
                  {account.company ? <p className="text-sm text-[var(--text-secondary)]">{account.company}</p> : null}
                  {account.email ? <p className="text-sm text-[var(--text-secondary)]">{account.email}</p> : null}
                </div>
              ) : null}
              {property ? (
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{formatProperty(property)}</p>
              ) : null}
            </section>
          )}

          <section className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Invoice</p>
              <p className="mt-0.5 font-semibold text-[var(--text-primary)]">#{invNo}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Amount paid</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--text-primary)]">
                {CAD.format(amountPaidDisplay)}
              </p>
            </div>
          </section>

          {line_items.length > 0 ? (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Line items</h2>
              <div className="overflow-hidden rounded-xl border border-[var(--border-color)]">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-color)] bg-[var(--surface-raised)] text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="px-3 py-2">Service</th>
                      <th className="w-24 px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {line_items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-[var(--text-primary)]">{item.product_service_name}</p>
                          {item.description ? (
                            <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-[var(--text-muted)]">
                              {item.description}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-[var(--text-primary)]">
                          {CAD.format(item.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 space-y-1.5 border-t border-[var(--border-color)] pt-4 text-sm">
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{CAD.format(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Tax (GST {taxPct}%)</span>
                  <span className="tabular-nums">{CAD.format(taxAmt)}</span>
                </div>
                {br.gst ? (
                  <p className="text-xs text-[var(--text-muted)]">GST/HST registration no. {br.gst}</p>
                ) : null}
                <div className="flex justify-between font-semibold text-[var(--text-primary)]">
                  <span>Total</span>
                  <span className="tabular-nums">{CAD.format(invoice.total)}</span>
                </div>
              </div>
            </section>
          ) : null}

          {br.footerNote ? (
            <p className="whitespace-pre-wrap border-t border-[var(--border-color)] pt-6 text-center text-sm text-[var(--text-secondary)]">
              {br.footerNote}
            </p>
          ) : null}
          <p
            className={`text-center text-sm text-[var(--text-muted)] ${br.footerNote ? 'pt-3' : 'border-t border-[var(--border-color)] pt-6'}`}
          >
            {br.companyName} · Keep this page for your records.
          </p>
        </article>
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function InvoicePay() {
  const { token } = useParams<{ token: string }>();

  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const refetchInvoice = useCallback(async () => {
    if (!token) return;
    const r = await fetch(`/api/stripe?action=invoice_by_token&token=${encodeURIComponent(token)}`);
    const data = (await r.json()) as InvoiceData & { error?: string };
    if (!data.error) setInvoiceData(data);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setLoadErr('Invalid payment link.');
      setLoading(false);
      return;
    }

    fetch(`/api/stripe?action=invoice_by_token&token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: InvoiceData & { error?: string }) => {
        if (data.error) throw new Error(data.error);
        setInvoiceData(data);

        if (data.invoice.status === 'Paid') {
          setPaid(true);
          return;
        }

        return fetch('/api/stripe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create_payment_intent', invoice_id: data.invoice.id }),
        })
          .then((r) => r.json())
          .then((pi: { clientSecret?: string; error?: string }) => {
            if (pi.error) throw new Error(pi.error);
            setClientSecret(pi.clientSecret ?? null);
          });
      })
      .catch((err) => setLoadErr((err as Error).message ?? 'Could not load invoice.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div
        className="invoice-pay-root flex min-h-screen items-center justify-center"
        style={{ background: 'var(--bg-color)' }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" aria-hidden />
      </div>
    );
  }

  if (loadErr) {
    return (
      <div
        className="invoice-pay-root flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center"
        style={{ background: 'var(--bg-color)' }}
      >
        <AlertCircle className="h-12 w-12 text-[var(--color-danger)]" aria-hidden />
        <p className="text-lg font-semibold text-[var(--text-primary)]">{loadErr}</p>
        <p className="max-w-md text-sm text-[var(--text-muted)]">
          Please contact Island Hydroseeding if you believe this is an error.
        </p>
      </div>
    );
  }

  if ((paid || invoiceData?.invoice.status === 'Paid') && invoiceData) {
    const payUrl = typeof window !== 'undefined' ? window.location.href.split('#')[0] : '';
    return <PaymentReceivedScreen data={invoiceData} payUrl={payUrl} />;
  }

  if (!invoiceData) return null;

  const { invoice, line_items, account, property } = invoiceData;
  const br = resolveClientBranding(invoiceData.branding);
  const taxPct = Math.round((invoice.tax_rate ?? 0.05) * 100);
  const taxAmount = taxAmountFor(invoice);
  const balanceDue = Number(invoice.balance_due);
  const amountPaid = Number(invoice.amount_paid ?? 0);
  const contactEmail = account?.email?.trim() || '';

  return (
    <div className="invoice-pay-root min-h-screen pb-16" style={{ background: 'var(--bg-color)' }}>
      <header className="invoice-pay-header border-b border-[var(--border-color)] bg-[var(--surface-color)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-start sm:justify-between sm:px-8">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <BrandMark logoUrl={br.logoUrl} />
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary-green)]">{br.companyName}</p>
              <p className="text-xs text-[var(--text-muted)]">{br.tagline}</p>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                  Invoice #{String(invoice.invoice_number).padStart(4, '0')}
                </h1>
                {invoice.title ? (
                  <span className="text-sm font-medium text-[var(--text-muted)]">{invoice.title}</span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0 self-start">
            <InvoiceStatusChip invoice={invoice} />
          </div>
        </div>
      </header>

      <div className="invoice-pay-grid mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_380px] lg:items-start lg:gap-10 lg:px-8">
        <article
          className="invoice-pay-document order-2 space-y-6 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-color)] p-4 shadow-[var(--shadow-sm)] sm:p-6 lg:order-1 overflow-hidden"
          aria-label="Invoice details"
        >
          <InvoicePayDesignBlock
            invoice={invoice}
            lineItems={line_items}
            account={account}
            property={property}
            branding={br}
            isOverdue={isPastDue(invoice.due_date, balanceDue)}
          />

          <footer className="invoice-pay-no-print mt-6 border-t border-[var(--border-color)] pt-6 text-center text-sm text-[var(--text-muted)]">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4 shrink-0" aria-hidden />
              Print invoice
            </button>
            {br.etransfer ? (
              <p className="mt-4 leading-relaxed">
                To pay by <strong className="text-[var(--text-secondary)]">e-Transfer</strong>, send to{' '}
                <a href={`mailto:${br.etransfer}`} className="font-semibold text-[var(--primary-green)] hover:underline">
                  {br.etransfer}
                </a>
                . Please include invoice #{String(invoice.invoice_number).padStart(4, '0')} in the message.
              </p>
            ) : contactEmail ? (
              <p className="mt-4 leading-relaxed">
                Questions or e-Transfer? Email{' '}
                <a href={`mailto:${contactEmail}`} className="font-semibold text-[var(--primary-green)] hover:underline">
                  {contactEmail}
                </a>{' '}
                and reference this invoice number.
              </p>
            ) : null}
          </footer>
        </article>

        {/* legacy detailed render below — hidden, kept for reference until shipping */}
        <article aria-hidden style={{ display: 'none' }}>
          <div className="flex items-start gap-3 border-b border-[var(--border-color)] pb-6">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'var(--accent-soft)' }}
            >
              <FileText className="h-5 w-5 text-[var(--primary-green)]" aria-hidden />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Summary</h2>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">Please review services and totals before paying.</p>
            </div>
          </div>

          {(account || property) && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Bill to</h3>
              {account && (
                <div className="space-y-0.5 text-[var(--text-primary)]">
                  <p className="text-lg font-semibold leading-snug">{account.name}</p>
                  {account.company ? (
                    <p className="text-sm text-[var(--text-secondary)]">{account.company}</p>
                  ) : null}
                  {account.phone ? (
                    <p className="text-sm text-[var(--text-secondary)]">{account.phone}</p>
                  ) : null}
                  {account.email ? (
                    <a
                      href={`mailto:${account.email}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--primary-green)] hover:underline"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {account.email}
                    </a>
                  ) : null}
                </div>
              )}
              {property ? (
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{formatProperty(property)}</p>
              ) : null}
            </section>
          )}

          <section className="grid gap-4 rounded-xl bg-[var(--surface-raised)] p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Issued</p>
              <p className="mt-1 font-semibold text-[var(--text-primary)]">{fmtDate(invoice.issue_date)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Due</p>
              <p className="mt-1 font-semibold text-[var(--text-primary)]">{fmtDate(invoice.due_date)}</p>
            </div>
            {invoice.payment_terms ? (
              <div className="sm:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Terms</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{invoice.payment_terms}</p>
              </div>
            ) : null}
          </section>

          {line_items.length > 0 ? (
            <section>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Services</h3>
              <div className="overflow-hidden rounded-xl border border-[var(--border-color)]">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-color)] bg-[var(--surface-raised)] text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="px-4 py-3">Service</th>
                      <th className="hidden w-20 px-2 py-3 text-right sm:table-cell">Qty</th>
                      <th className="w-28 px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {line_items.map((item) => (
                      <tr key={item.id} className="align-top">
                        <td className="px-4 py-4">
                          <p className="font-medium text-[var(--text-primary)]">{item.product_service_name}</p>
                          {item.description ? (
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-muted)]">
                              {item.description}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-[var(--text-muted)] sm:hidden">
                            {item.quantity} × {CAD.format(item.unit_price)}
                          </p>
                        </td>
                        <td className="hidden px-2 py-4 text-right tabular-nums text-[var(--text-secondary)] sm:table-cell">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-4 text-right text-base font-semibold tabular-nums text-[var(--text-primary)]">
                          {CAD.format(item.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 space-y-2 border-t border-[var(--border-color)] pt-5 text-sm">
                <div className="flex justify-between gap-4 text-[var(--text-secondary)]">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{CAD.format(invoice.subtotal)}</span>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
                  <span className="text-[var(--text-secondary)]">Tax (GST {taxPct}%)</span>
                  <div className="text-right">
                    <span className="tabular-nums text-[var(--text-secondary)]">{CAD.format(taxAmount)}</span>
                    {br.gst ? (
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">GST/HST registration no. {br.gst}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex justify-between gap-4 border-b border-[var(--border-color)] pb-2 font-medium text-[var(--text-primary)]">
                  <span>Invoice total</span>
                  <span className="tabular-nums">{CAD.format(invoice.total)}</span>
                </div>
                {amountPaid > 0 ? (
                  <div className="flex justify-between gap-4 text-emerald-800">
                    <span>Amount paid</span>
                    <span className="tabular-nums">−{CAD.format(amountPaid)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4 pt-1 text-lg font-bold text-[var(--text-primary)]">
                  <span>Balance due</span>
                  <span className="tabular-nums">{CAD.format(balanceDue)}</span>
                </div>
              </div>
            </section>
          ) : null}

          {invoice.notes ? (
            <section className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-raised)]/60 p-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Notes</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">{invoice.notes}</p>
            </section>
          ) : null}

          <footer className="border-t border-[var(--border-color)] pt-6 text-center text-sm text-[var(--text-muted)]">
            {br.footerNote ? (
              <p className="mb-3 whitespace-pre-wrap text-[var(--text-secondary)]">{br.footerNote}</p>
            ) : null}
            <p className="font-medium text-[var(--text-primary)]">Thank you for your business.</p>
            <div className="invoice-pay-no-print mt-4">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4 shrink-0" aria-hidden />
                Print invoice
              </button>
            </div>
            {br.etransfer ? (
              <p className="mt-4 leading-relaxed">
                To pay by <strong className="text-[var(--text-secondary)]">e-Transfer</strong>, send to{' '}
                <a
                  href={`mailto:${br.etransfer}`}
                  className="font-semibold text-[var(--primary-green)] hover:underline"
                >
                  {br.etransfer}
                </a>
                . Please include invoice #{String(invoice.invoice_number).padStart(4, '0')} in the message.
              </p>
            ) : contactEmail ? (
              <p className="mt-4 leading-relaxed">
                Questions or e-Transfer? Email{' '}
                <a href={`mailto:${contactEmail}`} className="font-semibold text-[var(--primary-green)] hover:underline">
                  {contactEmail}
                </a>{' '}
                and reference this invoice number.
              </p>
            ) : (
              <p className="mt-4">Questions? Contact {br.companyName} with this invoice number.</p>
            )}
          </footer>
        </article>

        <aside className="invoice-pay-no-print order-1 lg:order-2">
          <div className="sticky top-6 space-y-6 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-color)] p-6 shadow-[var(--shadow-md)] sm:p-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Amount due</p>
              <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight text-[var(--text-primary)]">
                {CAD.format(balanceDue)}
              </p>
              {amountPaid > 0 ? (
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  <span className="tabular-nums text-[var(--text-secondary)]">{CAD.format(amountPaid)}</span> already
                  received · Total invoice{' '}
                  <span className="tabular-nums font-medium text-[var(--text-primary)]">{CAD.format(invoice.total)}</span>
                </p>
              ) : (
                <p className="mt-2 text-sm text-[var(--text-muted)]">Secure card payment below.</p>
              )}
            </div>

            <div className="h-px bg-[var(--border-color)]" aria-hidden />

            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Pay online</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">You will not be charged until you confirm.</p>
            </div>

            {!stripePromise ? (
              <div className="rounded-xl border border-amber-200/80 bg-amber-50 p-4 text-sm text-amber-950">
                Online payments are not configured yet. Please use the alternate payment instructions on this page or
                contact us.
              </div>
            ) : clientSecret ? (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: 'stripe',
                    variables: {
                      colorPrimary: '#b23438',
                      colorBackground: '#faf8f8',
                      colorText: '#1a1a1a',
                      colorDanger: '#d70015',
                      fontFamily: 'Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif',
                      borderRadius: '12px',
                      spacingUnit: '3px',
                    },
                    rules: {
                      '.Input': {
                        borderColor: 'rgba(26, 26, 26, 0.12)',
                        boxShadow: 'none',
                      },
                    },
                  },
                }}
              >
                <CheckoutForm
                  balanceDue={balanceDue}
                  onSuccess={async () => {
                    await refetchInvoice();
                    setPaid(true);
                  }}
                />
              </Elements>
            ) : (
              <div className="flex justify-center py-10">
                <Loader2 className="h-7 w-7 animate-spin text-[var(--text-muted)]" aria-hidden />
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
