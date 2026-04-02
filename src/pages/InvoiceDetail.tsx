import { useState } from 'react';
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
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-2xl">
          <Button
            variant="ghost"
            onClick={() => navigate('/invoices')}
            className="mb-8 gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          <div className="rounded-lg bg-white p-8 shadow-sm">
            <h1 className="mb-6 text-2xl font-bold">Create Invoice</h1>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Title
                </label>
                <input
                  type="text"
                  placeholder="—"
                  value={createFormData.title}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      title: e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Account ID
                </label>
                <input
                  type="text"
                  placeholder="—"
                  value={createFormData.account_id}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      account_id: e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Issue Date
                  </label>
                  <input
                    type="date"
                    value={createFormData.issue_date}
                    onChange={(e) =>
                      setCreateFormData({
                        ...createFormData,
                        issue_date: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={createFormData.due_date}
                    onChange={(e) =>
                      setCreateFormData({
                        ...createFormData,
                        due_date: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Payment Terms
                </label>
                <input
                  type="text"
                  placeholder="—"
                  value={createFormData.payment_terms}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      payment_terms: e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Notes
                </label>
                <textarea
                  placeholder="—"
                  value={createFormData.notes}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      notes: e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  rows={4}
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" className="gap-2">
                  <Save className="h-4 w-4" />
                  Create Invoice
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate('/invoices')}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // DETAIL MODE
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-slate-600">
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
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-4xl">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => navigate('/invoices')}
          className="mb-8 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Invoice #{String(invoice.invoice_number).padStart(4, '0')}
            </h1>
            <p className="mt-1 text-lg text-slate-600">{invoice.title}</p>
          </div>
          <Badge variant={STATUS_COLORS[invoice.status as InvoiceStatus]}>
            {invoice.status}
          </Badge>
        </div>

        {/* Client/Property Info */}
        <div className="mb-8 grid grid-cols-2 gap-6 rounded-lg bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm font-medium text-slate-600">Client</p>
            <p className="mt-1 text-lg font-semibold">{account?.name ?? 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600">Property</p>
            <p className="mt-1 text-lg font-semibold">{property?.address ?? 'N/A'}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mb-8 flex flex-wrap gap-2">
          {invoice.status === 'Draft' && (
            <Button
              onClick={handleSendInvoice}
              disabled={mutations.sendInvoice.isPending}
              className="gap-2"
            >
              {mutations.sendInvoice.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              <Send className="h-4 w-4" />
              Send Invoice
            </Button>
          )}

          {(invoice.status === 'Sent' || invoice.status === 'Overdue') && (
            <Button
              onClick={handleMarkPaid}
              disabled={mutations.markPaid.isPending}
              className="gap-2"
            >
              {mutations.markPaid.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              <CheckCircle className="h-4 w-4" />
              Mark Paid
            </Button>
          )}

          <Button
            onClick={handleDownloadPdf}
            variant="secondary"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Button>

          {invoice.status !== 'Paid' && (
            <Button
              onClick={handleGetPaymentLink}
              disabled={linkLoading}
              variant="secondary"
              className="gap-2"
            >
              {linkLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : linkCopied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : paymentLink ? (
                <Copy className="h-4 w-4" />
              ) : (
                <Link className="h-4 w-4" />
              )}
              {linkCopied ? 'Copied!' : paymentLink ? 'Copy Payment Link' : 'Get Payment Link'}
            </Button>
          )}

          {paymentLink && (
            <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 break-all">
              {paymentLink}
            </div>
          )}

          <Button
            onClick={handleDeleteInvoice}
            variant="destructive"
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>

        {/* Invoice Details */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Invoice Details</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-slate-600">Issue Date</p>
              <p className="mt-1 font-medium">
                {formatInVancouver(new Date(invoice.issue_date), 'MMM d, yyyy')}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Due Date</p>
              <p className="mt-1 font-medium">
                {formatInVancouver(new Date(invoice.due_date), 'MMM d, yyyy')}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Payment Terms</p>
              <p className="mt-1 font-medium">{invoice.payment_terms ?? '—'}</p>
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Line Items</h2>

          {lineItems.length > 0 && (
            <div className="mb-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-2 text-left font-medium text-slate-600">
                      Product/Service
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">
                      Description
                    </th>
                    <th className="px-4 py-2 text-center font-medium text-slate-600">
                      Qty
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-slate-600">
                      Unit Price
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-slate-600">
                      Total
                    </th>
                    <th className="w-10 px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="px-4 py-3">
                        {item.product_service_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {item.description ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.quantity ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatter.format(item.unit_price ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatter.format(
                          (item.quantity ?? 0) * (item.unit_price ?? 0)
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          onClick={() => handleDeleteLineItem(item.id)}
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                        >
                          <Trash2 className="h-4 w-4 text-slate-400" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add Line Item Form */}
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-medium text-slate-700">Add Line Item</h3>
            <div className="grid gap-3">
              <input
                type="text"
                placeholder="—"
                value={lineItemForm.product_service_name}
                onChange={(e) =>
                  setLineItemForm({
                    ...lineItemForm,
                    product_service_name: e.target.value,
                  })
                }
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="—"
                value={lineItemForm.description}
                onChange={(e) =>
                  setLineItemForm({
                    ...lineItemForm,
                    description: e.target.value,
                  })
                }
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="number"
                  placeholder="—"
                  min="0"
                  step="0.01"
                  value={lineItemForm.quantity}
                  onChange={(e) =>
                    setLineItemForm({
                      ...lineItemForm,
                      quantity: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="rounded border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  placeholder="—"
                  min="0"
                  step="0.01"
                  value={lineItemForm.unit_price}
                  onChange={(e) =>
                    setLineItemForm({
                      ...lineItemForm,
                      unit_price: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="rounded border border-slate-300 px-3 py-2 text-sm"
                />
                <Button
                  onClick={handleAddLineItem}
                  disabled={mutations.createLineItem.isPending}
                  size="sm"
                  className="gap-2"
                >
                  {mutations.createLineItem.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Totals */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow-sm">
          <div className="space-y-3 text-right">
            <div className="flex justify-end gap-4">
              <span className="text-slate-600">Subtotal</span>
              <span className="w-32 font-medium">{formatter.format(subtotal)}</span>
            </div>
            <div className="flex justify-end gap-4">
              <span className="text-slate-600">GST (5%)</span>
              <span className="w-32 font-medium">{formatter.format(gst)}</span>
            </div>
            <div className="border-t border-slate-200 pt-3">
              <div className="flex justify-end gap-4">
                <span className="font-semibold">Total</span>
                <span className="w-32 text-lg font-bold">
                  {formatter.format(total)}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-4 pt-2">
              <span className="text-slate-600">Amount Paid</span>
              <span className="w-32 font-medium">{formatter.format(amountPaid)}</span>
            </div>
            <div className="border-t border-slate-200 pt-3">
              <div className="flex justify-end gap-4">
                <span
                  className={`font-semibold ${balanceDue > 0 ? 'text-amber-600' : 'text-green-600'}`}
                >
                  Balance Due
                </span>
                <span
                  className={`w-32 text-lg font-bold ${balanceDue > 0 ? 'text-amber-600' : 'text-green-600'}`}
                >
                  {formatter.format(balanceDue)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Payments */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Payments</h2>

          {payments.length > 0 && (
            <div className="mb-6 space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex-1">
                    <div className="flex items-baseline gap-4">
                      <p className="font-medium">
                        {formatter.format(payment.amount ?? 0)}
                      </p>
                      <p className="text-sm text-slate-600">
                        {payment.payment_method}
                      </p>
                      <p className="text-sm text-slate-600">
                        {formatInVancouver(new Date(payment.payment_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    {(payment.reference_number || payment.notes) && (
                      <p className="mt-1 text-sm text-slate-500">
                        {payment.reference_number && (
                          <>Ref: {payment.reference_number}</>
                        )}
                        {payment.reference_number && payment.notes && ' • '}
                        {payment.notes && <>{payment.notes}</>}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => handleDeletePayment(payment.id)}
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                  >
                    <Trash2 className="h-4 w-4 text-slate-400" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add Payment Form */}
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-medium text-slate-700">Record Payment</h3>
            <div className="grid gap-3">
              <input
                type="number"
                placeholder="—"
                min="0"
                step="0.01"
                value={paymentForm.amount || ''}
                onChange={(e) =>
                  setPaymentForm({
                    ...paymentForm,
                    amount: parseFloat(e.target.value) || 0,
                  })
                }
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) =>
                  setPaymentForm({
                    ...paymentForm,
                    payment_date: e.target.value,
                  })
                }
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={paymentForm.payment_method}
                onChange={(e) =>
                  setPaymentForm({
                    ...paymentForm,
                    payment_method: e.target.value,
                  })
                }
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="e-transfer">E-Transfer</option>
                <option value="credit card">Credit Card</option>
                <option value="other">Other</option>
              </select>
              <input
                type="text"
                placeholder="—"
                value={paymentForm.reference_number}
                onChange={(e) =>
                  setPaymentForm({
                    ...paymentForm,
                    reference_number: e.target.value,
                  })
                }
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <textarea
                placeholder="—"
                value={paymentForm.notes}
                onChange={(e) =>
                  setPaymentForm({
                    ...paymentForm,
                    notes: e.target.value,
                  })
                }
                className="rounded border border-slate-300 px-3 py-2 text-sm"
                rows={2}
              />
              <Button
                onClick={handleAddPayment}
                disabled={mutations.createPayment.isPending}
                size="sm"
                className="gap-2"
              >
                {mutations.createPayment.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                <Plus className="h-4 w-4" />
                Record Payment
              </Button>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Notes</h2>

          {editingNotes ? (
            <div className="space-y-3">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2"
                rows={4}
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleUpdateNotes}
                  disabled={mutations.updateInvoice.isPending}
                  size="sm"
                  className="gap-2"
                >
                  {mutations.updateInvoice.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button
                  onClick={() => {
                    setEditingNotes(false);
                    setNotes(invoice.notes ?? '');
                  }}
                  variant="ghost"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="whitespace-pre-wrap text-slate-700">
                {notes || '—'}
              </p>
              <Button
                onClick={() => setEditingNotes(true)}
                variant="ghost"
                size="sm"
                className="mt-4"
              >
                Edit Notes
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
