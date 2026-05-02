import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Plus, Trash2, Save, FileText, Edit2, Star, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTemplates, useProducts, useTemplateMutations } from '@/hooks/useQuotes';
import {
  QUOTE_DESIGNS,
  type QuoteTemplate,
  type QuoteLineItemDraft,
  type QuoteDesign,
  type QuoteSectionVisibility,
  type QuoteCustomText,
} from '@/lib/quotesTypes';
import QuoteDesignPicker from '@/components/quotes/QuoteDesignPicker';
import { DESIGN_META } from '@/components/quotes/quoteDesignsMeta';
import QuoteDesignPreview from '@/components/quotes/QuoteDesignPreview';
import { ctxFromDraft } from '@/components/quotes/buildDesignContext';
import { apiFetch } from '@/lib/apiClient';
import { resolveClientBranding, type TenantBrandingApi } from '@/lib/tenantBranding';
import { toast } from 'sonner';

const DEFAULT_VISIBILITY: Required<QuoteSectionVisibility> = {
  header: true,
  parties: true,
  stats_banner: true,
  scope_table: true,
  terms: true,
  summary: true,
  deposit: true,
  accept_block: true,
  footer_quote: true,
  footer_meta: true,
  optional_addons: true,
};

const SECTION_LABELS: { key: keyof QuoteSectionVisibility; label: string; help: string }[] = [
  { key: 'header', label: 'Header / logo', help: 'Tenant name, logo, contact info, document number.' },
  { key: 'parties', label: 'Parties block', help: 'Prepared-for / job-site / issued-by cards.' },
  { key: 'stats_banner', label: 'Stats banner', help: 'Quick-glance stats strip near the top.' },
  { key: 'scope_table', label: 'Scope of work table', help: 'Line items table.' },
  { key: 'terms', label: 'Terms & conditions', help: 'Bottom-left contract paragraphs.' },
  { key: 'summary', label: 'Summary totals', help: 'Subtotal / tax / grand total.' },
  { key: 'deposit', label: 'Deposit row', help: 'Deposit-due row at the bottom of the totals.' },
  { key: 'accept_block', label: 'Accept & sign block', help: 'Signature panel near the bottom.' },
  { key: 'footer_quote', label: 'Footer pull-quote', help: 'Italic quote in the footer (Editorial only).' },
  { key: 'footer_meta', label: 'Footer meta', help: 'Address / WCB / website footer.' },
  { key: 'optional_addons', label: 'Optional add-ons row', help: 'Line item summary for optional items.' },
];

type FormState = {
  name: string;
  introduction_text: string;
  contract_text: string;
  template_design: QuoteDesign;
  section_visibility: Required<QuoteSectionVisibility>;
  custom_text: QuoteCustomText;
};

const EMPTY_FORM: FormState = {
  name: '',
  introduction_text: '',
  contract_text: '',
  template_design: 'editorial',
  section_visibility: { ...DEFAULT_VISIBILITY },
  custom_text: {},
};

export default function QuoteTemplates() {
  const navigate = useNavigate();
  const { data: templates, isLoading: templatesLoading } = useTemplates();
  const { data: products, isLoading: productsLoading } = useProducts();
  const { createTemplate, updateTemplate, deleteTemplate, setDefaultTemplate } = useTemplateMutations();

  const [editingTemplate, setEditingTemplate] = useState<QuoteTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [lineItems, setLineItems] = useState<QuoteLineItemDraft[]>([]);
  const [newLineItem, setNewLineItem] = useState({
    product_service_name: '',
    description: '',
    quantity: 1,
    unit_price: 0,
  });

  const [tenantApi, setTenantApi] = useState<TenantBrandingApi | undefined>(undefined);
  useEffect(() => {
    void apiFetch('/api/tenant-settings')
      .then((r) => r.json())
      .then((d: { tenant?: TenantBrandingApi }) => setTenantApi(d.tenant))
      .catch(() => {});
  }, []);
  const branding = useMemo(() => resolveClientBranding(tenantApi), [tenantApi]);

  const defaultTemplate = templates?.find((t) => t.is_default);

  const handleBackToList = () => {
    setEditingTemplate(null);
    setIsCreating(false);
    setFormData(EMPTY_FORM);
    setLineItems([]);
    setNewLineItem({ product_service_name: '', description: '', quantity: 1, unit_price: 0 });
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setEditingTemplate(null);
    setFormData({
      ...EMPTY_FORM,
      template_design: defaultTemplate?.template_design ?? 'editorial',
    });
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
      template_design: template.template_design || 'editorial',
      section_visibility: { ...DEFAULT_VISIBILITY, ...(template.section_visibility ?? {}) },
      custom_text: template.custom_text ?? {},
    });
    setLineItems(template.line_items_json || []);
    setNewLineItem({ product_service_name: '', description: '', quantity: 1, unit_price: 0 });
  };

  const handleDeleteTemplate = (template: QuoteTemplate) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;
    void deleteTemplate.mutateAsync(template.id);
  };

  const handleSetDefault = async (template: QuoteTemplate) => {
    try {
      await setDefaultTemplate.mutateAsync(template.id);
      toast.success(`"${template.name}" is now the company default`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to set default';
      toast.error(msg);
    }
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
      toast.error('Template name is required');
      return;
    }
    const payload = {
      name: formData.name,
      introduction_text: formData.introduction_text || null,
      contract_text: formData.contract_text || null,
      template_design: formData.template_design,
      section_visibility: formData.section_visibility,
      custom_text: formData.custom_text,
      line_items_json: lineItems.map((it, i) => ({
        ...it,
        sort_order: i,
        total: it.quantity * it.unit_price,
      })),
    };
    try {
      if (isCreating) {
        await createTemplate.mutateAsync(payload);
        toast.success('Template created');
      } else if (editingTemplate) {
        await updateTemplate.mutateAsync({ id: editingTemplate.id, ...payload });
        toast.success('Template saved');
      }
      handleBackToList();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save template';
      toast.error(msg);
    }
  };

  // Live preview context
  const previewCtx = useMemo(() => {
    return ctxFromDraft({
      title: formData.name || 'Sample quote',
      introduction: formData.introduction_text || null,
      contractDisclaimer: formData.contract_text || null,
      account: { id: 'sample', name: 'Sample Client', company: 'Acme Co.', phone: '250.555.0184', email: 'sample@example.com' },
      property: {
        id: 'p',
        account_id: 'sample',
        address: '123 Bluff Lane',
        city: 'Saanich',
        province: 'British Columbia',
        postal_code: 'V8Y 2J6',
        notes: null,
        created_at: '',
        updated_at: '',
      },
      lineItems,
      depositRequired: false,
      depositAmount: 0,
      taxRate: 0.05,
      sectionVisibility: formData.section_visibility,
      customText: formData.custom_text,
      tenantApi,
      branding,
    });
  }, [formData, lineItems, tenantApi, branding]);

  if (templatesLoading || productsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  // ─── Editor view ─────────────────────────────────────────────────
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
            {isCreating ? 'New Template' : `Edit: ${formData.name || editingTemplate?.name}`}
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Pick a design, toggle which sections show, and customize the copy. Defaults apply to all new quotes from this template.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
          {/* ───── Editor column ───── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
            <div className="card">
              <h3 className="mb-4">Template details</h3>
              <div>
                <label htmlFor="template-name">Template name *</label>
                <input
                  id="template-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </div>

            <div className="card">
              <h3 className="mb-4">Design</h3>
              <QuoteDesignPicker
                value={formData.template_design}
                onChange={(d) => setFormData({ ...formData, template_design: d })}
                defaultDesign={defaultTemplate?.template_design}
              />
              <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                Switch designs anytime — your line items, intro, and contract text carry over.
              </p>
            </div>

            <div className="card">
              <h3 className="mb-2">Section visibility</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Hide blocks you don't need on this template.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                {SECTION_LABELS.map((s) => {
                  const visible = formData.section_visibility[s.key] !== false;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          section_visibility: { ...formData.section_visibility, [s.key]: !visible },
                        })
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        textAlign: 'left',
                        padding: '8px 10px',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        background: visible ? 'rgba(42,122,58,0.06)' : 'transparent',
                        color: visible ? 'var(--text-primary)' : 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                      title={s.help}
                    >
                      {visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      <span style={{ fontSize: '13px' }}>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="card">
              <h3 className="mb-4">Stock copy</h3>

              <label htmlFor="intro-text">Introduction (above the line items)</label>
              <textarea
                id="intro-text"
                rows={3}
                value={formData.introduction_text}
                onChange={(e) => setFormData({ ...formData, introduction_text: e.target.value })}
              />

              <label htmlFor="contract-text" style={{ marginTop: '16px' }}>
                Terms / contract (bottom-left)
              </label>
              <textarea
                id="contract-text"
                rows={6}
                value={formData.contract_text}
                onChange={(e) => setFormData({ ...formData, contract_text: e.target.value })}
              />

              <label htmlFor="accept-heading" style={{ marginTop: '16px' }}>
                Accept-block heading
              </label>
              <input
                id="accept-heading"
                type="text"
                placeholder="To accept this estimate"
                value={formData.custom_text.accept_heading ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    custom_text: { ...formData.custom_text, accept_heading: e.target.value || undefined },
                  })
                }
              />

              <label htmlFor="accept-body" style={{ marginTop: '12px' }}>
                Accept-block body
              </label>
              <textarea
                id="accept-body"
                rows={3}
                placeholder="Sign & date below, or reply with 'accepted'..."
                value={formData.custom_text.accept_body ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    custom_text: { ...formData.custom_text, accept_body: e.target.value || undefined },
                  })
                }
              />

              <label htmlFor="footer-quote" style={{ marginTop: '12px' }}>
                Footer pull-quote (Editorial only)
              </label>
              <input
                id="footer-quote"
                type="text"
                placeholder="A short signed-off note from you to the client…"
                value={formData.custom_text.footer_quote ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    custom_text: { ...formData.custom_text, footer_quote: e.target.value || undefined },
                  })
                }
              />
            </div>

            <div className="card">
              <h3 className="mb-4">Default line items</h3>
              {lineItems.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>None yet — add below.</p>
              ) : (
                <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.5rem' }}>Product / Service</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Qty</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Unit</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total</th>
                        <th style={{ padding: '0.5rem' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.5rem' }}>
                            <div style={{ fontWeight: 500 }}>{item.product_service_name}</div>
                            {item.description && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.description}</div>
                            )}
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>{item.quantity}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>${item.unit_price.toFixed(2)}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 500 }}>
                            ${(item.quantity * item.unit_price).toFixed(2)}
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <button
                              type="button"
                              onClick={() => handleDeleteLineItem(index)}
                              className="btn btn-ghost"
                              style={{ padding: '0.25rem' }}
                            >
                              <Trash2 size={14} style={{ color: '#ef4444' }} />
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
                  background: 'var(--surface-color)',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
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
                    >
                      <option value="">— Select —</option>
                      {products?.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="line-qty">Qty</label>
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
                    <label htmlFor="line-price">Unit Price</label>
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
                <Button type="button" onClick={handleAddLineItem} disabled={!newLineItem.product_service_name.trim()}>
                  <Plus size={14} />
                  Add item
                </Button>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                onClick={handleSaveTemplate}
                disabled={createTemplate.isPending || updateTemplate.isPending}
              >
                {createTemplate.isPending || updateTemplate.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    Save template
                  </>
                )}
              </Button>
              <Button type="button" variant="secondary" onClick={handleBackToList}>
                Cancel
              </Button>
            </div>
          </div>

          {/* ───── Live preview column ───── */}
          <div
            style={{
              position: 'sticky',
              top: '24px',
              maxHeight: 'calc(100vh - 48px)',
              overflowY: 'auto',
              background: 'var(--bg-secondary, #fafafa)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '11px', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Live preview · {DESIGN_META.find((m) => m.id === formData.template_design)?.label}
            </div>
            <QuoteDesignPreview design={formData.template_design} ctx={previewCtx} />
          </div>
        </div>
      </div>
    );
  }

  // ─── List view ─────────────────────────────────────────────────
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
          <p style={{ color: 'var(--text-muted)' }}>
            Pick a design, mark one as the company default, and customize the copy and visible sections.
          </p>
        </div>
        <Button type="button" variant="default" onClick={handleCreateNew}>
          <Plus size={16} />
          New Template
        </Button>
      </div>

      {!defaultTemplate && templates && templates.length > 0 && (
        <div
          className="card"
          style={{
            backgroundColor: 'rgba(176, 51, 55, 0.06)',
            borderLeft: '3px solid #b03337',
            marginBottom: '20px',
            padding: '14px 18px',
          }}
        >
          <strong>Pick a company default.</strong>
          <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>
            New quotes will use whichever template you mark with the star.
          </span>
        </div>
      )}

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
          {templates.map((template) => {
            const designMeta = DESIGN_META.find((m) => m.id === template.template_design);
            return (
              <div
                key={template.id}
                className="card"
                style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontWeight: 600 }}>{template.name}</h3>
                    {template.is_default && (
                      <Badge variant="default" style={{ background: '#b03337' }}>
                        <Star size={11} fill="currentColor" /> Default
                      </Badge>
                    )}
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '4px 0 12px' }}>
                    {designMeta?.label ?? template.template_design} ·{' '}
                    {template.line_items_json?.length || 0}{' '}
                    {template.line_items_json?.length === 1 ? 'item' : 'items'}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {template.introduction_text && <Badge variant="default">Intro</Badge>}
                    {template.contract_text && <Badge variant="default">Contract</Badge>}
                    {Object.values(template.section_visibility ?? {}).some((v) => v === false) && (
                      <Badge variant="default">Hidden sections</Badge>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
                  {!template.is_default && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(template)}
                      className="btn btn-ghost"
                      style={{ padding: '0.5rem' }}
                      title="Set as company default"
                      disabled={setDefaultTemplate.isPending}
                    >
                      <Star size={16} style={{ color: '#b03337' }} />
                    </button>
                  )}
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
            );
          })}
        </div>
      )}
    </div>
  );
}

// Keep the export shape stable (QUOTE_DESIGNS) for any future imports.
export { QUOTE_DESIGNS };
