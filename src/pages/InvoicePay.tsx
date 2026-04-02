/**
 * /pay/:token — Public client-facing payment page
 * No auth required. Token in URL acts as the credential.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

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
  total: number;
  amount_paid: number;
  balance_due: number;
  payment_terms: string | null;
  notes: string | null;
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
}

// ── Stripe promise (lazy — only loads when publishable key is set) ─────────────

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string)
  : null;

// ── helpers ───────────────────────────────────────────────────────────────────

const CAD = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ── checkout form ─────────────────────────────────────────────────────────────

function CheckoutForm({ balanceDue, onSuccess }: { balanceDue: number; onSuccess: () => void }) {
  const stripe   = useStripe();
  const elements = useElements();
  const [paying,  setPaying]  = useState(false);
  const [errMsg,  setErrMsg]  = useState<string | null>(null);

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
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />

      {errMsg && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {errMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={paying || !stripe}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {paying && <Loader2 className="h-5 w-5 animate-spin" />}
        {paying ? 'Processing…' : `Pay ${CAD.format(balanceDue)}`}
      </button>

      <p className="text-center text-xs text-slate-400">
        Secured by{' '}
        <a href="https://stripe.com" target="_blank" rel="noreferrer" className="underline">
          Stripe
        </a>
      </p>
    </form>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function InvoicePay() {
  const { token } = useParams<{ token: string }>();

  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState<string | null>(null);
  const [paid,     setPaid]     = useState(false);

  // 1. Fetch public invoice data
  useEffect(() => {
    if (!token) { setLoadErr('Invalid payment link.'); setLoading(false); return; }

    fetch(`/api/stripe?action=invoice_by_token&token=${token}`)
      .then(r => r.json())
      .then((data: InvoiceData & { error?: string }) => {
        if (data.error) throw new Error(data.error);
        setInvoiceData(data);

        if (data.invoice.status === 'Paid') {
          setPaid(true);
          return;
        }

        // 2. Create PaymentIntent
        return fetch('/api/stripe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create_payment_intent', invoice_id: data.invoice.id }),
        }).then(r => r.json()).then((pi: { clientSecret?: string; error?: string }) => {
          if (pi.error) throw new Error(pi.error);
          setClientSecret(pi.clientSecret ?? null);
        });
      })
      .catch(err => setLoadErr((err as Error).message ?? 'Could not load invoice.'))
      .finally(() => setLoading(false));
  }, [token]);

  // ── loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-center">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-lg font-semibold text-slate-700">{loadErr}</p>
        <p className="text-sm text-slate-500">Please contact Island Hydroseeding if you believe this is an error.</p>
      </div>
    );
  }

  // ── already paid ─────────────────────────────────────────────────────────────

  if (paid || invoiceData?.invoice.status === 'Paid') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Payment Received</h1>
          <p className="mt-2 text-slate-500">
            Invoice #{String(invoiceData?.invoice.invoice_number ?? '').padStart(4, '0')} has been paid. Thank you!
          </p>
        </div>
        <p className="text-sm text-slate-400">Island Hydroseeding Ltd.</p>
      </div>
    );
  }

  if (!invoiceData) return null;

  const { invoice, line_items, account, property } = invoiceData;
  const taxPct = Math.round((invoice.tax_rate ?? 0.05) * 100);

  // ── main layout ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-green-700">Island Hydroseeding Ltd.</p>
            <h1 className="mt-0.5 text-xl font-bold text-slate-800">
              Invoice #{String(invoice.invoice_number).padStart(4, '0')}
            </h1>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">
            {CAD.format(invoice.balance_due)} due
          </span>
        </div>
      </div>

      <div className="mx-auto grid max-w-4xl gap-8 px-6 py-10 lg:grid-cols-[1fr_400px]">

        {/* Left — invoice summary */}
        <div className="space-y-6">

          {/* Client / Property */}
          {(account || property) && (
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Bill To</h2>
              {account && (
                <div className="mb-2">
                  <p className="font-semibold text-slate-800">{account.name}</p>
                  {account.company && <p className="text-sm text-slate-600">{account.company}</p>}
                  {account.email   && <p className="text-sm text-slate-600">{account.email}</p>}
                  {account.phone   && <p className="text-sm text-slate-600">{account.phone}</p>}
                </div>
              )}
              {property && (
                <p className="text-sm text-slate-600">
                  {property.address}{property.city ? `, ${property.city}` : ''}{property.province ? `, ${property.province}` : ''}{property.postal_code ? ` ${property.postal_code}` : ''}
                </p>
              )}
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4 rounded-xl bg-white p-6 shadow-sm">
            <div>
              <p className="text-xs font-medium text-slate-500">Issue Date</p>
              <p className="mt-1 font-semibold text-slate-800">{fmtDate(invoice.issue_date)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Due Date</p>
              <p className="mt-1 font-semibold text-slate-800">{fmtDate(invoice.due_date)}</p>
            </div>
            {invoice.payment_terms && (
              <div className="col-span-2">
                <p className="text-xs font-medium text-slate-500">Payment Terms</p>
                <p className="mt-1 text-sm text-slate-700">{invoice.payment_terms}</p>
              </div>
            )}
          </div>

          {/* Line items */}
          {line_items.length > 0 && (
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Services</h2>
              <div className="space-y-3">
                {line_items.map(item => (
                  <div key={item.id} className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-slate-800">{item.product_service_name}</p>
                      {item.description && <p className="text-sm text-slate-500">{item.description}</p>}
                      <p className="text-xs text-slate-400">
                        {item.quantity} × {CAD.format(item.unit_price)}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold text-slate-800">{CAD.format(item.total)}</p>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="mt-6 space-y-2 border-t border-slate-100 pt-4 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{CAD.format(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>GST ({taxPct}%)</span>
                  <span>{CAD.format(invoice.total - invoice.subtotal)}</span>
                </div>
                {invoice.amount_paid > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Amount Paid</span>
                    <span>−{CAD.format(invoice.amount_paid)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-800">
                  <span>Balance Due</span>
                  <span>{CAD.format(invoice.balance_due)}</span>
                </div>
              </div>
            </div>
          )}

          {invoice.notes && (
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Notes</h2>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Right — payment form */}
        <div>
          <div className="sticky top-8 rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-6 text-lg font-bold text-slate-800">Pay Online</h2>

            {!stripePromise ? (
              <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-700">
                Online payments are not configured yet. Please contact us to arrange payment.
              </div>
            ) : clientSecret ? (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: 'stripe',
                    variables: {
                      colorPrimary: '#16a34a',
                      borderRadius: '8px',
                    },
                  },
                }}
              >
                <CheckoutForm balanceDue={invoice.balance_due} onSuccess={() => setPaid(true)} />
              </Elements>
            ) : (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
