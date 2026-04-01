import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Trash2, MoreVertical, Send, Pencil, ChevronDown } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import ConfirmDialog from '../components/ConfirmDialog';
import { useQuoteDetail, useProducts, useTemplates, useQuotesMutations, useAccountProperties } from '@/hooks/useQuotes';
import { useCrmAccounts } from '@/hooks/useCrm';
import { toast } from 'sonner';
import { formatErrorForUi } from '@/lib/quotesApi';
import type { Quote, QuoteLineItem, QuoteBundle, ProductService } from '@/lib/quotesTypes';

const CAD = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const TAX_RATE = 0.05;

function formatCurrency(value: number): string {
  return CAD.format(value);
}

export default function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNewMode = id === 'new';

  if (isNewMode) {
    return <CreateQuoteMode navigate={navigate} />;
  }

  return <ViewEditQuoteMode id={id!} navigate={navigate} />;
}

function CreateQuoteMode({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  const { data: accounts } = useCrmAccounts();
  const { data: products } = useProducts();
  const { data: templates } = useTemplates();
  const { createQuote } = useQuotesMutations();

  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const { data: properties } = useAccountProperties(selectedAccountId);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [introduction, setIntroduction] = useState<string>('');
  const [contractDisclaimer, setContractDisclaimer] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [lineItems, setLineItems] = useState<Array<{ product_service_name: string; description: string | null; quantity: number; unit_price: number; sort_order: number }>>(
    []
  );
  const [showLineItemDialog, setShowLineItemDialog] = useState(false);
  const [currentLineItem, setCurrentLineItem] = useState<{
    idx: number | null;
    product_service_name: string;
    description: string | null;
    quantity: number;
    unit_price: number;
  }>({
    idx: null,
    product_service_name: '',
    description: null,
    quantity: 1,
    unit_price: 0,
  });

  const _selectedTemplate = templates?.find((t) => t.id === selectedTemplateId);
  const selectedAccount = accounts?.find((a) => a.id === selectedAccountId);
  const selectedProperty = properties?.find((p) => p.id === selectedPropertyId);

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const t = templates?.find((x) => x.id === templateId);
    if (t) {
      setIntroduction(t.introduction_text ?? '');
      setContractDisclaimer(t.contract_text ?? '');
      if (t.line_items_json && t.line_items_json.length > 0) {
        setLineItems(t.line_items_json);
      }
    }
  };

  const handleAddLineItem = () => {
    setCurrentLineItem({
      idx: null,
      product_service_name: '',
      description: null,
      quantity: 1,
      unit_price: 0,
    });
    setShowLineItemDialog(true);
  };

  const handleEditLineItem = (idx: number) => {
    const item = lineItems[idx];
    setCurrentLineItem({
      idx,
      product_service_name: item.product_service_name,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
    });
    setShowLineItemDialog(true);
  };

  const handleSaveLineItem = () => {
    if (!currentLineItem.product_service_name.trim()) {
      toast.error('Product/service name is required');
      return;
    }
    if (currentLineItem.quantity <= 0 || currentLineItem.unit_price < 0) {
      toast.error('Quantity must be > 0 and unit price must be >= 0');
      return;
    }

    const newItems = [...lineItems];
    if (currentLineItem.idx !== null) {
      newItems[currentLineItem.idx] = {
        product_service_name: currentLineItem.product_service_name,
        description: currentLineItem.description,
        quantity: currentLineItem.quantity,
        unit_price: currentLineItem.unit_price,
        sort_order: currentLineItem.idx,
      };
    } else {
      newItems.push({
        product_service_name: currentLineItem.product_service_name,
        description: currentLineItem.description,
        quantity: currentLineItem.quantity,
        unit_price: currentLineItem.unit_price,
        sort_order: newItems.length,
      });
    }
    setLineItems(newItems);
    setShowLineItemDialog(false);
  };

  const handleDeleteLineItem = (idx: number) => {
    setLineItems(lineItems.filter((_, i) => i !== idx));
  };

  const handleSaveDraft = async () => {
    if (!selectedAccountId) {
      toast.error('Please select a client');
      return;
    }
    if (lineItems.length === 0) {
      toast.error('Please add at least one line item');
      return;
    }

    const finalTitle = title.trim() || `Hydroseeding - ${selectedProperty?.address || selectedAccount?.address || 'Untitled'}`;

    try {
      const response = await createQuote.mutateAsync({
        account_id: selectedAccountId,
        property_id: selectedPropertyId || null,
        title: finalTitle,
        introduction,
        contract_disclaimer: contractDisclaimer,
        notes,
        line_items_json: lineItems,
        status: 'Draft',
      } as Record<string, unknown>);

      const newQuote = (response as { quote?: Quote })?.quote;
      if (newQuote?.id) {
        toast.success('Quote saved as draft');
        navigate(`/quotes/${newQuote.id}`);
      }
    } catch (err) {
      toast.error(formatErrorForUi(err));
    }
  };

  const handleSendQuote = async () => {
    if (!selectedAccountId) {
      toast.error('Please select a client');
      return;
    }
    if (lineItems.length === 0) {
      toast.error('Please add at least one line item');
      return;
    }

    const finalTitle = title.trim() || `Hydroseeding - ${selectedProperty?.address || selectedAccount?.address || 'Untitled'}`;

    try {
      const response = await createQuote.mutateAsync({
        account_id: selectedAccountId,
        property_id: selectedPropertyId || null,
        title: finalTitle,
        introduction,
        contract_disclaimer: contractDisclaimer,
        notes,
        line_items_json: lineItems,
        status: 'Sent',
      } as Record<string, unknown>);

      const newQuote = (response as { quote?: Quote })?.quote;
      if (newQuote?.id) {
        toast.success('Quote created and sent');
        navigate(`/quotes/${newQuote.id}`);
      }
    } catch (err) {
      toast.error(formatErrorForUi(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/quotes" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary-green)]">
          <ArrowLeft className="h-4 w-4" /> Quotes
        </Link>
        <h1>New Quote</h1>
      </div>

      <LineItemDialog
        open={showLineItemDialog}
        onOpenChange={setShowLineItemDialog}
        currentLineItem={currentLineItem}
        setCurrentLineItem={setCurrentLineItem}
        products={products ?? []}
        onSave={handleSaveLineItem}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Client & Property</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="account">Client *</Label>
                <select
                  id="account"
                  value={selectedAccountId}
                  onChange={(e) => {
                    setSelectedAccountId(e.target.value);
                    setSelectedPropertyId('');
                  }}
                  className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--primary-green)] focus:ring-opacity-50"
                >
                  <option value="">Select a client</option>
                  {accounts?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedAccountId && (
                <div className="space-y-2">
                  <Label htmlFor="property">Property</Label>
                  <select
                    id="property"
                    value={selectedPropertyId}
                    onChange={(e) => setSelectedPropertyId(e.target.value)}
                    className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--primary-green)] focus:ring-opacity-50"
                  >
                    <option value="">Select a property</option>
                    {properties?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.address}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quote Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={selectedProperty?.address ? `Hydroseeding - ${selectedProperty.address}` : 'Hydroseeding - [address]'}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template">Template (optional)</Label>
                <select
                  id="template"
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--primary-green)] focus:ring-opacity-50"
                >
                  <option value="">No template</option>
                  {templates?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">Line Items</CardTitle>
                <CardDescription>Products and services</CardDescription>
              </div>
              <Button size="sm" onClick={handleAddLineItem}>
                Add Line Item
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {lineItems.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No line items yet. Add one to get started.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border-color)]">
                          <th className="py-2 text-left font-semibold">Product/Service</th>
                          <th className="py-2 text-right font-semibold">Qty</th>
                          <th className="py-2 text-right font-semibold">Unit Price</th>
                          <th className="py-2 text-right font-semibold">Total</th>
                          <th className="py-2 text-right font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item, idx) => (
                          <tr key={idx} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                            <td className="py-3 pr-2">
                              <div>
                                <p className="font-medium">{item.product_service_name}</p>
                                {item.description && <p className="text-xs text-[var(--text-muted)]">{item.description}</p>}
                              </div>
                            </td>
                            <td className="py-3 text-right">{item.quantity}</td>
                            <td className="py-3 text-right">{formatCurrency(item.unit_price)}</td>
                            <td className="py-3 text-right font-semibold">{formatCurrency(item.quantity * item.unit_price)}</td>
                            <td className="py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => handleEditLineItem(idx)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDeleteLineItem(idx)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Separator />

                  <div className="flex flex-col items-end gap-1 text-sm">
                    <p>
                      <span className="text-[var(--text-secondary)]">Subtotal: </span>
                      <span className="font-semibold">{formatCurrency(subtotal)}</span>
                    </p>
                    <p>
                      <span className="text-[var(--text-secondary)]">GST (5%): </span>
                      <span className="font-semibold">{formatCurrency(tax)}</span>
                    </p>
                    <p className="pt-1 text-base font-bold">
                      <span className="text-[var(--text-secondary)]">Total: </span>
                      <span>{formatCurrency(total)}</span>
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Introduction</CardTitle>
              <CardDescription>Opening text for the quote</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={introduction} onChange={(e) => setIntroduction(e.target.value)} rows={4} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contract & Disclaimer</CardTitle>
              <CardDescription>Terms and conditions</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={contractDisclaimer} onChange={(e) => setContractDisclaimer(e.target.value)} rows={4} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notes</CardTitle>
              <CardDescription>Internal notes only</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-[var(--text-muted)]">Client</p>
                <p className="font-semibold">{selectedAccount?.name || '—'}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Property</p>
                <p className="font-semibold">{selectedProperty?.address || selectedAccount?.address || '—'}</p>
              </div>
              <Separator />
              <div>
                <p className="text-[var(--text-muted)]">Line Items</p>
                <p className="font-semibold">{lineItems.length}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Subtotal</p>
                <p className="font-semibold">{formatCurrency(subtotal)}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Tax (5%)</p>
                <p className="font-semibold">{formatCurrency(tax)}</p>
              </div>
              <div className="rounded-[var(--radius-sm)] bg-[var(--bg-secondary)] p-3">
                <p className="text-[var(--text-muted)]">Total</p>
                <p className="text-lg font-bold">{formatCurrency(total)}</p>
              </div>
              <Separator />
              <div className="flex flex-col gap-2">
                <Button onClick={handleSaveDraft} disabled={createQuote.isPending} className="w-full">
                  Save as Draft
                </Button>
                <Button onClick={handleSendQuote} disabled={createQuote.isPending} variant="default" className="w-full">
                  Save & Send
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ViewEditQuoteMode({ id, navigate }: { id: string; navigate: ReturnType<typeof useNavigate> }) {
  const { data, isLoading, isError, error, refetch } = useQuoteDetail(id);
  const { deleteQuote, sendQuote, convertQuote, updateLineItem, deleteLineItem } = useQuotesMutations();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editLineItemOpen, setEditLineItemOpen] = useState(false);
  const [selectedLineItem, setSelectedLineItem] = useState<QuoteLineItem | null>(null);
  const [editLineItemValues, setEditLineItemValues] = useState({ quantity: 1, unit_price: 0 });
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const bundle = data as QuoteBundle | undefined;
  const quote = bundle?.quote;
  const lineItems = bundle?.line_items ?? [];
  const account = bundle?.account;
  const property = bundle?.property;

  if (isLoading) {
    return (
      <div className="space-y-6 text-sm text-[var(--text-muted)]">
        <Link to="/quotes" className="inline-flex items-center gap-2 font-semibold text-[var(--primary-green)]">
          <ArrowLeft className="h-4 w-4" /> Quotes
        </Link>
        <div className="flex items-center gap-3 py-12">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading quote…</span>
        </div>
      </div>
    );
  }

  if (isError || !quote) {
    return (
      <div className="space-y-4">
        <Link to="/quotes" className="inline-flex items-center gap-2 font-semibold text-[var(--primary-green)]">
          <ArrowLeft className="h-4 w-4" /> Back to quotes
        </Link>
        <p className="text-sm text-[var(--color-danger)]">{isError ? formatErrorForUi(error) : 'Quote not found.'}</p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  const handleDeleteQuote = async () => {
    try {
      await deleteQuote.mutateAsync(quote.id);
      toast.success('Quote deleted');
      navigate('/quotes');
    } catch (err) {
      toast.error(formatErrorForUi(err));
    }
  };

  const handleSendQuote = async () => {
    try {
      await sendQuote.mutateAsync({ id: quote.id });
      toast.success('Quote sent');
      await refetch();
    } catch (err) {
      toast.error(formatErrorForUi(err));
    }
  };

  const handleConvertToJob = async () => {
    try {
      await convertQuote.mutateAsync({ id: quote.id });
      toast.success('Quote converted to job');
      await refetch();
    } catch (err) {
      toast.error(formatErrorForUi(err));
    }
  };

  const handleEditLineItem = (item: QuoteLineItem) => {
    setSelectedLineItem(item);
    setEditLineItemValues({ quantity: item.quantity, unit_price: item.unit_price });
    setEditLineItemOpen(true);
  };

  const handleSaveLineItemEdit = async () => {
    if (!selectedLineItem) return;
    try {
      await updateLineItem.mutateAsync({
        id: selectedLineItem.id,
        quantity: editLineItemValues.quantity,
        unit_price: editLineItemValues.unit_price,
      });
      toast.success('Line item updated');
      setEditLineItemOpen(false);
      await refetch();
    } catch (err) {
      toast.error(formatErrorForUi(err));
    }
  };

  const handleDeleteLineItem = async (itemId: string) => {
    try {
      await deleteLineItem.mutateAsync(itemId);
      toast.success('Line item deleted');
      await refetch();
    } catch (err) {
      toast.error(formatErrorForUi(err));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Draft':
        return 'secondary';
      case 'Sent':
        return 'outline';
      case 'Approved':
        return 'default';
      case 'Converted':
        return 'default';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={deleteOpen}
        title="Delete this quote?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => void handleDeleteQuote()}
        onCancel={() => setDeleteOpen(false)}
      />

      <Dialog open={editLineItemOpen} onOpenChange={setEditLineItemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Line Item</DialogTitle>
            <DialogDescription>{selectedLineItem?.product_service_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-qty">Quantity</Label>
              <Input
                id="edit-qty"
                type="number"
                min="1"
                value={editLineItemValues.quantity}
                onChange={(e) => setEditLineItemValues({ ...editLineItemValues, quantity: parseFloat(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-price">Unit Price</Label>
              <Input
                id="edit-price"
                type="number"
                min="0"
                step="0.01"
                value={editLineItemValues.unit_price}
                onChange={(e) => setEditLineItemValues({ ...editLineItemValues, unit_price: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <p className="text-sm">
              Total: <span className="font-semibold">{formatCurrency(editLineItemValues.quantity * editLineItemValues.unit_price)}</span>
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setEditLineItemOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSaveLineItemEdit()} disabled={updateLineItem.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/quotes" className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary-green)]">
            <ArrowLeft className="h-4 w-4" /> Quotes
          </Link>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1>{quote.title}</h1>
            <Badge variant={getStatusColor(quote.status) as any}>{quote.status}</Badge>
          </div>
          {quote.quote_number && <p className="text-sm text-[var(--text-muted)]">Quote #{quote.quote_number}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleSendQuote}>
            <Send className="h-4 w-4" />
            Send
          </Button>
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
            {moreMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--popup-bg)] shadow-lg z-50">
                <button
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-[var(--bg-secondary)] first:rounded-t-[var(--radius-sm)]"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    // TODO: Duplicate quote
                  }}
                >
                  Duplicate
                </button>
                <button
                  className="block w-full px-4 py-2 text-left text-sm text-[var(--color-danger)] hover:bg-[var(--bg-secondary)] last:rounded-b-[var(--radius-sm)]"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {account && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Client</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <p className="font-semibold">{account.name}</p>
                  {account.company && <p className="text-[var(--text-secondary)]">{account.company}</p>}
                </div>
                {property && (
                  <div>
                    <p className="text-[var(--text-muted)]">Property</p>
                    <p className="font-semibold">{property.address}</p>
                  </div>
                )}
                {(account.phone || account.email) && (
                  <div className="flex flex-col gap-1">
                    {account.phone && (
                      <p>
                        <span className="text-[var(--text-muted)]">Phone:</span> {account.phone}
                      </p>
                    )}
                    {account.email && (
                      <p>
                        <span className="text-[var(--text-muted)]">Email:</span> {account.email}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Line Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {lineItems.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No line items.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border-color)]">
                          <th className="py-2 text-left font-semibold">Product/Service</th>
                          <th className="py-2 text-right font-semibold">Qty</th>
                          <th className="py-2 text-right font-semibold">Unit Price</th>
                          <th className="py-2 text-right font-semibold">Total</th>
                          <th className="py-2 text-right font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item) => (
                          <tr key={item.id} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                            <td className="py-3 pr-2">
                              <div>
                                <p className="font-medium">{item.product_service_name}</p>
                                {item.description && <p className="text-xs text-[var(--text-muted)]">{item.description}</p>}
                              </div>
                            </td>
                            <td className="py-3 text-right">{item.quantity}</td>
                            <td className="py-3 text-right">{formatCurrency(item.unit_price)}</td>
                            <td className="py-3 text-right font-semibold">{formatCurrency(item.quantity * item.unit_price)}</td>
                            <td className="py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => handleEditLineItem(item)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => void handleDeleteLineItem(item.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Separator />

                  <div className="flex flex-col items-end gap-1 text-sm">
                    <p>
                      <span className="text-[var(--text-secondary)]">Subtotal: </span>
                      <span className="font-semibold">{formatCurrency(subtotal)}</span>
                    </p>
                    <p>
                      <span className="text-[var(--text-secondary)]">GST (5%): </span>
                      <span className="font-semibold">{formatCurrency(tax)}</span>
                    </p>
                    <p className="pt-1 text-base font-bold">
                      <span className="text-[var(--text-secondary)]">Total: </span>
                      <span>{formatCurrency(total)}</span>
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {quote.introduction && (
            <CollapsibleCard title="Introduction" content={quote.introduction} />
          )}

          {quote.contract_disclaimer && (
            <CollapsibleCard title="Contract & Disclaimer" content={quote.contract_disclaimer} />
          )}

          {quote.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{quote.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg">Quote Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {quote.quote_number && (
                <div>
                  <p className="text-[var(--text-muted)]">Quote #</p>
                  <p className="font-semibold">{quote.quote_number}</p>
                </div>
              )}
              <div>
                <p className="text-[var(--text-muted)]">Status</p>
                <Badge variant={getStatusColor(quote.status) as any} className="mt-1">
                  {quote.status}
                </Badge>
              </div>
              {quote.salesperson_id && (
                <div>
                  <p className="text-[var(--text-muted)]">Salesperson ID</p>
                  <p className="font-semibold">{quote.salesperson_id}</p>
                </div>
              )}
              {quote.created_at && (
                <div>
                  <p className="text-[var(--text-muted)]">Created</p>
                  <p className="font-semibold">{new Date(quote.created_at).toLocaleDateString('en-CA')}</p>
                </div>
              )}
              {quote.sent_at && (
                <div>
                  <p className="text-[var(--text-muted)]">Sent</p>
                  <p className="font-semibold">{new Date(quote.sent_at).toLocaleDateString('en-CA')}</p>
                </div>
              )}
              {quote.approved_at && (
                <div>
                  <p className="text-[var(--text-muted)]">Approved</p>
                  <p className="font-semibold">{new Date(quote.approved_at).toLocaleDateString('en-CA')}</p>
                </div>
              )}
              <Separator />
              <div>
                <p className="text-[var(--text-muted)]">Subtotal</p>
                <p className="font-semibold">{formatCurrency(subtotal)}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Tax (5%)</p>
                <p className="font-semibold">{formatCurrency(tax)}</p>
              </div>
              <div className="rounded-[var(--radius-sm)] bg-[var(--bg-secondary)] p-3">
                <p className="text-[var(--text-muted)]">Total</p>
                <p className="text-lg font-bold">{formatCurrency(total)}</p>
              </div>
              <Separator />
              <div className="flex flex-col gap-2">
                {quote.status === 'Draft' && (
                  <>
                    <Button onClick={handleSendQuote} disabled={sendQuote.isPending} className="w-full">
                      Send Quote
                    </Button>
                  </>
                )}
                {(quote.status === 'Sent' || quote.status === 'Awaiting Response') && (
                  <Button onClick={handleConvertToJob} disabled={convertQuote.isPending} variant="default" className="w-full">
                    Convert to Job
                  </Button>
                )}
                {quote.status === 'Approved' && (
                  <Button onClick={handleConvertToJob} disabled={convertQuote.isPending} variant="default" className="w-full">
                    Convert to Job
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CollapsibleCard({ title, content }: { title: string; content: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between"
        >
          <CardTitle className="text-lg">{title}</CardTitle>
          <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </CardHeader>
      {expanded && (
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{content}</p>
        </CardContent>
      )}
    </Card>
  );
}

function LineItemDialog({
  open,
  onOpenChange,
  currentLineItem,
  setCurrentLineItem,
  products,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLineItem: {
    idx: number | null;
    product_service_name: string;
    description: string | null;
    quantity: number;
    unit_price: number;
  };
  setCurrentLineItem: (item: typeof currentLineItem) => void;
  products: ProductService[];
  onSave: () => void;
}) {
  const total = currentLineItem.quantity * currentLineItem.unit_price;

  const handleProductSelect = (product: ProductService) => {
    setCurrentLineItem({
      ...currentLineItem,
      product_service_name: product.name,
      description: product.description,
      unit_price: product.default_unit_price ?? 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{currentLineItem.idx !== null ? 'Edit Line Item' : 'Add Line Item'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-select">Product/Service</Label>
            <select
              id="product-select"
              value=""
              onChange={(e) => {
                const product = products.find((p) => p.id === e.target.value);
                if (product) handleProductSelect(product);
              }}
              className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--primary-green)] focus:ring-opacity-50"
            >
              <option value="">Or select from catalog…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="li-name">Product/Service Name *</Label>
            <Input
              id="li-name"
              value={currentLineItem.product_service_name}
              onChange={(e) => setCurrentLineItem({ ...currentLineItem, product_service_name: e.target.value })}
              placeholder="e.g., Hydroseeding - Premium"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="li-desc">Description</Label>
            <Textarea
              id="li-desc"
              value={currentLineItem.description ?? ''}
              onChange={(e) => setCurrentLineItem({ ...currentLineItem, description: e.target.value || null })}
              rows={2}
              placeholder="Optional details…"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="li-qty">Quantity *</Label>
              <Input
                id="li-qty"
                type="number"
                min="1"
                step="0.01"
                value={currentLineItem.quantity}
                onChange={(e) => setCurrentLineItem({ ...currentLineItem, quantity: parseFloat(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="li-price">Unit Price *</Label>
              <Input
                id="li-price"
                type="number"
                min="0"
                step="0.01"
                value={currentLineItem.unit_price}
                onChange={(e) => setCurrentLineItem({ ...currentLineItem, unit_price: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="rounded-[var(--radius-sm)] bg-[var(--bg-secondary)] p-3">
            <p className="text-sm text-[var(--text-muted)]">Total</p>
            <p className="text-lg font-bold">{formatCurrency(total)}</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
