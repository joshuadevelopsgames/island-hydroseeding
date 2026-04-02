import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { InvoiceStatus } from '@/lib/invoicesTypes';
import { useInvoiceDetail, useInvoicesMutations } from '@/hooks/useInvoices';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatInVancouver } from '@/lib/vancouverTime';
import { generateInvoicePdf } from '@/lib/invoicePdf';
import {
  ArrowLeft,
  Loader2,
  Save,
  Trash2,
  Send,
  CheckCircle,
  Plus,
  Download,
  Link,
  Copy,
  Check,
} from 'lucide-react';

interface AccountOption {
  id: string;
  name: string;
}

const STATUS_COLORS: Record<InvoiceStatus, 'default' | 'secondary' | 'outline'> =
  {
    Draft: 'outline',
    Sent: 'secondary',
    Viewed: 'secondary',
    Paid: 'default',
    Overdue: 'outline',
    'Bad Debt': 'outline',
  };

interface CreateFormData {
  title: string;
  account_id: string;
  issue_date: string;
  due_date: string;
  payment_terms: string;
  notes: string;
}

interface LineItemForm {
  product_service_name: string;
  description: string;
  quantity: number;
  unit_price: number;
}

interface PaymentForm {
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number: string;
  notes: string;
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNewInvoice = id === 'new';

  const { data: bundle, isLoading, error } = useInvoiceDetail(
    isNewInvoice ? undefined : id
  );
  const mutations = useInvoicesMutations();

  // Create form state
  const [createFormData, setCreateFormData] = useState<CreateFormData>({
    title: '',
    account_id: '',
    issue_date: '',
    due_date: '',
    payment_terms: '',
    notes: '',
  });

  // Detail page state
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(bundle?.invoice.notes ?? '');
  const [lineItemForm, setLineItemForm] = useState<LineItemForm>({
    product_service_name: '',
    description: '',
    quantity: 1,
    unit_price: 0,
  });
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    amount: 0,
    payment_method: 'e-transfer',
    payment_date: '',
    reference_number: '',
    notes: '',
  });

  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied]   = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);

  // Account selector for create mode
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  useEffect(() => {
    if (!isNewInvoice) return;
    fetch('/api/crm?action=accounts')
      .then(r => r.json())
      .then((d: { accounts?: AccountOption[] }) => setAccounts(d.accounts ?? []))
      .catch(() => {});
  }, [isNewInvoice]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await mutations.createInvoice.mutateAsync({ ...createFormData });
      navigate(`/invoices/${result.invoice.id}`);
    } catch (err) {
      console.error('Failed to create invoice:', err);
    }
  };

  const handleUpdateNotes = async () => {
    if (!bundle) return;
    try {
      await mutations.updateInvoice.mutateAsync({
        id: bundle.invoice.id,
        notes,
      });
      setEditingNotes(false);
    } catch (err) {
      console.error('Failed to update notes:', err);
    }
  };

  const handleAddLineItem = async () => {
    if (!bundle || !lineItemForm.product_service_name) return;
    try {
      await mutations.createLineItem.mutateAsync({
        invoice_id: bundle.invoice.id,
        ...lineItemForm,
      });
      setLineItemForm({
        product_service_name: '',
        description: '',
        quantity: 1,
        unit_price: 0,
      });
    } catch (err) {
      console.error('Failed to add line item:', err);
    }
  };

  const handleDeleteLineItem = async (lineItemId: string) => {
    if (!bundle) return;
    try {
      await mutations.deleteLineItem.mutateAsync(lineItemId);
    } catch (err) {
      console.error('Failed to delete line item:', err);
    }
  };

  const handleAddPayment = async () => {
    if (!bundle || !paymentForm.amount || !paymentForm.payment_date) return;
    try {
      await mutations.createPayment.mutateAsync({
        invoice_id: bundle.invoice.id,
        ...paymentForm,
      });
      setPaymentForm({
        amount: 0,
        payment_method: 'e-transfer',
        payment_date: '',
        reference_number: '',
        notes: '',
      });
    } catch (err) {
      console.error('Failed to add payment:', err);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!bundle) return;
    try {
      await mutations.deletePayment.mutateAsync(paymentId);
    } catch (err) {
      console.error('Failed to delete payment:', err);
    }
  };

  const handleSendInvoice = async () => {
    if (!bundle) return;
    try {
      await mutations.sendInvoice.mutateAsync({ id: bundle.invoice.id });
    } catch (err) {
      console.error('Failed to send invoice:', err);
    }
  };

  const handleMarkPaid = async () => {
    if (!bundle) return;
    try {
      await mutations.markPaid.mutateAsync({ id: bundle.invoice.id });
    } catch (err) {
      console.error('Failed to mark invoice as paid:', err);
    }
  };

  const handleDownloadPdf = async () => {
    if (!bundle) return;
    try {
      const pdf = generateInvoicePdf(
        bundle.invoice,
        bundle.line_items,
        bundle.payments,
        bundle.account,
        bundle.property
      );
      pdf.save(
        `Invoice-${String(bundle.invoice.invoice_number).padStart(4, '0')}.pdf`
      );
    } catch (err) {
      console.error('Failed to generate PDF:', err);
    }
  };

  const handleGetPaymentLink = async () => {
    if (!bundle) return;
    if (paymentLink) {
      await navigator.clipboard.writeText(paymentLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      return;
    }
    setLinkLoading(true);
    try {
      const res = await fetch('/api/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_payment_link', invoice_id: bundle.invoice.id }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.error) throw new Error(data.error);
      setPaymentLink(data.url ?? null);
      if (data.url) {
        await navigator.clipboard.writeText(data.url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to get payment link:', err);
    } finally {
      setLinkLoading(false);
    }
  };

  const handleDeleteInvoice = async () => {
    if (!bundle) return;
    if (!window.confirm('Are you sure you want to delete this invoice?'))
      return;
    try {
      await mutations.deleteInvoice.mutateAsync(bundle.invoice.id);
      navigate('/invoices');
    } catch (err) {
      console.error('Failed to delete invoice:', err);
    }
  };

  // CREATE MODE
  if (isNewInvoice) {
    return (
      <div className="page-container">
        {/* Back */}
        <button
          type="button"
          onClick={() => navigate('/invoices')}
          className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Invoices
        </button>

        <div className="page-header">
          <h1 className="page-title">Create Invoice</h1>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm">
          <form onSubmit={handleCreateSubmit} className="space-y-5">

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Title
              </label>
              <input
                type="text"
                placeholder="—"
                value={createFormData.title}
                onChange={(e) => setCreateFormData({ ...createFormData, title: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Client */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Client
              </label>
              {accounts.length > 0 ? (
                <select
                  value={createFormData.account_id}
                  onChange={(e) => setCreateFormData({ ...createFormData, account_id: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">— Select a client —</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="—"
                  value={createFormData.account_id}
                  onChange={(e) => setCreateFormData({ ...createFormData, account_id: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Issue Date
                </label>
                <input
                  type="date"
                  value={createFormData.issue_date}
                  onChange={(e) => setCreateFormData({ ...createFormData, issue_date: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Due Date
                </label>
                <input
                  type="date"
                  value={createFormData.due_date}
                  onChange={(e) => setCreateFormData({ ...createFormData, due_date: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Payment Terms */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Payment Terms
              </label>
              <input
                type="text"
                placeholder="—"
                value={createFormData.payment_terms}
                onChange={(e) => setCreateFormData({ ...createFormData, payment_terms: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Notes
              </label>
              <textarea
                placeholder="—"
                value={createFormData.notes}
                onChange={(e) => setCreateFormData({ ...createFormData, notes: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                rows={4}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <button
                type="submit"
                disabled={mutations.createInvoice.isPending}
                className="btn btn-primary gap-2"
              >
                {mutations.createInvoice.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Save className="h-4 w-4" />}
                Create Invoice
              </button>
              <button
                type="button"
                onClick={() => navigate('/invoices')}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>

          </form>
        </div>
      </div>
    );
  }

  // DETAIL MODE
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">
          {error?.message || 'Invoice not found'}
        </p>
        <Button variant="ghost" onClick={() => navigate('/invoices')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Invoices
        </Button>
      </div>
    );
  }

  const invoice = bundle.invoice;
  const lineItems = bundle.line_items ?? [];
  const payments = bundle.payments ?? [];
  const account = bundle.account;
  const property = bundle.property;

  const formatter = new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  });

  const subtotal = lineItems.reduce(
    (sum, item) => sum + (item.quantity ?? 0) * (item.unit_price ?? 0),
    0
  );
  const gst = subtotal * 0.05;
  const total = subtotal + gst;
  const amountPaid = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const balanceDue = total - amountPaid;

  return (
    <div className="page-container">
      {/* Back Button */}
      <button
        type="button"
        onClick={() => navigate('/invoices')}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Invoices
      </button>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            Invoice #{String(invoice.invoice_number).padStart(4, '0')}
          </h1>
          {invoice.title && (
            <p className="mt-1 text-sm text-muted-foreground">{invoice.title}</p>
          )}
        </div>
        <Badge variant={STATUS_COLORS[invoice.status as InvoiceStatus]}>
          {invoice.status}
        </Badge>
      </div>

      {/* Client/Property Info */}
      <div className="mt-6 mb-6 grid grid-cols-2 gap-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</p>
          <p className="mt-1.5 text-base font-semibold text-foreground">{account?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Property</p>
          <p className="mt-1.5 text-base font-semibold text-foreground">{property?.address ?? '—'}</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {invoice.status === 'Draft' && (
          <button
            onClick={handleSendInvoice}
            disabled={mutations.sendInvoice.isPending}
            className="btn btn-primary gap-2"
          >
            {mutations.sendInvoice.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />}
            Send Invoice
          </button>
        )}

        {(invoice.status === 'Sent' || invoice.status === 'Overdue') && (
          <button
            onClick={handleMarkPaid}
            disabled={mutations.markPaid.isPending}
            className="btn btn-primary gap-2"
          >
            {mutations.markPaid.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <CheckCircle className="h-4 w-4" />}
            Mark Paid
          </button>
        )}

        <button
          onClick={handleDownloadPdf}
          className="btn btn-secondary gap-2"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </button>

        {invoice.status !== 'Paid' && (
          <button
            onClick={handleGetPaymentLink}
            disabled={linkLoading}
            className="btn btn-secondary gap-2"
          >
            {linkLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : linkCopied
                ? <Check className="h-4 w-4 text-green-600" />
                : paymentLink
                  ? <Copy className="h-4 w-4" />
                  : <Link className="h-4 w-4" />}
            {linkCopied ? 'Copied!' : paymentLink ? 'Copy Payment Link' : 'Get Payment Link'}
          </button>
        )}

        <button
          onClick={handleDeleteInvoice}
          className="btn btn-danger gap-2 ml-auto"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>

      {paymentLink && (
        <div className="mb-6 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground break-all">
          {paymentLink}
        </div>
      )}

      {/* Invoice Details */}
      <div className="mb-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-foreground">Invoice Details</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Issue Date</p>
            <p className="mt-1.5 text-sm font-medium text-foreground">
              {formatInVancouver(new Date(invoice.issue_date), 'MMM d, yyyy')}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Due Date</p>
            <p className="mt-1.5 text-sm font-medium text-foreground">
              {formatInVancouver(new Date(invoice.due_date), 'MMM d, yyyy')}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Terms</p>
            <p className="mt-1.5 text-sm font-medium text-foreground">{invoice.payment_terms ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="mb-6 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Line Items</h2>
        </div>

        {lineItems.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product/Service</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qty</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unit Price</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                  <th className="w-10 px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lineItems.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground">{item.product_service_name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{item.description ?? '—'}</td>
                    <td className="px-5 py-3 text-center text-foreground">{item.quantity ?? 0}</td>
                    <td className="px-5 py-3 text-right text-foreground">{formatter.format(item.unit_price ?? 0)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-foreground">
                      {formatter.format((item.quantity ?? 0) * (item.unit_price ?? 0))}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleDeleteLineItem(item.id)}
                        className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Line Item Form */}
        <div className="border-t border-border bg-muted/20 px-6 py-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Add Line Item</h3>
          <div className="grid gap-3">
            <input
              type="text"
              placeholder="Product / service name"
              value={lineItemForm.product_service_name}
              onChange={(e) => setLineItemForm({ ...lineItemForm, product_service_name: e.target.value })}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={lineItemForm.description}
              onChange={(e) => setLineItemForm({ ...lineItemForm, description: e.target.value })}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Quantity</label>
                <input
                  type="number"
                  placeholder="—"
                  min="0"
                  step="0.01"
                  value={lineItemForm.quantity}
                  onChange={(e) => setLineItemForm({ ...lineItemForm, quantity: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Unit Price</label>
                <input
                  type="number"
                  placeholder="—"
                  min="0"
                  step="0.01"
                  value={lineItemForm.unit_price}
                  onChange={(e) => setLineItemForm({ ...lineItemForm, unit_price: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleAddLineItem}
                  disabled={mutations.createLineItem.isPending}
                  className="btn btn-primary w-full gap-2"
                >
                  {mutations.createLineItem.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Plus className="h-4 w-4" />}
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="mb-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-2 text-sm">
          <div className="flex justify-end gap-6">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="w-32 text-right font-medium text-foreground">{formatter.format(subtotal)}</span>
          </div>
          <div className="flex justify-end gap-6">
            <span className="text-muted-foreground">GST (5%)</span>
            <span className="w-32 text-right font-medium text-foreground">{formatter.format(gst)}</span>
          </div>
          <div className="border-t border-border pt-2 mt-2">
            <div className="flex justify-end gap-6">
              <span className="font-semibold text-foreground">Total</span>
              <span className="w-32 text-right text-base font-bold text-foreground">{formatter.format(total)}</span>
            </div>
          </div>
          <div className="flex justify-end gap-6 pt-1">
            <span className="text-muted-foreground">Amount Paid</span>
            <span className="w-32 text-right font-medium text-foreground">{formatter.format(amountPaid)}</span>
          </div>
          <div className="border-t border-border pt-2 mt-1">
            <div className="flex justify-end gap-6">
              <span className={`font-semibold ${balanceDue > 0 ? 'text-amber-600' : 'text-green-600'}`}>Balance Due</span>
              <span className={`w-32 text-right text-base font-bold ${balanceDue > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {formatter.format(balanceDue)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Payments */}
      <div className="mb-6 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Payments</h2>
        </div>

        {payments.length > 0 && (
          <div className="divide-y divide-border">
            {payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between px-6 py-4 hover:bg-muted/20 transition-colors">
                <div className="flex-1">
                  <div className="flex items-baseline gap-4">
                    <p className="font-semibold text-foreground">{formatter.format(payment.amount ?? 0)}</p>
                    <p className="text-sm text-muted-foreground capitalize">{payment.payment_method}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatInVancouver(new Date(payment.payment_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  {(payment.reference_number || payment.notes) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {payment.reference_number && <>Ref: {payment.reference_number}</>}
                      {payment.reference_number && payment.notes && ' · '}
                      {payment.notes && <>{payment.notes}</>}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDeletePayment(payment.id)}
                  className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Record Payment Form */}
        <div className="border-t border-border bg-muted/20 px-6 py-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Record Payment</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Amount</label>
              <input
                type="number"
                placeholder="—"
                min="0"
                step="0.01"
                value={paymentForm.amount || ''}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Payment Date</label>
              <input
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Method</label>
              <select
                value={paymentForm.payment_method}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="e-transfer">E-Transfer</option>
                <option value="credit card">Credit Card</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Reference #</label>
              <input
                type="text"
                placeholder="—"
                value={paymentForm.reference_number}
                onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">Notes</label>
              <textarea
                placeholder="—"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                rows={2}
              />
            </div>
          </div>
          <div className="mt-3">
            <button
              onClick={handleAddPayment}
              disabled={mutations.createPayment.isPending}
              className="btn btn-primary gap-2"
            >
              {mutations.createPayment.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Plus className="h-4 w-4" />}
              Record Payment
            </button>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-foreground">Notes</h2>

        {editingNotes ? (
          <div className="space-y-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              rows={4}
            />
            <div className="flex gap-2">
              <button
                onClick={handleUpdateNotes}
                disabled={mutations.updateInvoice.isPending}
                className="btn btn-primary gap-2"
              >
                {mutations.updateInvoice.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Save className="h-4 w-4" />}
                Save
              </button>
              <button
                onClick={() => { setEditingNotes(false); setNotes(invoice.notes ?? ''); }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {notes || <span className="text-muted-foreground">—</span>}
            </p>
            <button
              onClick={() => setEditingNotes(true)}
              className="btn btn-secondary mt-4"
            >
              Edit Notes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
