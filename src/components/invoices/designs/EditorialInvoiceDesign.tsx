import { fmtMoney, isVisible } from '@/components/quotes/designs/types';
import EditableText from '@/components/quotes/designs/EditableText';
import type { InvoiceDesignContext } from './types';

const STYLE = `
  .ei-inv{--ink:#1a1612;--paper:#f4ede1;--paper-2:#ebe1d0;--accent:#b03337;--muted:#6b5d4a;--soft:#d4c5a9;
    box-sizing:border-box;width:850px;max-width:850px;overflow:hidden;background:var(--paper);color:var(--ink);
    font-family:'Fraunces',Georgia,serif;padding:64px 64px 48px;position:relative;
    box-shadow:0 1px 0 rgba(0,0,0,.04),0 30px 60px -20px rgba(60,40,20,.25);}
  .ei-inv *{box-sizing:border-box;}
  .ei-inv h1,.ei-inv h2,.ei-inv h3,.ei-inv h4,.ei-inv h5,.ei-inv h6{color:inherit;font-weight:inherit;letter-spacing:inherit;}
  .ei-paid-stamp{position:absolute;top:110px;right:80px;transform:rotate(-14deg);border:4px double var(--accent);color:var(--accent);padding:10px 28px;font-family:'Inter',sans-serif;font-weight:800;font-size:34px;letter-spacing:4px;opacity:.9;pointer-events:none;text-transform:uppercase;border-radius:4px;z-index:5;}
  .ei-paid-stamp small{display:block;font-style:italic;font-family:'Fraunces',serif;font-weight:400;font-size:12px;letter-spacing:1px;text-transform:none;margin-top:2px;}
  .ei-head{display:grid;grid-template-columns:1fr auto;gap:40px;align-items:start;padding-bottom:24px;border-bottom:1px solid var(--ink);}
  .ei-mark{display:flex;align-items:center;gap:14px;}
  .ei-mark-glyph{width:56px;height:56px;border-radius:50%;background:var(--accent);color:var(--paper);display:grid;place-items:center;font-family:'Fraunces',serif;font-style:italic;font-weight:600;font-size:30px;padding-bottom:4px;}
  .ei-mark-glyph img{width:100%;height:100%;object-fit:cover;border-radius:50%;}
  .ei-mark-name{font-size:26px;font-weight:500;letter-spacing:-.01em;line-height:1.05;}
  .ei-mark-name em{font-style:italic;color:var(--accent);font-weight:400;}
  .ei-mark-tag{font-family:'Inter',sans-serif;font-size:10px;letter-spacing:2.4px;text-transform:uppercase;color:var(--muted);margin-top:4px;}
  .ei-meta{text-align:right;font-family:'Inter',sans-serif;font-size:11px;color:var(--muted);}
  .ei-meta-row{display:flex;gap:14px;justify-content:flex-end;margin-bottom:4px;}
  .ei-meta-row dt{text-transform:uppercase;letter-spacing:1.6px;}
  .ei-meta-row dd{color:var(--ink);margin:0;font-family:'JetBrains Mono',monospace;font-size:12px;}
  .ei-title-row{display:grid;grid-template-columns:1fr auto;align-items:end;margin-top:32px;margin-bottom:24px;gap:24px;}
  .ei-title{font-family:'Fraunces',serif;font-size:64px;line-height:.92;letter-spacing:-.035em;font-weight:300;margin:0;}
  .ei-title em{font-style:italic;font-weight:300;color:var(--accent);}
  .ei-title-sub{font-style:italic;font-size:18px;color:var(--muted);margin-top:6px;font-weight:400;}
  .ei-due{text-align:right;}
  .ei-due-pill{display:inline-block;background:var(--accent);color:var(--paper);padding:8px 14px;font-family:'Inter',sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:600;border-radius:2px;margin-bottom:8px;}
  .ei-due-pill.overdue{background:#7a1f23;}
  .ei-due-detail{font-family:'Inter',sans-serif;font-size:11px;color:var(--muted);letter-spacing:1px;}
  .ei-due-detail b{display:block;font-family:'Fraunces',serif;font-style:italic;font-weight:400;font-size:18px;color:var(--ink);margin-top:2px;letter-spacing:0;}
  .ei-parties{display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;padding:22px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);margin-bottom:28px;}
  .ei-p-label{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:2.4px;text-transform:uppercase;color:var(--muted);margin-bottom:8px;}
  .ei-p-name{font-family:'Fraunces',serif;font-size:18px;font-weight:500;margin-bottom:4px;line-height:1.2;}
  .ei-p-detail{font-family:'Inter',sans-serif;font-size:12px;line-height:1.5;}
  .ei-p-detail span{color:var(--muted);}
  .ei-section-h{font-family:'Inter',sans-serif;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--ink);display:flex;justify-content:space-between;}
  .ei-section-h span:last-child{color:var(--ink);font-family:'JetBrains Mono',monospace;}
  .ei-table{width:100%;border-collapse:collapse;table-layout:fixed;}
  .ei-table thead th{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:500;text-align:left;padding:6px 10px;border-bottom:1px solid var(--soft);}
  .ei-table thead th.num{text-align:right;}
  .ei-table tbody td{padding:13px 10px;border-bottom:1px dashed var(--soft);vertical-align:top;font-family:'Inter',sans-serif;font-size:13px;line-height:1.5;}
  .ei-table tbody td.num{text-align:right;font-family:'JetBrains Mono',monospace;}
  .ei-code{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1px;color:var(--accent);background:rgba(176,51,55,.08);padding:3px 7px;border-radius:3px;display:inline-block;white-space:nowrap;}
  .ei-desc-main{font-family:'Fraunces',serif;font-size:16px;font-weight:500;margin-bottom:2px;color:var(--ink);}
  .ei-desc-sub{font-size:11px;color:var(--muted);line-height:1.45;}
  .ei-bottom{display:grid;grid-template-columns:1fr 320px;gap:48px;margin-top:32px;}
  .ei-pay h4{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin:0 0 8px;font-weight:600;}
  .ei-pay-block{padding:14px 16px;background:var(--paper-2);border-radius:4px;margin-bottom:10px;}
  .ei-pay-row{display:flex;justify-content:space-between;font-family:'Inter',sans-serif;font-size:11.5px;line-height:1.6;}
  .ei-pay-row span:first-child{color:var(--muted);}
  .ei-pay-row span:last-child{font-family:'JetBrains Mono',monospace;}
  .ei-tot{font-family:'Inter',sans-serif;}
  .ei-tot-row{display:flex;justify-content:space-between;padding:9px 0;font-size:13px;border-bottom:1px dashed var(--soft);}
  .ei-tot-row dt{color:var(--muted);}
  .ei-tot-row dd{margin:0;font-family:'JetBrains Mono',monospace;}
  .ei-tot-row.grand{margin-top:8px;padding:16px 0;border-top:2px solid var(--ink);border-bottom:2px solid var(--ink);}
  .ei-tot-row.grand dt{font-family:'Fraunces',serif;font-size:20px;color:var(--ink);font-weight:500;font-style:italic;}
  .ei-tot-row.grand dd{font-family:'Fraunces',serif;font-size:26px;color:var(--accent);font-weight:500;}
  .ei-tot-row.balance{background:var(--paper-2);padding:12px 14px;margin:6px -14px 0;}
  .ei-tot-row.balance dt{font-family:'Inter',sans-serif;font-weight:700;color:var(--ink);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;}
  .ei-tot-row.balance dd{font-family:'Fraunces',serif;font-style:italic;font-size:20px;color:var(--accent);font-weight:600;}
  .ei-foot{margin-top:28px;padding-top:18px;border-top:1px solid var(--ink);display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end;}
  .ei-foot-q{font-family:'Fraunces',serif;font-style:italic;font-weight:300;font-size:15px;color:var(--muted);max-width:380px;line-height:1.4;}
  .ei-foot-meta{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);text-align:right;line-height:1.7;}
  .ei-foot-meta b{color:var(--ink);}
`;

export default function EditorialInvoiceDesign({ ctx }: { ctx: InvoiceDesignContext }) {
  const sv = ctx.sectionVisibility;
  const ct = ctx.customText;
  const tenantInitial = (ctx.tenant.name || 'h').trim().charAt(0).toLowerCase() || 'h';

  return (
    <div className="ei-inv">
      <style>{STYLE}</style>

      {ctx.isPaid && sv.paid_stamp !== false && (
        <div className="ei-paid-stamp">
          Paid<small>in full</small>
        </div>
      )}

      {isVisible(sv, 'header') && (
        <header className="ei-head">
          <div className="ei-mark">
            <div className="ei-mark-glyph">
              {ctx.tenant.logoUrl ? <img src={ctx.tenant.logoUrl} alt={ctx.tenant.name} /> : tenantInitial}
            </div>
            <div>
              <div className="ei-mark-name">{ctx.tenant.name}</div>
              {ctx.tenant.tagline && <div className="ei-mark-tag">{ctx.tenant.tagline}</div>}
            </div>
          </div>
          <dl className="ei-meta">
            {ctx.tenant.phone && <div className="ei-meta-row"><dt>Office</dt><dd>{ctx.tenant.phone}</dd></div>}
            {ctx.tenant.email && <div className="ei-meta-row"><dt>Email</dt><dd>{ctx.tenant.email}</dd></div>}
            {ctx.tenant.gstNumber && <div className="ei-meta-row"><dt>GST</dt><dd>{ctx.tenant.gstNumber}</dd></div>}
          </dl>
        </header>
      )}

      <div className="ei-title-row">
        <div>
          <h1 className="ei-title">Invoice <em>№ {ctx.invoiceNumber}</em></h1>
          <EditableText as="div" field="title" value={ctx.title || ''} onEdit={ctx.onFieldEdit} placeholder="Invoice for services rendered" className="ei-title-sub" />
        </div>
        <div className="ei-due">
          <div className={'ei-due-pill ' + (ctx.isOverdue ? 'overdue' : '')}>
            {ctx.isPaid ? 'Paid' : ctx.isOverdue ? 'Overdue' : ctx.paymentTerms || 'Net 30'}
          </div>
          <div className="ei-due-detail">Issued<b>{ctx.issueDate}</b></div>
          <div className="ei-due-detail" style={{ marginTop: '6px' }}>Due<b>{ctx.dueDate}</b></div>
        </div>
      </div>

      {isVisible(sv, 'parties') && (
        <section className="ei-parties">
          <div>
            <div className="ei-p-label">Billed to</div>
            <div className="ei-p-name">{ctx.account?.name || '—'}</div>
            <div className="ei-p-detail">
              {ctx.account?.company && (<><span>{ctx.account.company}</span><br /></>)}
              {ctx.account?.email && <span>{ctx.account.email}</span>}
            </div>
          </div>
          <div>
            <div className="ei-p-label">Job site</div>
            <div className="ei-p-name">{ctx.property?.address || ctx.title || '—'}</div>
            <div className="ei-p-detail">
              {ctx.property?.city && (
                <>
                  <span>
                    {ctx.property.city}
                    {ctx.property.province ? `, ${ctx.property.province}` : ''}
                    {ctx.property.postal_code ? ` ${ctx.property.postal_code}` : ''}
                  </span>
                  <br />
                </>
              )}
              {ctx.property?.notes && <span>{ctx.property.notes}</span>}
            </div>
          </div>
          <div>
            <div className="ei-p-label">Schedule</div>
            <div className="ei-p-name">{ctx.paymentTerms || 'Net 30'} · Due {ctx.dueDate}</div>
            <div className="ei-p-detail">
              <span>Issued</span><br />
              {ctx.issueDate}
            </div>
          </div>
        </section>
      )}

      {isVisible(sv, 'scope_table') && (
        <>
          <div className="ei-section-h">
            <span>Services rendered</span>
            <span>{ctx.items.length.toString().padStart(2, '0')} line items</span>
          </div>
          {ctx.introduction && (
            <p style={{ fontFamily: 'Inter,sans-serif', fontSize: '12.5px', color: 'var(--muted)', marginTop: 0, marginBottom: '14px', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {ctx.introduction}
            </p>
          )}
          <table className="ei-table">
            <thead>
              <tr>
                <th style={{ width: '70px' }}>Code</th>
                <th>Description</th>
                <th className="num" style={{ width: '60px' }}>Qty</th>
                <th style={{ width: '50px' }}>Unit</th>
                <th className="num" style={{ width: '90px' }}>Rate</th>
                <th className="num" style={{ width: '110px' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {ctx.items.map((it) => (
                <tr key={it.id}>
                  <td><span className="ei-code">{it.code}</span></td>
                  <td>
                    <div className="ei-desc-main">{it.description}</div>
                    {it.detail && <div className="ei-desc-sub">{it.detail}</div>}
                  </td>
                  <td className="num">{it.quantity}</td>
                  <td>{it.unit}</td>
                  <td className="num">{fmtMoney(it.rate)}</td>
                  <td className="num">{fmtMoney(it.amount)}</td>
                </tr>
              ))}
              {ctx.items.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No line items yet.</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <div className="ei-bottom">
        {isVisible(sv, 'terms') && (
          <div className="ei-pay">
            <h4>Remittance</h4>
            {ctx.tenant.email && (
              <div className="ei-pay-block">
                <div className="ei-pay-row"><span>E-transfer</span><span>{ctx.tenant.email}</span></div>
                <div className="ei-pay-row"><span>Auto-deposit</span><span>enabled</span></div>
              </div>
            )}
            {(ctx.contractDisclaimer || ctx.onFieldEdit) && (
              <EditableText
                as="div"
                multiline
                field="contractDisclaimer"
                value={ctx.contractDisclaimer ?? ''}
                onEdit={ctx.onFieldEdit}
                placeholder="Add notes / terms…"
                style={{ marginTop: '12px', fontSize: '11px', color: 'var(--muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
              />
            )}
          </div>
        )}

        {isVisible(sv, 'summary') && (
          <div>
            <div className="ei-section-h"><span>Summary</span><span>CAD</span></div>
            <dl className="ei-tot">
              <div className="ei-tot-row"><dt>Subtotal</dt><dd>{fmtMoney(ctx.subtotal)}</dd></div>
              <div className="ei-tot-row"><dt>GST ({(ctx.taxRate * 100).toFixed(0)}%)</dt><dd>{fmtMoney(ctx.taxAmount)}</dd></div>
              {ctx.amountPaid > 0 && (
                <div className="ei-tot-row"><dt>Amount paid</dt><dd>−{fmtMoney(ctx.amountPaid)}</dd></div>
              )}
              <div className="ei-tot-row grand"><dt>Total</dt><dd>{fmtMoney(ctx.total)}</dd></div>
              <div className="ei-tot-row balance"><dt>Balance due</dt><dd>{fmtMoney(ctx.balanceDue)}</dd></div>
            </dl>
          </div>
        )}
      </div>

      {(isVisible(sv, 'footer_quote') || isVisible(sv, 'footer_meta')) && (
        <footer className="ei-foot">
          {isVisible(sv, 'footer_quote') && (ct.footer_quote || ctx.onFieldEdit) && (
            <EditableText
              as="div"
              field="footer_quote"
              value={ct.footer_quote ?? ''}
              onEdit={ctx.onFieldEdit}
              placeholder="Add a thank-you note…"
              className="ei-foot-q"
            />
          )}
          {isVisible(sv, 'footer_meta') && (
            <div className="ei-foot-meta" style={{ marginLeft: 'auto' }}>
              <b>{ctx.tenant.name}</b><br />
              {ctx.tenant.footerNote || [ctx.tenant.website, ctx.tenant.wcbNumber, ctx.tenant.insurance].filter(Boolean).join(' · ')}
            </div>
          )}
        </footer>
      )}
    </div>
  );
}
