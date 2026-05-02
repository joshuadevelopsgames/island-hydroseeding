import { fmtNum, isVisible } from '@/components/quotes/designs/types';
import EditableText from '@/components/quotes/designs/EditableText';
import type { InvoiceDesignContext } from './types';

const STYLE = `
  .si-inv{--bg:#f5f1e8;--bg-2:#ebe4d3;--line:#d8cfb8;--line-2:#c2b797;--ink:#1a1612;--muted:#6b5d4a;--accent:#b03337;
    box-sizing:border-box;width:850px;max-width:850px;overflow:hidden;background:var(--bg);color:var(--ink);font-family:'Inter',sans-serif;position:relative;
    display:grid;grid-template-columns:200px 1fr;box-shadow:0 1px 0 rgba(0,0,0,.04),0 30px 80px -20px rgba(60,40,20,.25);}
  .si-inv *{box-sizing:border-box;}
  .si-inv h1,.si-inv h2,.si-inv h3,.si-inv h4,.si-inv h5,.si-inv h6{color:inherit;font-weight:inherit;letter-spacing:inherit;}
  .si-side{background:var(--accent);color:#fff;padding:32px 22px 28px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;}
  .si-side::before{content:'';position:absolute;top:0;right:0;bottom:0;width:1px;background:linear-gradient(to bottom,transparent,rgba(255,255,255,.2) 20%,rgba(255,255,255,.2) 80%,transparent);}
  .si-side-logo{display:block;max-width:140px;max-height:60px;width:auto;height:auto;margin-bottom:8px;filter:brightness(0) invert(1);}
  .si-side-mark{font-family:'Fraunces',serif;font-style:italic;font-size:52px;font-weight:400;letter-spacing:-.04em;line-height:.85;}
  .si-side-mark::after{content:'';display:block;width:32px;height:2px;background:#fff;margin-top:12px;}
  .si-side-name{font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:600;margin-top:14px;}
  .si-side-name span{display:block;font-weight:400;opacity:.75;margin-top:2px;letter-spacing:2px;font-size:9px;}
  .si-side-vert{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:4px;text-transform:uppercase;writing-mode:vertical-rl;transform:rotate(180deg);opacity:.8;margin:24px 0;}
  .si-side-meta{font-size:10px;line-height:1.7;opacity:.9;}
  .si-side-meta b{display:block;font-size:8.5px;letter-spacing:2px;text-transform:uppercase;opacity:.7;font-weight:500;margin-top:10px;}
  .si-side-meta b:first-child{margin-top:0;}
  .si-side-meta span{font-family:'JetBrains Mono',monospace;font-size:11px;}
  .si-paid-stamp{position:absolute;top:80px;right:50px;z-index:5;padding:12px 24px 10px;border:2px solid var(--accent);color:var(--accent);font-family:'Fraunces',serif;font-style:italic;font-size:30px;font-weight:500;letter-spacing:2px;opacity:.92;transform:rotate(-6deg);background:rgba(176,51,55,.06);pointer-events:none;}
  .si-paid-stamp small{display:block;font-family:'Inter',sans-serif;font-style:normal;font-size:8px;letter-spacing:3px;text-transform:uppercase;margin-top:2px;opacity:.7;}
  .si-main{padding:32px 36px 36px;}
  .si-headline{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:end;padding-bottom:18px;border-bottom:1px solid var(--line);}
  .si-eyebrow{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--accent);margin-bottom:8px;}
  .si-eyebrow::before{content:'◆ ';}
  .si-doc{font-family:'Fraunces',serif;font-size:50px;font-weight:300;letter-spacing:-.025em;line-height:.95;margin:0;}
  .si-doc em{font-style:italic;font-weight:400;color:var(--accent);}
  .si-doc-amount{text-align:right;}
  .si-doc-amount .lbl{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--muted);margin-bottom:4px;}
  .si-pill{display:inline-block;background:var(--accent);color:var(--bg);padding:6px 12px;font-size:9px;letter-spacing:2px;text-transform:uppercase;font-weight:600;border-radius:2px;margin-top:6px;}
  .si-meta-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;padding:16px 0;border-bottom:1px solid var(--line);}
  .si-meta-item .l{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:6px;}
  .si-meta-item .v{font-family:'Fraunces',serif;font-size:15px;font-weight:400;line-height:1.15;}
  .si-meta-item .v small{display:block;font-family:'Inter',sans-serif;font-size:11px;color:var(--muted);margin-top:2px;}
  .si-parties{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;padding:20px 0;border-bottom:1px solid var(--line);}
  .si-party{padding-right:22px;border-right:1px solid var(--line);}
  .si-party:nth-child(2){padding-left:22px;}
  .si-party:last-child{border-right:0;padding-left:22px;padding-right:0;}
  .si-party h4{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--accent);margin:0 0 8px;font-weight:500;}
  .si-party .nm{font-family:'Fraunces',serif;font-size:16px;font-weight:400;line-height:1.15;margin-bottom:6px;}
  .si-party .det{font-size:11px;color:var(--muted);line-height:1.55;}
  .si-mark{margin-top:30px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:baseline;padding-bottom:10px;border-bottom:1px solid var(--line);}
  .si-mark h3{font-family:'Fraunces',serif;font-size:22px;font-weight:300;margin:0;}
  .si-mark h3 em{font-style:italic;color:var(--accent);}
  .si-mark small{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);}
  .si-table{width:100%;border-collapse:collapse;table-layout:fixed;}
  .si-table thead th{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:500;text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);}
  .si-table thead th.num{text-align:right;}
  .si-table tbody td{padding:12px 10px;border-bottom:1px solid var(--line);vertical-align:top;font-size:12px;line-height:1.5;}
  .si-table tbody tr:hover{background:rgba(176,51,55,.04);}
  .si-table tbody td.num{text-align:right;font-family:'JetBrains Mono',monospace;font-feature-settings:'tnum';font-size:13px;}
  .si-num{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent);font-weight:500;}
  .si-desc-main{font-family:'Fraunces',serif;font-size:14px;font-weight:400;line-height:1.25;margin-bottom:3px;}
  .si-desc-sub{font-size:11px;color:var(--muted);line-height:1.5;}
  .si-bottom{display:grid;grid-template-columns:1fr 280px;gap:24px;margin-top:24px;}
  .si-pay h4{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--accent);margin:0 0 10px;font-weight:600;}
  .si-pay-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 18px;font-size:11px;line-height:1.55;}
  .si-pay-grid h5{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:1.8px;text-transform:uppercase;color:var(--muted);margin:0 0 4px;font-weight:500;}
  .si-pay-grid p{margin:0;color:var(--ink);}
  .si-totals-frame{padding:14px;background:var(--bg-2);border:1px solid var(--line);position:relative;overflow:hidden;}
  .si-totals-frame::before{content:'$';position:absolute;top:-30px;right:-10px;font-family:'Fraunces',serif;font-size:160px;font-style:italic;color:rgba(26,22,18,.04);line-height:1;pointer-events:none;}
  .si-tot-row{display:flex;justify-content:space-between;padding:9px 0;font-size:12px;border-bottom:1px solid var(--line);}
  .si-tot-row dt{color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;}
  .si-tot-row dd{margin:0;font-family:'JetBrains Mono',monospace;font-feature-settings:'tnum';}
  .si-tot-row.balance{padding:16px 14px;margin:10px -14px -14px;background:var(--accent);color:#fff;border:0;display:grid;grid-template-columns:1fr;gap:4px;}
  .si-tot-row.balance dt{color:rgba(255,255,255,.78);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:4px;}
  .si-tot-row.balance dd{font-family:'Fraunces',serif;font-size:30px;font-weight:400;letter-spacing:-.02em;color:#fff;line-height:1;}
  .si-tot-row.balance dd small{font-size:11px;opacity:.78;margin-left:6px;font-family:'Inter',sans-serif;letter-spacing:1px;}
  .si-foot{margin-top:22px;padding-top:14px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);}
  .si-foot b{color:var(--ink);}
`;

export default function StatementInvoiceDesign({ ctx }: { ctx: InvoiceDesignContext }) {
  const sv = ctx.sectionVisibility;
  const ct = ctx.customText;
  const tenantInitial = (ctx.tenant.name || 'S').trim().charAt(0).toUpperCase() || 'S';

  return (
    <div className="si-inv">
      <style>{STYLE}</style>

      {ctx.isPaid && sv.paid_stamp !== false && (
        <div className="si-paid-stamp">
          Paid<small>cleared</small>
        </div>
      )}

      <aside className="si-side">
        <div>
          {ctx.tenant.logoUrl && <img className="si-side-logo" src={ctx.tenant.logoUrl} alt={ctx.tenant.name} />}
          <div className="si-side-mark">{tenantInitial}<span style={{ fontStyle: 'italic' }}>·</span></div>
          <div className="si-side-name">{ctx.tenant.name}{ctx.tenant.tagline && <span>{ctx.tenant.tagline}</span>}</div>
          <div className="si-side-vert">№ INV-{ctx.invoiceNumber}</div>
        </div>
        <div className="si-side-meta">
          {ctx.tenant.phone && (<><b>Office</b><span>{ctx.tenant.phone}</span></>)}
          {ctx.tenant.email && (<><b>Email</b><span style={{ fontSize: '10px' }}>{ctx.tenant.email}</span></>)}
          {ctx.tenant.website && (<><b>Web</b><span>{ctx.tenant.website}</span></>)}
          {(ctx.tenant.wcbNumber || ctx.tenant.gstNumber) && (
            <>
              <b>WCB / GST</b>
              <span style={{ fontSize: '10px' }}>
                {ctx.tenant.wcbNumber}{ctx.tenant.wcbNumber && ctx.tenant.gstNumber ? ' · ' : ''}{ctx.tenant.gstNumber}
              </span>
            </>
          )}
        </div>
      </aside>

      <div className="si-main">
        {isVisible(sv, 'header') && (
          <header className="si-headline">
            <div>
              <div className="si-eyebrow">Invoice · Final · CAD</div>
              <h1 className="si-doc">No. <em>INV · {ctx.invoiceNumber}</em></h1>
            </div>
            <div className="si-doc-amount">
              <div className="lbl">Issued / Due</div>
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: '17px' }}>
                {ctx.issueDate} · <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>{ctx.dueDate}</em>
              </div>
              <div className="si-pill">{ctx.isPaid ? 'Paid' : ctx.isOverdue ? 'Overdue' : ctx.paymentTerms || 'Net 30'}</div>
            </div>
          </header>
        )}

        {isVisible(sv, 'stats_banner') && (
          <div className="si-meta-strip">
            <div className="si-meta-item"><div className="l">Project</div><div className="v">{(ctx.title || '—').slice(0, 22)}<small>{ctx.property?.address?.slice(0, 26) || ''}</small></div></div>
            <div className="si-meta-item"><div className="l">Issued</div><div className="v">{ctx.issueDate}<small>Due {ctx.dueDate}</small></div></div>
            <div className="si-meta-item"><div className="l">Items</div><div className="v">{ctx.items.length}<small>line items</small></div></div>
            <div className="si-meta-item"><div className="l">Terms</div><div className="v">{ctx.paymentTerms || 'Net 30'}<small>from issue</small></div></div>
          </div>
        )}

        {isVisible(sv, 'parties') && (
          <section className="si-parties">
            <div className="si-party">
              <h4>Billed to</h4>
              <div className="nm">{ctx.account?.name || '—'}</div>
              <div className="det">
                {ctx.account?.company && (<>{ctx.account.company}<br /></>)}
                {ctx.account?.email}
              </div>
            </div>
            <div className="si-party">
              <h4>Job site</h4>
              <div className="nm">{ctx.property?.address || ctx.title || '—'}</div>
              <div className="det">
                {[ctx.property?.city, ctx.property?.province].filter(Boolean).join(', ') || '—'}
                {ctx.property?.postal_code && (<><br />{ctx.property.postal_code}</>)}
              </div>
            </div>
            <div className="si-party">
              <h4>Issued by</h4>
              <div className="nm">{ctx.tenant.ownerName || ctx.tenant.name}</div>
              <div className="det">{ctx.tenant.email}<br />{ctx.tenant.phone}</div>
            </div>
          </section>
        )}

        {isVisible(sv, 'scope_table') && (
          <>
            <div className="si-mark">
              <h3>Services <em>rendered</em></h3>
              <small>{ctx.items.length} items · CAD</small>
            </div>
            <table className="si-table">
              <thead>
                <tr>
                  <th style={{ width: '64px' }}>Code</th>
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
                    <td><span className="si-num">{it.code}</span></td>
                    <td>
                      <div className="si-desc-main">{it.description}</div>
                      {it.detail && <div className="si-desc-sub">{it.detail}</div>}
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

        <div className="si-bottom">
          {isVisible(sv, 'terms') && (
            <div className="si-pay">
              <h4>Remittance &amp; terms</h4>
              <div className="si-pay-grid">
                {ctx.tenant.email && (<div><h5>E-transfer</h5><p>{ctx.tenant.email}</p></div>)}
                <div><h5>Terms</h5><p>{ctx.paymentTerms || 'Net 30'} from issue.</p></div>
                {(ct.footer_quote || ctx.onFieldEdit) && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <h5>Note</h5>
                    <EditableText as="div" field="footer_quote" value={ct.footer_quote ?? ''} onEdit={ctx.onFieldEdit} placeholder="Add a thank-you note…" style={{ fontStyle: 'italic', margin: 0 }} />
                  </div>
                )}
                {(ctx.contractDisclaimer || ctx.onFieldEdit) && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <h5>Disclaimer</h5>
                    <EditableText as="div" multiline field="contractDisclaimer" value={ctx.contractDisclaimer ?? ''} onEdit={ctx.onFieldEdit} placeholder="Add disclaimer…" style={{ whiteSpace: 'pre-wrap', margin: 0 }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {isVisible(sv, 'summary') && (
            <div className="si-totals-frame">
              <dl>
                <div className="si-tot-row"><dt>Subtotal</dt><dd>${fmtNum(ctx.subtotal)}</dd></div>
                <div className="si-tot-row"><dt>GST {(ctx.taxRate * 100).toFixed(0)}%</dt><dd>${fmtNum(ctx.taxAmount)}</dd></div>
                {ctx.amountPaid > 0 && (
                  <div className="si-tot-row"><dt>Paid</dt><dd>−${fmtNum(ctx.amountPaid)}</dd></div>
                )}
                <div className="si-tot-row"><dt>Total</dt><dd>${fmtNum(ctx.total)}</dd></div>
                <div className="si-tot-row balance"><dt>Balance Due</dt><dd>${fmtNum(ctx.balanceDue)}<small>CAD</small></dd></div>
              </dl>
            </div>
          )}
        </div>

        {isVisible(sv, 'footer_meta') && (
          <div className="si-foot">
            <span>{ctx.tenant.website && <b>{ctx.tenant.website}</b>}{ctx.tenant.phone ? ` · ${ctx.tenant.phone}` : ''}</span>
            <span>
              Doc rev <b>1.0</b>
              {ctx.tenant.wcbNumber && (<>{' · '}WCB <b>{ctx.tenant.wcbNumber}</b></>)}
              {ctx.tenant.insurance && (<>{' · Insured '}<b>{ctx.tenant.insurance}</b></>)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
