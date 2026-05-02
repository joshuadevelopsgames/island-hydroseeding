import { fmtMoney, isVisible } from '@/components/quotes/designs/types';
import type { InvoiceDesignContext } from './types';

const STYLE = `
  .fi-inv{--paper:#f7f1e1;--paper-edge:#ebe2cc;--ink:#2b2418;--ink-soft:#5b4f3a;--accent:#b03337;
    box-sizing:border-box;width:850px;max-width:850px;overflow:hidden;background:var(--paper);color:var(--ink);font-family:'Fraunces',Georgia,serif;position:relative;
    box-shadow:0 1px 0 rgba(0,0,0,.04),0 30px 60px -20px rgba(60,40,20,.25);
    background-image:radial-gradient(circle at 20% 30%,rgba(91,79,58,.04) 0,transparent 40%),radial-gradient(circle at 80% 70%,rgba(91,79,58,.05) 0,transparent 50%);}
  .fi-inv *{box-sizing:border-box;}
  .fi-inv h1,.fi-inv h2,.fi-inv h3,.fi-inv h4,.fi-inv h5,.fi-inv h6{color:inherit;font-weight:inherit;letter-spacing:inherit;}
  .fi-stamp{position:absolute;top:30px;right:60px;transform:rotate(8deg);color:var(--accent);border:3px solid var(--accent);padding:8px 14px 6px;font-family:'Inter',sans-serif;font-weight:800;font-size:13px;letter-spacing:3px;text-transform:uppercase;opacity:.85;z-index:5;background:rgba(247,241,225,.7);}
  .fi-stamp::before{content:'';position:absolute;inset:-4px;border:1px dashed var(--accent);border-radius:2px;opacity:.5;}
  .fi-stamp small{display:block;font-family:'Fraunces',serif;font-style:italic;font-weight:400;font-size:9px;letter-spacing:1px;text-transform:none;margin-top:2px;}
  .fi-paid-stamp{position:absolute;top:380px;left:80px;transform:rotate(-12deg);color:var(--accent);font-family:'Fraunces',serif;font-style:italic;font-size:54px;font-weight:500;letter-spacing:-.02em;opacity:.55;pointer-events:none;z-index:4;}
  .fi-shell{padding:52px 64px 44px;position:relative;}
  .fi-hero{display:grid;grid-template-columns:110px 1fr;gap:28px;align-items:center;padding-bottom:22px;border-bottom:2px solid var(--ink);}
  .fi-crest{width:110px;height:110px;border:2px solid var(--ink);border-radius:50%;display:grid;place-items:center;position:relative;background:var(--paper-edge);overflow:hidden;}
  .fi-crest::before{content:'';position:absolute;inset:6px;border:1px solid var(--ink);border-radius:50%;}
  .fi-crest img{width:100%;height:100%;object-fit:cover;}
  .fi-crest-letter{font-family:'Fraunces',serif;font-style:italic;font-size:54px;font-weight:500;color:var(--ink);}
  .fi-hero-title{font-family:'Fraunces',serif;font-size:42px;font-weight:400;letter-spacing:-.015em;line-height:1;margin:0 0 6px;}
  .fi-hero-title em{font-style:italic;color:var(--accent);font-weight:500;}
  .fi-hero-sub{font-style:italic;font-size:14px;color:var(--ink-soft);margin-bottom:8px;}
  .fi-hero-meta{display:flex;gap:22px;flex-wrap:wrap;font-family:'Inter',sans-serif;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink-soft);}
  .fi-hero-meta b{color:var(--ink);font-weight:600;}
  .fi-doc-row{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:22px;margin-bottom:24px;align-items:end;}
  .fi-doc-num{font-family:'Fraunces',serif;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:var(--ink-soft);margin-bottom:4px;}
  .fi-doc-num-big{font-family:'Fraunces',serif;font-size:34px;font-weight:400;letter-spacing:-.01em;line-height:1;}
  .fi-doc-num-big em{color:var(--accent);font-style:italic;}
  .fi-doc-num-sub{font-style:italic;font-size:14px;color:var(--ink-soft);margin-top:6px;}
  .fi-due{text-align:right;font-family:'Inter',sans-serif;font-size:11px;color:var(--ink-soft);}
  .fi-due .pill{display:inline-block;background:var(--accent);color:var(--paper);padding:6px 14px;font-size:9px;letter-spacing:2px;text-transform:uppercase;font-weight:600;margin-bottom:8px;}
  .fi-due b{display:block;font-family:'Fraunces',serif;font-style:italic;font-weight:400;font-size:17px;color:var(--ink);margin-top:2px;}
  .fi-info{display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:1px dashed var(--ink);border-bottom:1px dashed var(--ink);}
  .fi-info-cell{padding:18px 0;border-right:1px dashed var(--ink);padding-right:24px;}
  .fi-info-cell:nth-child(2n){padding-right:0;padding-left:24px;border-right:0;}
  .fi-info-cell h4{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--accent);margin:0 0 8px;font-weight:600;display:flex;align-items:center;gap:6px;}
  .fi-info-cell h4::before{content:'✻';font-size:10px;}
  .fi-info-cell .name{font-family:'Fraunces',serif;font-style:italic;font-size:21px;font-weight:400;line-height:1.15;margin-bottom:4px;}
  .fi-info-cell .det{font-family:'Inter',sans-serif;font-size:11.5px;color:var(--ink-soft);line-height:1.5;}
  .fi-rule{font-family:'Fraunces',serif;font-style:italic;font-size:18px;margin-top:24px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:baseline;}
  .fi-rule small{font-family:'Inter',sans-serif;font-style:normal;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-soft);}
  .fi-table{width:100%;border-collapse:collapse;table-layout:fixed;}
  .fi-table thead th{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-soft);font-weight:500;text-align:left;padding:6px 10px 8px;border-bottom:1px solid var(--ink);}
  .fi-table thead th.num{text-align:right;}
  .fi-table tbody td{padding:13px 10px;border-bottom:1px dotted var(--ink-soft);vertical-align:top;font-family:'Inter',sans-serif;font-size:12px;line-height:1.5;}
  .fi-table tbody td.num{text-align:right;font-family:'JetBrains Mono',monospace;font-feature-settings:'tnum';font-size:13px;}
  .fi-code-tag{display:inline-block;padding:3px 7px;background:var(--ink);color:var(--paper);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.2px;border-radius:2px;}
  .fi-desc-main{font-family:'Fraunces',serif;font-size:15px;font-weight:500;line-height:1.25;margin-bottom:3px;}
  .fi-desc-sub{font-family:'Fraunces',serif;font-style:italic;font-size:11.5px;color:var(--ink-soft);line-height:1.45;}
  .fi-bottom{display:grid;grid-template-columns:1fr 320px;gap:36px;margin-top:28px;}
  .fi-pay h4{font-family:'Fraunces',serif;font-style:italic;font-size:17px;font-weight:400;margin:0 0 12px;display:flex;align-items:baseline;gap:10px;}
  .fi-pay h4::after{content:'';flex:1;height:1px;background:repeating-linear-gradient(to right,var(--ink-soft) 0 2px,transparent 2px 5px);}
  .fi-pay p{font-family:'Inter',sans-serif;font-size:11px;color:var(--ink);margin:0 0 10px;line-height:1.55;white-space:pre-wrap;}
  .fi-pay p b{color:var(--accent);font-weight:600;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;display:block;margin-bottom:2px;}
  .fi-totals{padding:18px 22px;background:var(--paper-edge);border:1px solid var(--ink);position:relative;}
  .fi-totals::before{content:'Invoice tally';position:absolute;top:-10px;left:16px;background:var(--paper);padding:0 8px;font-family:'Fraunces',serif;font-style:italic;font-size:13px;color:var(--ink-soft);}
  .fi-tot-row{display:flex;justify-content:space-between;padding:7px 0;font-family:'Inter',sans-serif;font-size:12px;border-bottom:1px dotted var(--ink-soft);}
  .fi-tot-row dt{color:var(--ink-soft);}
  .fi-tot-row dd{margin:0;font-family:'JetBrains Mono',monospace;}
  .fi-tot-row.grand{border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);margin-top:6px;padding:12px 0;}
  .fi-tot-row.grand dt{font-family:'Fraunces',serif;font-style:italic;font-size:18px;color:var(--ink);font-weight:500;}
  .fi-tot-row.grand dd{font-family:'Fraunces',serif;font-size:22px;color:var(--ink);font-weight:500;}
  .fi-tot-row.balance{margin-top:8px;padding:12px 14px;background:var(--accent);color:var(--paper);border:0;margin-left:-22px;margin-right:-22px;margin-bottom:-18px;}
  .fi-tot-row.balance dt{font-family:'Fraunces',serif;font-style:italic;font-size:16px;color:var(--paper);}
  .fi-tot-row.balance dd{font-family:'Fraunces',serif;font-size:22px;font-weight:500;color:var(--paper);}
`;

export default function FieldInvoiceDesign({ ctx }: { ctx: InvoiceDesignContext }) {
  const sv = ctx.sectionVisibility;
  const ct = ctx.customText;
  const tenantInitial = (ctx.tenant.name || 'H').trim().charAt(0).toUpperCase() || 'H';

  return (
    <div className="fi-inv">
      <style>{STYLE}</style>

      <div className="fi-stamp">
        Invoice
        <small>{ctx.paymentTerms || 'Net 30'}</small>
      </div>
      {ctx.isPaid && <div className="fi-paid-stamp">paid in full ✓</div>}

      <div className="fi-shell">
        {isVisible(sv, 'header') && (
          <header className="fi-hero">
            <div className="fi-crest">
              {ctx.tenant.logoUrl ? <img src={ctx.tenant.logoUrl} alt={ctx.tenant.name} /> : <div className="fi-crest-letter">{tenantInitial}</div>}
            </div>
            <div>
              <div className="fi-hero-title"><em>{ctx.tenant.name}</em></div>
              {ctx.tenant.tagline && <div className="fi-hero-sub">{ctx.tenant.tagline}</div>}
              <div className="fi-hero-meta">
                {ctx.tenant.wcbNumber && <span>WCB <b>{ctx.tenant.wcbNumber}</b></span>}
                {ctx.tenant.gstNumber && <span>GST <b>{ctx.tenant.gstNumber}</b></span>}
                {ctx.tenant.phone && <span>Office <b>{ctx.tenant.phone}</b></span>}
              </div>
            </div>
          </header>
        )}

        <div className="fi-doc-row">
          <div>
            <div className="fi-doc-num">Invoice — final</div>
            <div className="fi-doc-num-big">№ <em>INV · {ctx.invoiceNumber}</em></div>
            <div className="fi-doc-num-sub">{ctx.title || 'Services rendered'}</div>
          </div>
          <div className="fi-due">
            <div className="pill">{ctx.isPaid ? 'Paid' : ctx.isOverdue ? 'Overdue' : ctx.paymentTerms || 'Net 30'}</div>
            <div style={{ display: 'flex', gap: '24px', justifyContent: 'flex-end' }}>
              <div>Issued<b>{ctx.issueDate}</b></div>
              <div>Due<b>{ctx.dueDate}</b></div>
            </div>
          </div>
        </div>

        {isVisible(sv, 'parties') && (
          <section className="fi-info">
            <div className="fi-info-cell">
              <h4>Billed to</h4>
              <div className="name">{ctx.account?.name || '—'}</div>
              <div className="det">
                {ctx.account?.company && (<>{ctx.account.company}<br /></>)}
                {ctx.account?.email}
                {ctx.account?.email && ctx.account?.phone && ' · '}
                {ctx.account?.phone}
              </div>
            </div>
            <div className="fi-info-cell">
              <h4>Job site</h4>
              <div className="name">{ctx.property?.address || ctx.title || '—'}</div>
              <div className="det">
                {[ctx.property?.city, ctx.property?.province, ctx.property?.postal_code].filter(Boolean).join(', ') || '—'}
                {ctx.property?.notes && (<><br />{ctx.property.notes}</>)}
              </div>
            </div>
          </section>
        )}

        {isVisible(sv, 'scope_table') && (
          <>
            <h2 className="fi-rule">Services rendered <small>{ctx.items.length} items · CAD</small></h2>
            <table className="fi-table">
              <thead>
                <tr>
                  <th style={{ width: '64px' }}>Code</th>
                  <th>Description</th>
                  <th className="num" style={{ width: '60px' }}>Qty</th>
                  <th style={{ width: '50px' }}>Unit</th>
                  <th className="num" style={{ width: '80px' }}>Rate</th>
                  <th className="num" style={{ width: '100px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {ctx.items.map((it) => (
                  <tr key={it.id}>
                    <td><span className="fi-code-tag">{it.code}</span></td>
                    <td>
                      <div className="fi-desc-main">{it.description}</div>
                      {it.detail && <div className="fi-desc-sub">{it.detail}</div>}
                    </td>
                    <td className="num">{it.quantity}</td>
                    <td>{it.unit}</td>
                    <td className="num">{fmtMoney(it.rate)}</td>
                    <td className="num">{fmtMoney(it.amount)}</td>
                  </tr>
                ))}
                {ctx.items.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px' }}>No line items.</td></tr>
                )}
              </tbody>
            </table>
          </>
        )}

        <div className="fi-bottom">
          {isVisible(sv, 'terms') && (
            <div className="fi-pay">
              <h4>Remittance</h4>
              {ctx.tenant.email && (
                <p><b>E-transfer</b>{ctx.tenant.email}</p>
              )}
              {ctx.contractDisclaimer && <p>{ctx.contractDisclaimer}</p>}
              {ct.footer_quote && <p style={{ fontStyle: 'italic' }}>"{ct.footer_quote}"</p>}
            </div>
          )}
          {isVisible(sv, 'summary') && (
            <dl className="fi-totals">
              <div className="fi-tot-row"><dt>Subtotal</dt><dd>{fmtMoney(ctx.subtotal)}</dd></div>
              <div className="fi-tot-row"><dt>GST ({(ctx.taxRate * 100).toFixed(0)}%)</dt><dd>{fmtMoney(ctx.taxAmount)}</dd></div>
              {ctx.amountPaid > 0 && (
                <div className="fi-tot-row"><dt>Paid</dt><dd>−{fmtMoney(ctx.amountPaid)}</dd></div>
              )}
              <div className="fi-tot-row grand"><dt>Total</dt><dd>{fmtMoney(ctx.total)}</dd></div>
              <div className="fi-tot-row balance"><dt>Balance due</dt><dd>{fmtMoney(ctx.balanceDue)}</dd></div>
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
