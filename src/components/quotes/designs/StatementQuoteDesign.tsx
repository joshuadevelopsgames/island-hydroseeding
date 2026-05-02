import { fmtNum, isVisible, type DesignContext } from './types';

const STYLE = `
  .sq-quote{--bg:#f5f1e8;--bg-2:#ebe4d3;--line:#d8cfb8;--line-2:#c2b797;--ink:#1a1612;--muted:#6b5d4a;--accent:#b03337;
    box-sizing:border-box;width:850px;max-width:850px;overflow:hidden;background:var(--bg);color:var(--ink);font-family:'Inter',sans-serif;position:relative;
    display:grid;grid-template-columns:200px 1fr;box-shadow:0 1px 0 rgba(0,0,0,.04),0 30px 80px -20px rgba(60,40,20,.25);}
  .sq-quote *{box-sizing:border-box;}
  .sq-quote h1,.sq-quote h2,.sq-quote h3,.sq-quote h4,.sq-quote h5,.sq-quote h6{color:inherit;font-weight:inherit;letter-spacing:inherit;}
  .sq-side{background:var(--accent);color:#fff;padding:32px 22px 28px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;}
  .sq-side::before{content:'';position:absolute;top:0;right:0;bottom:0;width:1px;background:linear-gradient(to bottom,transparent,rgba(255,255,255,.2) 20%,rgba(255,255,255,.2) 80%,transparent);}
  .sq-side-mark{font-family:'Fraunces',serif;font-style:italic;font-size:52px;font-weight:400;letter-spacing:-.04em;line-height:.85;}
  .sq-side-mark::after{content:'';display:block;width:32px;height:2px;background:#fff;margin-top:12px;}
  .sq-side-logo{display:block;max-width:140px;max-height:60px;width:auto;height:auto;margin-bottom:8px;filter:brightness(0) invert(1);}
  .sq-side-logo + .sq-side-mark::after{margin-top:8px;}
  .sq-side-name{font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:600;margin-top:14px;}
  .sq-side-name span{display:block;font-weight:400;opacity:.75;margin-top:2px;letter-spacing:2px;font-size:9px;}
  .sq-side-vert{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:4px;text-transform:uppercase;writing-mode:vertical-rl;transform:rotate(180deg);opacity:.8;margin:24px 0;}
  .sq-side-meta{font-size:10px;line-height:1.7;opacity:.9;}
  .sq-side-meta b{display:block;font-size:8.5px;letter-spacing:2px;text-transform:uppercase;opacity:.7;font-weight:500;margin-top:10px;}
  .sq-side-meta b:first-child{margin-top:0;}
  .sq-side-meta span{font-family:'JetBrains Mono',monospace;font-size:11px;}
  .sq-accept-stamp{position:absolute;top:80px;right:50px;z-index:5;padding:12px 24px 10px;border:2px solid var(--accent);color:var(--accent);font-family:'Fraunces',serif;font-style:italic;font-size:26px;font-weight:500;letter-spacing:2px;opacity:.9;transform:rotate(-6deg);background:rgba(176,51,55,.06);pointer-events:none;}
  .sq-accept-stamp small{display:block;font-family:'Inter',sans-serif;font-style:normal;font-size:8px;letter-spacing:3px;text-transform:uppercase;margin-top:2px;opacity:.7;}
  .sq-main{padding:32px 36px 36px;}
  .sq-headline{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:end;padding-bottom:18px;border-bottom:1px solid var(--line);}
  .sq-eyebrow{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--accent);margin-bottom:8px;}
  .sq-eyebrow::before{content:'◆ ';}
  .sq-doc{font-family:'Fraunces',serif;font-size:50px;font-weight:300;letter-spacing:-.025em;line-height:.95;margin:0;}
  .sq-doc em{font-style:italic;font-weight:400;color:var(--accent);}
  .sq-doc-amount{text-align:right;}
  .sq-doc-amount .lbl{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--muted);margin-bottom:4px;}
  .sq-pill{display:inline-block;background:var(--accent);color:var(--bg);padding:6px 12px;font-size:9px;letter-spacing:2px;text-transform:uppercase;font-weight:600;border-radius:2px;margin-top:6px;}
  .sq-meta-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;padding:16px 0;border-bottom:1px solid var(--line);}
  .sq-meta-item .l{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:6px;}
  .sq-meta-item .v{font-family:'Fraunces',serif;font-size:15px;font-weight:400;line-height:1.15;}
  .sq-meta-item .v small{display:block;font-family:'Inter',sans-serif;font-size:11px;color:var(--muted);margin-top:2px;}
  .sq-parties{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;padding:20px 0;border-bottom:1px solid var(--line);}
  .sq-party{padding-right:22px;border-right:1px solid var(--line);}
  .sq-party:nth-child(2){padding-left:22px;}
  .sq-party:last-child{border-right:0;padding-left:22px;padding-right:0;}
  .sq-party h4{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--accent);margin:0 0 8px;font-weight:500;}
  .sq-party .nm{font-family:'Fraunces',serif;font-size:16px;font-weight:400;line-height:1.15;margin-bottom:6px;}
  .sq-party .det{font-size:11px;color:var(--muted);line-height:1.55;}
  .sq-mark{margin-top:30px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:baseline;padding-bottom:10px;border-bottom:1px solid var(--line);}
  .sq-mark h3{font-family:'Fraunces',serif;font-size:22px;font-weight:300;margin:0;}
  .sq-mark h3 em{font-style:italic;color:var(--accent);}
  .sq-mark small{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);}
  .sq-table{width:100%;border-collapse:collapse;table-layout:fixed;}
  .sq-table thead th{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:500;text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);}
  .sq-table thead th.num{text-align:right;}
  .sq-table tbody td{padding:12px 10px;border-bottom:1px solid var(--line);vertical-align:top;font-size:12px;line-height:1.5;}
  .sq-table tbody tr:hover{background:rgba(176,51,55,.04);}
  .sq-table tbody td.num{text-align:right;font-family:'JetBrains Mono',monospace;font-feature-settings:'tnum';font-size:13px;}
  .sq-table tr.opt td{opacity:.7;background:rgba(176,51,55,.03);}
  .sq-num{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent);font-weight:500;}
  .sq-desc-main{font-family:'Fraunces',serif;font-size:14px;font-weight:400;line-height:1.25;margin-bottom:3px;}
  .sq-desc-main em{font-style:italic;color:var(--accent);font-size:11px;font-weight:400;margin-left:4px;}
  .sq-desc-sub{font-size:11px;color:var(--muted);line-height:1.5;}
  .sq-bottom{display:grid;grid-template-columns:1fr 280px;gap:24px;margin-top:24px;}
  .sq-terms h4{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--accent);margin:0 0 10px;font-weight:600;}
  .sq-terms p{font-size:11px;line-height:1.55;margin:0 0 8px;color:var(--ink);white-space:pre-wrap;}
  .sq-totals-frame{padding:14px;background:var(--bg-2);border:1px solid var(--line);position:relative;overflow:hidden;}
  .sq-totals-frame::before{content:'$';position:absolute;top:-30px;right:-10px;font-family:'Fraunces',serif;font-size:160px;font-style:italic;color:rgba(26,22,18,.04);line-height:1;pointer-events:none;}
  .sq-tot-row{display:flex;justify-content:space-between;padding:9px 0;font-size:12px;border-bottom:1px solid var(--line);}
  .sq-tot-row dt{color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;}
  .sq-tot-row dd{margin:0;font-family:'JetBrains Mono',monospace;font-feature-settings:'tnum';}
  .sq-tot-row.opt dt,.sq-tot-row.opt dd{color:var(--accent);}
  .sq-tot-row.dep{padding:16px 14px;margin:10px -14px -14px;background:var(--accent);color:#fff;border:0;display:grid;grid-template-columns:1fr;gap:4px;}
  .sq-tot-row.dep dt{color:rgba(255,255,255,.78);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:4px;}
  .sq-tot-row.dep dd{font-family:'Fraunces',serif;font-size:30px;font-weight:400;letter-spacing:-.02em;color:#fff;line-height:1;}
  .sq-tot-row.dep dd small{font-size:11px;opacity:.78;margin-left:6px;font-family:'Inter',sans-serif;letter-spacing:1px;}
  .sq-accept{margin-top:24px;display:grid;grid-template-columns:200px 1fr;gap:0;border:1px solid var(--line);}
  .sq-accept-side{background:var(--bg-2);padding:20px;border-right:1px solid var(--line);}
  .sq-accept-side h3{font-family:'Fraunces',serif;font-size:20px;font-weight:300;line-height:1.05;margin:0 0 8px;}
  .sq-accept-side h3 em{font-style:italic;color:var(--accent);}
  .sq-accept-side small{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);}
  .sq-accept-side p{font-size:10.5px;color:var(--muted);line-height:1.55;margin-top:14px;}
  .sq-accept-grid{display:grid;grid-template-columns:1fr 1fr;}
  .sq-accept-cell{padding:20px;border-right:1px solid var(--line);}
  .sq-accept-cell:last-child{border-right:0;}
  .sq-accept-cell h4{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin:0 0 10px;font-weight:600;}
  .sq-sig{border-bottom:1px solid var(--line-2);min-height:42px;max-height:42px;overflow:hidden;display:flex;align-items:flex-end;padding-bottom:4px;font-family:'Fraunces',serif;font-style:italic;font-size:24px;color:var(--accent);white-space:nowrap;text-overflow:ellipsis;}
  .sq-sig-cap{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-top:4px;display:flex;justify-content:space-between;}
  .sq-foot{margin-top:22px;padding-top:14px;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);}
  .sq-foot b{color:var(--ink);}
`;

export default function StatementQuoteDesign({ ctx }: { ctx: DesignContext }) {
  const sv = ctx.sectionVisibility;
  const ct = ctx.customText;

  const includedCount = ctx.items.filter((i) => !i.isOptional).length;
  const tenantInitial = (ctx.tenant.name || 'S').trim().charAt(0).toUpperCase() || 'S';

  const metaStrip = ct.banner_stats?.length
    ? ct.banner_stats
    : [
        {
          label: 'Project',
          value: ctx.title?.slice(0, 22) || '—',
          sub: ctx.property?.address ? ctx.property.address.slice(0, 26) : '',
        },
        { label: 'Issued', value: ctx.issuedDate, sub: `Expires ${ctx.expiresDate}` },
        { label: 'Items', value: `${includedCount}/${ctx.items.length}`, sub: 'incl / total' },
        { label: 'Validity', value: `${ctx.validityDays} days`, sub: 'from issue' },
      ];

  return (
    <div className="sq-quote">
      <style>{STYLE}</style>

      {ctx.isAccepted && (
        <div className="sq-accept-stamp">
          Accepted<small>Client signed</small>
        </div>
      )}

      <aside className="sq-side">
        <div>
          {ctx.tenant.logoUrl && (
            <img className="sq-side-logo" src={ctx.tenant.logoUrl} alt={ctx.tenant.name} />
          )}
          <div className="sq-side-mark">
            {tenantInitial}
            <span style={{ fontStyle: 'italic' }}>·</span>
          </div>
          <div className="sq-side-name">
            {ctx.tenant.name}
            {ctx.tenant.tagline && <span>{ctx.tenant.tagline}</span>}
          </div>
          <div className="sq-side-vert">№ Q-{ctx.quoteNumber}</div>
        </div>
        <div className="sq-side-meta">
          {ctx.tenant.phone && (
            <>
              <b>Office</b>
              <span>{ctx.tenant.phone}</span>
            </>
          )}
          {ctx.tenant.email && (
            <>
              <b>Email</b>
              <span style={{ fontSize: '10px' }}>{ctx.tenant.email}</span>
            </>
          )}
          {ctx.tenant.website && (
            <>
              <b>Web</b>
              <span>{ctx.tenant.website}</span>
            </>
          )}
          {(ctx.tenant.wcbNumber || ctx.tenant.gstNumber) && (
            <>
              <b>WCB / GST</b>
              <span style={{ fontSize: '10px' }}>
                {ctx.tenant.wcbNumber}
                {ctx.tenant.wcbNumber && ctx.tenant.gstNumber ? ' · ' : ''}
                {ctx.tenant.gstNumber}
              </span>
            </>
          )}
        </div>
      </aside>

      <div className="sq-main">
        {isVisible(sv, 'header') && (
          <header className="sq-headline">
            <div>
              <div className="sq-eyebrow">Quote · Estimate · CAD</div>
              <h1 className="sq-doc">
                No. <em>Q · {ctx.quoteNumber}</em>
              </h1>
            </div>
            <div className="sq-doc-amount">
              <div className="lbl">Issued / Expires</div>
              <div style={{ fontFamily: 'Fraunces,serif', fontSize: '17px' }}>
                {ctx.issuedDate} ·{' '}
                <em style={{ fontStyle: 'italic', color: 'var(--accent)' }}>{ctx.expiresDate}</em>
              </div>
              <div className="sq-pill">Valid {ctx.validityDays} days</div>
            </div>
          </header>
        )}

        {isVisible(sv, 'stats_banner') && (
          <div className="sq-meta-strip">
            {metaStrip.map((m, i) => (
              <div className="sq-meta-item" key={i}>
                <div className="l">{m.label}</div>
                <div className="v">
                  {m.value}
                  {m.sub && <small>{m.sub}</small>}
                </div>
              </div>
            ))}
          </div>
        )}

        {isVisible(sv, 'parties') && (
          <section className="sq-parties">
            <div className="sq-party">
              <h4>Prepared for</h4>
              <div className="nm">{ctx.account?.name || '—'}</div>
              <div className="det">
                {ctx.account?.company && (
                  <>
                    {ctx.account.company}
                    <br />
                  </>
                )}
                {ctx.account?.email}
              </div>
            </div>
            <div className="sq-party">
              <h4>Job site</h4>
              <div className="nm">{ctx.property?.address || ctx.title || '—'}</div>
              <div className="det">
                {[ctx.property?.city, ctx.property?.province].filter(Boolean).join(', ') || '—'}
                {ctx.property?.postal_code && (
                  <>
                    <br />
                    {ctx.property.postal_code}
                  </>
                )}
              </div>
            </div>
            <div className="sq-party">
              <h4>Issued by</h4>
              <div className="nm">{ctx.tenant.ownerName || ctx.tenant.name}</div>
              <div className="det">
                {ctx.tenant.email}
                <br />
                {ctx.tenant.phone}
              </div>
            </div>
          </section>
        )}

        {isVisible(sv, 'scope_table') && (
          <>
            <div className="sq-mark">
              <h3>
                Scope of <em>work</em>
              </h3>
              <small>
                {includedCount}/{ctx.items.length} included · CAD
              </small>
            </div>

            <table className="sq-table">
              <thead>
                <tr>
                  <th style={{ width: '64px' }}>Code</th>
                  <th>Item</th>
                  <th className="num" style={{ width: '60px' }}>
                    Qty
                  </th>
                  <th style={{ width: '50px' }}>Unit</th>
                  <th className="num" style={{ width: '80px' }}>
                    Rate
                  </th>
                  <th className="num" style={{ width: '100px' }}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {ctx.items.map((it) => (
                  <tr key={it.id} className={it.isOptional ? 'opt' : ''}>
                    <td>
                      <span className="sq-num">{it.code}</span>
                    </td>
                    <td>
                      <div className="sq-desc-main">
                        {it.description}
                        {it.isOptional && <em>+ add-on</em>}
                      </div>
                      {it.detail && <div className="sq-desc-sub">{it.detail}</div>}
                    </td>
                    <td className="num">{it.quantity}</td>
                    <td>{it.unit}</td>
                    <td className="num">${fmtNum(it.rate)}</td>
                    <td className="num">${fmtNum(it.amount)}</td>
                  </tr>
                ))}
                {ctx.items.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                      No line items yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        <div className="sq-bottom">
          {isVisible(sv, 'terms') && (
            <div className="sq-terms">
              <h4>Terms &amp; conditions</h4>
              {ct.terms_paragraphs?.length ? (
                ct.terms_paragraphs.map((p, i) => <p key={i}>{p}</p>)
              ) : ctx.contractDisclaimer ? (
                <p>{ctx.contractDisclaimer}</p>
              ) : (
                <p style={{ color: 'var(--muted)' }}>No contract terms provided.</p>
              )}
            </div>
          )}

          {isVisible(sv, 'summary') && (
            <div className="sq-totals-frame">
              <dl>
                <div className="sq-tot-row">
                  <dt>Subtotal</dt>
                  <dd>${fmtNum(ctx.subtotal)}</dd>
                </div>
                {isVisible(sv, 'optional_addons') && ctx.optionalSubtotal > 0 && (
                  <div className="sq-tot-row opt">
                    <dt>Optional add-ons</dt>
                    <dd>+${fmtNum(ctx.optionalSubtotal)}</dd>
                  </div>
                )}
                <div className="sq-tot-row">
                  <dt>GST {(ctx.taxRate * 100).toFixed(0)}%</dt>
                  <dd>${fmtNum(ctx.taxAmount)}</dd>
                </div>
                <div className="sq-tot-row">
                  <dt>Estimate Total</dt>
                  <dd>${fmtNum(ctx.total)}</dd>
                </div>
                {isVisible(sv, 'deposit') && ctx.depositRequired && ctx.depositAmount > 0 && (
                  <div className="sq-tot-row dep">
                    <dt>Deposit Due ({ctx.depositPct.toFixed(0)}%)</dt>
                    <dd>
                      ${fmtNum(ctx.depositAmount)}
                      <small>CAD</small>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>

        {isVisible(sv, 'accept_block') && (
          <section className="sq-accept">
            <div className="sq-accept-side">
              <h3>
                {ct.accept_heading || (
                  <>
                    Accept &amp; <em>schedule</em>
                  </>
                )}
              </h3>
              <small>Sign to lock dates</small>
              <p>{ct.accept_body || 'Sign & date below or simply reply "accepted". We\'ll send a deposit invoice and confirm a start window within 24 hours.'}</p>
            </div>
            <div className="sq-accept-grid">
              <div className="sq-accept-cell">
                <h4>Client signature</h4>
                <div className="sq-sig">{ctx.acceptedSignatureName || ''}</div>
                <div className="sq-sig-cap">
                  <span>Name &amp; sign</span>
                  <span>{ctx.acceptedAt || 'Date'}</span>
                </div>
              </div>
              <div className="sq-accept-cell">
                <h4>{ct.issued_by_heading || 'Issued by'}</h4>
                <div className="sq-sig">{ctx.tenant.ownerName || ctx.tenant.name}</div>
                <div className="sq-sig-cap">
                  <span>{ctx.tenant.name}</span>
                  <span>{ctx.issuedDate}</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {isVisible(sv, 'footer_meta') && (
          <div className="sq-foot">
            <span>
              {ctx.tenant.website && <b>{ctx.tenant.website}</b>}
              {ctx.tenant.phone ? ` · ${ctx.tenant.phone}` : ''}
            </span>
            <span>
              Doc rev <b>1.0</b>
              {ctx.tenant.wcbNumber && (
                <>
                  {' · '}WCB <b>{ctx.tenant.wcbNumber}</b>
                </>
              )}
              {ctx.tenant.insurance && (
                <>
                  {' · Insured '}
                  <b>{ctx.tenant.insurance}</b>
                </>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
