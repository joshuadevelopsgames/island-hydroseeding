import { fmtNum, isVisible } from '@/components/quotes/designs/types';
import EditableText from '@/components/quotes/designs/EditableText';
import type { InvoiceDesignContext } from './types';

const STYLE = `
  .ti-inv{--bg:#f6f5f2;--grid:#e3e0d8;--ink:#14130f;--muted:#6f6a5e;--accent:#b03337;--accent-soft:#f5dada;
    box-sizing:border-box;width:850px;max-width:850px;overflow:hidden;background:var(--bg);color:var(--ink);font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.5;
    background-image:linear-gradient(to right,var(--grid) 1px,transparent 1px),linear-gradient(to bottom,var(--grid) 1px,transparent 1px);background-size:24px 24px;
    box-shadow:0 1px 0 rgba(0,0,0,.04),0 30px 60px -20px rgba(20,30,20,.2);position:relative;}
  .ti-inv *{box-sizing:border-box;}
  .ti-inv h1,.ti-inv h2,.ti-inv h3,.ti-inv h4,.ti-inv h5,.ti-inv h6{color:inherit;font-weight:inherit;letter-spacing:inherit;}
  .ti-paid-stamp{position:absolute;top:220px;right:60px;transform:rotate(-6deg);background:var(--accent);color:var(--bg);padding:12px 26px;font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:32px;letter-spacing:6px;opacity:.92;pointer-events:none;text-transform:uppercase;border-radius:2px;box-shadow:6px 6px 0 var(--ink);z-index:5;}
  .ti-tape{background:var(--ink);color:var(--bg);padding:8px 32px;display:flex;justify-content:space-between;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;}
  .ti-tape b{color:var(--accent-soft);font-weight:400;margin-right:6px;}
  .ti-shell{padding:32px 40px 36px;}
  .ti-head{display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:start;padding-bottom:22px;border-bottom:2px solid var(--ink);}
  .ti-mark-row{display:flex;align-items:center;gap:14px;margin-bottom:16px;}
  .ti-mark-glyph{width:52px;height:52px;background:var(--ink);color:var(--bg);display:grid;place-items:center;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:22px;letter-spacing:-.04em;position:relative;overflow:hidden;}
  .ti-mark-glyph::after{content:'';position:absolute;inset:4px;border:1px solid var(--bg);}
  .ti-mark-glyph img{width:100%;height:100%;object-fit:cover;}
  .ti-mark-name{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;letter-spacing:-.02em;line-height:1;}
  .ti-mark-sub{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-top:4px;}
  .ti-meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px;}
  .ti-meta-grid dt{color:var(--muted);text-transform:uppercase;letter-spacing:1px;font-size:9px;}
  .ti-meta-grid dd{margin:0;}
  .ti-headline{text-align:right;}
  .ti-doc-tag{display:inline-block;background:var(--accent);color:var(--bg);padding:4px 10px;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;font-weight:600;margin-bottom:10px;}
  .ti-doc-num{font-family:'Space Grotesk',sans-serif;font-size:48px;font-weight:700;letter-spacing:-.04em;line-height:.95;margin-bottom:6px;}
  .ti-doc-meta{display:flex;justify-content:flex-end;gap:18px;font-size:11px;}
  .ti-doc-meta div span{display:block;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:2px;}
  .ti-due{margin-top:14px;padding:8px 12px;background:var(--accent-soft);color:var(--accent);font-family:'Space Grotesk',sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;display:inline-block;}
  .ti-quad{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;margin-top:20px;border:1px solid var(--ink);background:var(--bg);}
  .ti-quad-cell{padding:13px 15px;border-right:1px solid var(--ink);}
  .ti-quad-cell:last-child{border-right:0;}
  .ti-quad-cell h4{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin:0 0 6px;font-weight:500;}
  .ti-quad-cell .v{font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:600;letter-spacing:-.01em;line-height:1.25;}
  .ti-quad-cell .s{font-size:10px;color:var(--muted);margin-top:3px;line-height:1.4;}
  .ti-section-bar{background:var(--ink);color:var(--bg);padding:6px 12px;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;margin-top:24px;display:flex;justify-content:space-between;}
  .ti-table{width:100%;border-collapse:collapse;background:var(--bg);border:1px solid var(--ink);border-top:0;table-layout:fixed;}
  .ti-table thead th{font-size:9px;letter-spacing:1.8px;text-transform:uppercase;color:var(--muted);font-weight:500;text-align:left;padding:10px 12px;border-bottom:1px solid var(--ink);}
  .ti-table thead th.num{text-align:right;}
  .ti-table tbody td{padding:11px 12px;border-bottom:1px dashed var(--grid);vertical-align:top;font-size:12px;}
  .ti-table tbody tr:last-child td{border-bottom:0;}
  .ti-table tbody td.num{text-align:right;font-feature-settings:'tnum';}
  .ti-code{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--accent);font-weight:600;}
  .ti-desc-main{font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:600;margin-bottom:2px;}
  .ti-desc-sub{font-size:10px;color:var(--muted);line-height:1.5;}
  .ti-bottom{display:grid;grid-template-columns:1fr 320px;gap:24px;margin-top:24px;}
  .ti-pay{background:var(--bg);border:1px solid var(--ink);padding:16px;}
  .ti-pay h3{font-family:'Space Grotesk',sans-serif;font-size:12px;margin:0 0 10px;font-weight:700;text-transform:uppercase;}
  .ti-pay-row{display:grid;grid-template-columns:1fr auto;padding:5px 0;font-size:11px;border-bottom:1px dashed var(--grid);}
  .ti-pay-row span:first-child{color:var(--muted);}
  .ti-totals{background:var(--bg);border:1px solid var(--ink);}
  .ti-tot-row{display:grid;grid-template-columns:1fr auto;padding:9px 16px;font-size:12px;border-bottom:1px solid var(--grid);}
  .ti-tot-row dt{color:var(--muted);}
  .ti-tot-row dd{margin:0;font-feature-settings:'tnum';}
  .ti-tot-row.grand{background:var(--ink);color:var(--bg);padding:14px 16px;}
  .ti-tot-row.grand dt{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--bg);}
  .ti-tot-row.grand dd{font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;letter-spacing:-.02em;}
  .ti-tot-row.balance{background:var(--accent-soft);padding:12px 16px;}
  .ti-tot-row.balance dt{color:var(--accent);font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:1.5px;}
  .ti-tot-row.balance dd{font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;color:var(--accent);}
  .ti-foot{margin-top:20px;padding:14px 20px;background:var(--bg);border:1px solid var(--ink);display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);}
  .ti-foot b{color:var(--ink);}
`;

export default function TechnicalInvoiceDesign({ ctx }: { ctx: InvoiceDesignContext }) {
  const sv = ctx.sectionVisibility;
  const ct = ctx.customText;
  const initials = (ctx.tenant.name || 'SH').split(/\s+/).map((w) => w.charAt(0)).join('').slice(0, 2).toUpperCase() || 'SH';

  return (
    <div className="ti-inv">
      <style>{STYLE}</style>
      {ctx.isPaid && <div className="ti-paid-stamp">Paid</div>}

      <div className="ti-tape">
        <span><b>DOC</b>INV-{ctx.invoiceNumber}</span>
        <span><b>STATUS</b>{ctx.isPaid ? 'CLEARED' : ctx.isOverdue ? 'OVERDUE' : `OPEN · ${ctx.paymentTerms || 'NET 30'}`}</span>
        <span><b>REV</b>1.0</span>
        <span><b>DUE</b>{ctx.dueDate}</span>
      </div>

      <div className="ti-shell">
        {isVisible(sv, 'header') && (
          <header className="ti-head">
            <div>
              <div className="ti-mark-row">
                <div className="ti-mark-glyph">
                  {ctx.tenant.logoUrl ? <img src={ctx.tenant.logoUrl} alt={ctx.tenant.name} /> : initials}
                </div>
                <div>
                  <div className="ti-mark-name">{ctx.tenant.name.toUpperCase()}</div>
                  {ctx.tenant.tagline && <div className="ti-mark-sub">{ctx.tenant.tagline}</div>}
                </div>
              </div>
              <dl className="ti-meta-grid">
                {ctx.tenant.phone && (<><dt>Office</dt><dd>{ctx.tenant.phone}</dd></>)}
                {ctx.tenant.email && (<><dt>Email</dt><dd>{ctx.tenant.email}</dd></>)}
                {ctx.tenant.gstNumber && (<><dt>GST</dt><dd>{ctx.tenant.gstNumber}</dd></>)}
                {ctx.tenant.wcbNumber && (<><dt>WCB</dt><dd>{ctx.tenant.wcbNumber}</dd></>)}
              </dl>
            </div>
            <div className="ti-headline">
              <div className="ti-doc-tag">Invoice / Final</div>
              <div className="ti-doc-num">№INV-{ctx.invoiceNumber}</div>
              <div className="ti-doc-meta">
                <div><span>Issued</span>{ctx.issueDate}</div>
                <div><span>Due</span>{ctx.dueDate}</div>
              </div>
              <div className="ti-due">{ctx.isPaid ? 'Cleared' : ctx.paymentTerms || 'Net 30'}</div>
            </div>
          </header>
        )}

        {isVisible(sv, 'parties') && (
          <div className="ti-quad">
            <div className="ti-quad-cell"><h4>Billed to</h4><div className="v">{ctx.account?.name || '—'}</div><div className="s">{ctx.account?.email || ctx.account?.phone || ''}</div></div>
            <div className="ti-quad-cell"><h4>Job site</h4><div className="v">{ctx.property?.address || ctx.title || '—'}</div><div className="s">{[ctx.property?.city, ctx.property?.province].filter(Boolean).join(', ')}</div></div>
            <div className="ti-quad-cell"><h4>Issued</h4><div className="v">{ctx.issueDate}</div><div className="s">Due {ctx.dueDate}</div></div>
            <div className="ti-quad-cell"><h4>Items</h4><div className="v">{ctx.items.length}</div><div className="s">{ctx.paymentTerms || 'Net 30'}</div></div>
          </div>
        )}

        {isVisible(sv, 'scope_table') && (
          <>
            <div className="ti-section-bar"><span>§ 01 — Services rendered</span><span>{ctx.items.length} items · CAD</span></div>
            <table className="ti-table">
              <thead>
                <tr>
                  <th style={{ width: '70px' }}>Code</th>
                  <th>Item</th>
                  <th className="num" style={{ width: '60px' }}>Qty</th>
                  <th style={{ width: '50px' }}>Unit</th>
                  <th className="num" style={{ width: '80px' }}>Rate</th>
                  <th className="num" style={{ width: '100px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {ctx.items.map((it) => (
                  <tr key={it.id}>
                    <td><span className="ti-code">{it.code}</span></td>
                    <td>
                      <div className="ti-desc-main">{it.description}</div>
                      {it.detail && <div className="ti-desc-sub">{it.detail}</div>}
                    </td>
                    <td className="num">{it.quantity}</td>
                    <td>{it.unit}</td>
                    <td className="num">${fmtNum(it.rate)}</td>
                    <td className="num">${fmtNum(it.amount)}</td>
                  </tr>
                ))}
                {ctx.items.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No line items.</td></tr>
                )}
              </tbody>
            </table>
          </>
        )}

        <div className="ti-bottom">
          {isVisible(sv, 'terms') && (
            <div className="ti-pay">
              <h3>§ 02 — Remittance</h3>
              {ctx.tenant.email && <div className="ti-pay-row"><span>E-transfer</span><span>{ctx.tenant.email}</span></div>}
              {ctx.tenant.phone && <div className="ti-pay-row"><span>Office</span><span>{ctx.tenant.phone}</span></div>}
              {(ctx.contractDisclaimer || ctx.onFieldEdit) && (
                <EditableText
                  as="div"
                  multiline
                  field="contractDisclaimer"
                  value={ctx.contractDisclaimer ?? ''}
                  onEdit={ctx.onFieldEdit}
                  placeholder="Add notes / terms…"
                  style={{ marginTop: '12px', fontSize: '11px', color: 'var(--muted)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}
                />
              )}
            </div>
          )}
          {isVisible(sv, 'summary') && (
            <dl className="ti-totals">
              <div className="ti-tot-row"><dt>Subtotal</dt><dd>${fmtNum(ctx.subtotal)}</dd></div>
              <div className="ti-tot-row"><dt>GST {(ctx.taxRate * 100).toFixed(0)}%</dt><dd>${fmtNum(ctx.taxAmount)}</dd></div>
              {ctx.amountPaid > 0 && (
                <div className="ti-tot-row"><dt>Paid</dt><dd>−${fmtNum(ctx.amountPaid)}</dd></div>
              )}
              <div className="ti-tot-row grand"><dt>Total</dt><dd>${fmtNum(ctx.total)}</dd></div>
              <div className="ti-tot-row balance"><dt>Balance Due</dt><dd>${fmtNum(ctx.balanceDue)}</dd></div>
            </dl>
          )}
        </div>

        {isVisible(sv, 'footer_meta') && (
          <div className="ti-foot">
            <span>{ctx.tenant.website && <b>{ctx.tenant.website}</b>}{ctx.tenant.phone ? ` · ${ctx.tenant.phone}` : ''}</span>
            <span>
              Doc rev 1.0
              {ctx.tenant.wcbNumber && (<>{' · '}WCB <b>{ctx.tenant.wcbNumber}</b></>)}
              {ctx.tenant.insurance && (<>{' · '}Insured <b>{ctx.tenant.insurance}</b></>)}
              {ct.footer_quote && (<>{' · '}<b>{ct.footer_quote}</b></>)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
