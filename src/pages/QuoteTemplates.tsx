import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, Trash2, Save, FileText, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTemplates, useProducts, useTemplateMutations } from '@/hooks/useQuotes';
import type { QuoteTemplate, QuoteLineItemDraft } from '@/lib/quotesTypes';

export default function QuoteTemplates() {
  const navigate = useNavigate();
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const { data: products, isLoading: productsLoading } = useProducts();
  const { createTemplate, updateTemplate, deleteTemplate } = useTemplateMutations();

  const [editingTemplate, setEditingTemplate] = useState<QuoteTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    introduction_text: '',
    contract_text: '',
  });
  const [lineItems, setLineItems] = useState<QuoteLineItemDraft[]>([]);
  const [newLineItem, setNewLineItem] = useState({
    product_service_name: '',
    description: '',
    quantity: 1,
    unit_price: 0,
  });

  const handleBackToList = () => {
    setEditingTemplate(null);
    setIsCreating(false);
    setFormData({ name: '', introduction_text: '', contract_text: '' });
    setLineItems([]);
    setNewLineItem({ product_service_name: '', description: '', quantity: 1, unit_price: 0 });
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setEditingTemplate(null);
    setFormData({ name: '', introduction_text: '', contract_text: '' });
    setLineItems([]);
    setNewLineItem({ product_service_name: '', description: '', quantity: 1, unit_price: 0 });
  };

  const handleEditTemplate = (template: QuoteTemplate) => {
    setEditingTemplate(template);
    setIsCreating(false);
    setFormData({
      name: template.name,
      introduction_text: template.introduction_text || '',
      contract_text: template.contract_text || '',
    });
    setLineItems(template.line_items_json || []);
    setNewLineItem({ product_service_name: '', description: '', quantity: 1, unit_price: 0 });
  };

  const handleDeleteTemplate = (template: QuoteTemplate) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;
    deleteTemplate.mutateAsync(template.id);
  };

  const handleAddLineItem = () => {
    if (!newLineItem.product_service_name.trim()) return;

    const total = newLineItem.quantity * newLineItem.unit_price;
    const item: QuoteLineItemDraft = {
      product_service_name: newLineItem.product_service_name,
      description: newLineItem.description || null,
      quantity: newLineItem.quantity,
      unit_price: newLineItem.unit_price,
      total,
      sort_order: lineItems.length,
    };

    setLineItems([...lineItems, item]);
    setNewLineItem({ product_service_name: '', description: '', quantity: 1, unit_price: 0 });
  };

  const handleDeleteLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleProductSelect = (productName: string) => {
    const product = products?.find((p) => p.name === productName);
    setNewLineItem({
      product_service_name: productName,
      description: product?.description || '',
      quantity: newLineItem.quantity,
      unit_price: product?.default_unit_price || 0,
    });
  };

  const handleSaveTemplate = async () => {
    if (!formData.name.trim()) {
      alert('Template name is required');
      return;
    }

    const lineItemsWithUpdatedSort = lineItems.map((item, index) => ({
      ...item,
      sort_order: index,
      total: item.quantity * item.unit_price,
    }));

    const payload = {
      name: formData.name,
      introduction_text: formData.introduction_text || null,
      contract_text: formData.contract_text || null,
      line_items_json: lineItemsWithUpdatedSort,
    };

    try {
      if (isCreating) {
        await createTemplate.mutateAsync(payload);
      } else if (editingTemplate) {
        await updateTemplate.mutateAsync({ id: editingTemplate.id, ...payload });
      }
      handleBackToList();
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('Failed to save template');
    }
  };

  if (templatesLoading || productsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  // Editor View
  if (isCreating || editingTemplate) {
    return (
      <div className="page">
        <div className="page-kicker">
          <button
            type="button"
            onClick={handleBackToList}
            className="flex items-center gap-2 text-sm"
            style={{ color: 'var(--primary-green)', cursor: 'pointer' }}
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </div>

        <div className="mb-8">
          <h1 className="flex items-center gap-3 mb-2">
            <FileText size={32} style={{ color: 'var(--primary-green)' }} />
            {isCreating ? 'New Template' : `Edit: ${formData.name}`}
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            {isCreating ? 'Create a new quote template to speed up your quoting process.' : "Update this template's details and line items."}
          </p>
        </div>

        <div className="card mb-8">
          <h3 className="mb-4">Template details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            <div>
              <label htmlFor="template-name">Template name *</label>
              <input
                id="template-name"
                type="text"
                placeholder="—"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-6">
            <label htmlFor="intro-text">Introduction text</label>
            <textarea
              id="intro-text"
              placeholder="—"
              rows={4}
              value={formData.introduction_text}
              onChange={(e) => setFormData({ ...formData, introduction_text: e.target.value })}
              style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
            />
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              This text appears at the top of quotes using this template.
            </p>
          </div>

          <div className="mt-6">
            <label htmlFor="contract-text">Contract / Disclaimer text</label>
            <textarea
              id="contract-text"
              placeholder="—"
              rows={4}
              value={formData.contract_text}
              onChange={(e) => setFormData({ ...formData, contract_text: e.target.value })}
              style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
            />
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              This text appears at the bottom of quotes using this template.
            </p>
          </div>
        </div>

        <div className="card mb-8">
          <h3 className="mb-4">Default line items</h3>

          {lineItems.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>No line items yet. Add them below.</p>
          ) : (
            <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Product / Service</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Description</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Qty</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Unit Price</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{item.product_service_name}</td>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                        {item.description || '—'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>{item.quantity}</td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                        {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(item.unit_price)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 500 }}>
                        {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(item.total)}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleDeleteLineItem(index)}
                          className="btn btn-ghost"
                          style={{ padding: '0.25rem', minHeight: 'auto' }}
                        >
                          <Trash2 size={16} style={{ color: '#ef4444' }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div
            style={{
              backgroundColor: 'var(--surface-color)',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border-color)',
            }}
          >
            <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Add line item</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label htmlFor="product-select">Product / Service</label>
                <select
                  id="product-select"
                  value={newLineItem.product_service_name}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setNewLineItem({ ...newLineItem, product_service_name: '' });
                    } else {
                      handleProductSelect(e.target.value);
                    }
                  }}
                  style={{ marginBottom: '0.5rem' }}
                >
                  <option value="">— Select or type</option>
                  {products?.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                  {newLineItem.product_service_name && !products?.some((p) => p.name === newLineItem.product_service_name) && (
                    <option value={newLineItem.product_service_name} selected>
                      {newLineItem.product_service_name}
                    </option>
                  )}
                </select>
                <input
                  type="text"
                  placeholder="Or type custom"
                  value={newLineItem.product_service_name}
                  onChange={(e) =>
                    setNewLineItem({ ...newLineItem, product_service_name: e.target.value })
                  }
                />
              </div>

              <div>
                <label htmlFor="line-description">Description</label>
                <input
                  id="line-description"
                  type="text"
                  placeholder="—"
                  value={newLineItem.description}
                  onChange={(e) => setNewLineItem({ ...newLineItem, description: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="line-qty">Quantity</label>
                <input
                  id="line-qty"
                  type="number"
                  min="1"
                  step="1"
                  value={newLineItem.quantity}
                  onChange={(e) => setNewLineItem({ ...newLineItem, quantity: parseFloat(e.target.value) || 1 })}
                />
              </div>

              <div>
                <label htmlFor="line-price">Unit Price (CAD)</label>
                <input
                  id="line-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newLineItem.unit_price}
                  onChange={(e) => setNewLineItem({ ...newLineItem, unit_price: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <Button
              type="button"
              variant="default"
              onClick={handleAddLineItem}
              disabled={!newLineItem.product_service_name.trim()}
            >
              <Plus size={16} />
              Add item
            </Button>
          </div>
        </div>

        <div className="flex gap-3 mb-8">
          <Button
            type="button"
            variant="default"
            onClick={handleSaveTemplate}
            disabled={createTemplate.isPending || updateTemplate.isPending}
          >
            {createTemplate.isPending || updateTemplate.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save size={16} />
                Save template
              </>
            )}
          </Button>
          <Button type="button" variant="secondary" onClick={handleBackToList}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // List View
  return (
    <div className="page">
      <div className="page-kicker">
        <button
          type="button"
          onClick={() => navigate('/quotes')}
          className="flex items-center gap-2 text-sm"
          style={{ color: 'var(--primary-green)', cursor: 'pointer' }}
        >
          <ArrowLeft size={16} />
          Back
        </button>
      </div>

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="flex items-center gap-3 mb-2">
            <FileText size={32} style={{ color: 'var(--primary-green)' }} />
            Quote Templates
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>Create and manage reusable templates for quotes.</p>
        </div>
        <Button type="button" variant="default" onClick={handleCreateNew}>
          <Plus size={16} />
          New Template
        </Button>
      </div>

      {!templates || templates.length === 0 ? (
        <div
          className="card"
          style={{
            padding: '3rem 2rem',
            textAlign: 'center',
            backgroundColor: 'var(--surface-hover)',
          }}
        >
          <FileText size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
          <h3 style={{ marginBottom: '0.5rem' }}>No templates yet</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            Create one to speed up your quoting process.
          </p>
          <Button type="button" variant="default" onClick={handleCreateNew}>
            <Plus size={16} />
            Create first template
          </Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {templates.map((template) => (
            <div
              key={template.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h3 style={{ marginBottom: '0.5rem', fontWeight: 600 }}>{template.name}</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  {template.line_items_json?.length || 0} line {template.line_items_json?.length === 1 ? 'item' : 'items'}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {template.introduction_text && (
                    <Badge variant="default">Has intro</Badge>
                  )}
                  {template.contract_text && (
                    <Badge variant="default">Has contract</Badge>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => handleEditTemplate(template)}
                  className="btn btn-ghost"
                  style={{ padding: '0.5rem' }}
                >
                  <Edit2 size={16} style={{ color: 'var(--primary-green)' }} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTemplate(template)}
                  className="btn btn-ghost"
                  style={{ padding: '0.5rem' }}
                  disabled={deleteTemplate.isPending}
                >
                  {deleteTemplate.isPending ? (
                    <Loader2 size={16} className="animate-spin" style={{ color: '#ef4444' }} />
                  ) : (
                    <Trash2 size={16} style={{ color: '#ef4444' }} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
