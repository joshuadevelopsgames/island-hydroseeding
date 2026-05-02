import { fmtNum, isVisible, type DesignContext } from './types';

const STYLE = `
  .tq-quote{--bg:#f6f5f2;--grid:#e3e0d8;--ink:#14130f;--muted:#6f6a5e;--accent:#b03337;--accent-soft:#f5dada;
    box-sizing:border-box;width:850px;max-width:850px;overflow:hidden;background:var(--bg);color:var(--ink);font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.5;
    background-image:linear-gradient(to right,var(--grid) 1px,transparent 1px),linear-gradient(to bottom,var(--grid) 1px,transparent 1px);background-size:24px 24px;
    box-shadow:0 1px 0 rgba(0,0,0,.04),0 30px 60px -20px rgba(20,30,20,.2);position:relative;}
  .tq-quote *{box-sizing:border-box;}
  .tq-quote h1,.tq-quote h2,.tq-quote h3,.tq-quote h4,.tq-quote h5,.tq-quote h6{color:inherit;font-weight:inherit;letter-spacing:inherit;}
  .tq-accept-stamp{position:absolute;top:220px;right:60px;transform:rotate(-6deg);background:var(--accent);color:var(--bg);padding:12px 26px;font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:28px;letter-spacing:5px;opacity:.92;pointer-events:none;text-transform:uppercase;border-radius:2px;box-shadow:6px 6px 0 var(--ink);z-index:5;}
  .tq-tape{background:var(--ink);color:var(--bg);padding:8px 32px;display:flex;justify-content:space-between;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;}
  .tq-tape b{color:var(--accent-soft);font-weight:400;margin-right:6px;}
  .tq-shell{padding:32px 40px 36px;}
  .tq-head{display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:start;padding-bottom:22px;border-bottom:2px solid var(--ink);}
  .tq-mark-row{display:flex;align-items:center;gap:14px;margin-bottom:16px;}
  .tq-mark-glyph{width:52px;height:52px;background:var(--ink);color:var(--bg);display:grid;place-items:center;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:22px;letter-spacing:-.04em;position:relative;}
  .tq-mark-glyph::after{content:'';position:absolute;inset:4px;border:1px solid var(--bg);}
  .tq-mark-glyph img{width:100%;height:100%;object-fit:cover;}
  .tq-mark-name{font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;letter-spacing:-.02em;line-height:1;}
  .tq-mark-sub{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-top:4px;}
  .tq-meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;font-size:11px;}
  .tq-meta-grid dt{color:var(--muted);text-transform:uppercase;letter-spacing:1px;font-size:9px;}
  .tq-meta-grid dd{margin:0;}
  .tq-headline{text-align:right;}
  .tq-doc-tag{display:inline-block;background:var(--accent);color:var(--bg);padding:4px 10px;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;font-weight:600;margin-bottom:10px;}
  .tq-doc-num{font-family:'Space Grotesk',sans-serif;font-size:48px;font-weight:700;letter-spacing:-.04em;line-height:.95;margin-bottom:6px;}
  .tq-doc-meta{display:flex;justify-content:flex-end;gap:18px;font-size:11px;}
  .tq-doc-meta div span{display:block;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:2px;}
  .tq-validity{margin-top:14px;padding:8px 12px;background:var(--accent-soft);color:var(--accent);font-family:'Space Grotesk',sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;display:inline-block;}
  .tq-quad{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;margin-top:20px;border:1px solid var(--ink);background:var(--bg);}
  .tq-quad-cell{padding:13px 15px;border-right:1px solid var(--ink);}
  .tq-quad-cell:last-child{border-right:0;}
  .tq-quad-cell h4{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin:0 0 6px;font-weight:500;}
  .tq-quad-cell .v{font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:600;letter-spacing:-.01em;line-height:1.25;}
  .tq-quad-cell .s{font-size:10px;color:var(--muted);margin-top:3px;line-height:1.4;}
  .tq-section-bar{background:var(--ink);color:var(--bg);padding:6px 12px;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;margin-top:24px;display:flex;justify-content:space-between;}
  .tq-table{width:100%;border-collapse:collapse;background:var(--bg);border:1px solid var(--ink);border-top:0;table-layout:fixed;}
  .tq-table thead th{font-size:9px;letter-spacing:1.8px;text-transform:uppercase;color:var(--muted);font-weight:500;text-align:left;padding:10px 12px;border-bottom:1px solid var(--ink);}
  .tq-table thead th.num{text-align:right;}
  .tq-table tbody td{padding:11px 12px;border-bottom:1px dashed var(--grid);vertical-align:top;font-size:12px;}
  .tq-table tbody tr:last-child td{border-bottom:0;}
  .tq-table tbody td.num{text-align:right;font-feature-settings:'tnum';}
  .tq-table tr.opt td{background:rgba(176,51,55,.03);}
  .tq-table tr.opt td .tq-desc-main::before{content:'OPT · ';color:var(--accent);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1.5px;}
  .tq-code{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--accent);font-weight:600;}
  .tq-desc-main{font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:600;margin-bottom:2px;}
  .tq-desc-sub{font-size:10px;color:var(--muted);line-height:1.5;}
  .tq-bottom{display:grid;grid-template-columns:1fr 320px;gap:24px;margin-top:24px;}
  .tq-terms{background:var(--bg);border:1px solid var(--ink);padding:16px;}
  .tq-terms h3{font-family:'Space Grotesk',sans-serif;font-size:12px;margin:0 0 10px;font-weight:700;text-transform:uppercase;}
  .tq-terms p{font-size:11px;line-height:1.55;margin:0 0 8px;white-space:pre-wrap;}
  .tq-terms ol{margin:0;padding-left:20px;font-size:11px;line-height:1.65;}
  .tq-terms ol li{margin-bottom:6px;}
  .tq-terms ol li b{color:var(--accent);}
  .tq-totals{background:var(--bg);border:1px solid var(--ink);}
  .tq-tot-row{display:grid;grid-template-columns:1fr auto;padding:9px 16px;font-size:12px;border-bottom:1px solid var(--grid);}
  .tq-tot-row dt{color:var(--muted);}
  .tq-tot-row dd{margin:0;font-feature-settings:'tnum';}
  .tq-tot-row.opt dt,.tq-tot-row.opt dd{color:var(--accent);}
  .tq-tot-row.grand{background:var(--ink);color:var(--bg);padding:14px 16px;}
  .tq-tot-row.grand dt{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--bg);}
  .tq-tot-row.grand dd{font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;letter-spacing:-.02em;}
  .tq-tot-row.dep{background:var(--accent-soft);padding:12px 16px;}
  .tq-tot-row.dep dt{color:var(--accent);font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:1.5px;}
  .tq-tot-row.dep dd{font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;color:var(--accent);}
  .tq-accept{margin-top:24px;background:var(--ink);color:var(--bg);padding:22px 24px;display:grid;grid-template-columns:1fr 1fr;gap:32px;}
  .tq-accept h3{font-family:'Space Grotesk',sans-serif;font-size:14px;margin:0 0 8px;letter-spacing:-.005em;color:var(--accent-soft);}
  .tq-accept p{font-size:10px;color:rgba(246,245,242,.6);margin:0 0 12px;line-height:1.5;letter-spacing:.5px;}
  .tq-accept-line{border-bottom:1px solid var(--bg);min-height:42px;max-height:42px;overflow:hidden;display:flex;align-items:flex-end;padding-bottom:4px;font-family:'Space Grotesk',sans-serif;font-style:italic;font-size:20px;color:var(--accent-soft);white-space:nowrap;text-overflow:ellipsis;}
  .tq-accept-cap{font-size:9px;letter-spacing:1.8px;text-transform:uppercase;color:rgba(246,245,242,.55);margin-top:4px;display:flex;justify-content:space-between;}
  .tq-foot{margin-top:20px;padding:14px 20px;background:var(--bg);border:1px solid var(--ink);display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);}
  .tq-foot b{color:var(--ink);}
`;

export default function TechnicalQuoteDesign({ ctx }: { ctx: DesignContext }) {
  const sv = ctx.sectionVisibility;
  const ct = ctx.customText;

  const includedCount = ctx.items.filter((i) => !i.isOptional).length;

  const initials =
    (ctx.tenant.name || 'SH')
      .split(/\s+/)
      .map((w) => w.charAt(0))
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'SH';

  const quad = ct.banner_stats?.length
    ? ct.banner_stats
    : [
        {
          label: 'Prepared for',
          value: ctx.account?.name || '—',
          sub: ctx.account?.email || ctx.account?.phone || '',
        },
        {
          label: 'Job site',
          value: ctx.property?.address || ctx.title || '—',
          sub: [ctx.property?.city, ctx.property?.province].filter(Boolean).join(', '),
        },
        {
          label: 'Issued',
          value: ctx.issuedDate,
          sub: `Expires ${ctx.expiresDate}`,
        },
        {
          label: 'Items',
          value: `${ctx.items.length}`,
          sub: `${includedCount} included`,
        },
      ];

  return (
    <div className="tq-quote">
      <style>{STYLE}</style>

      {ctx.isAccepted && <div className="tq-accept-stamp">Accepted</div>}

      <div className="tq-tape">
        <span>
          <b>DOC</b>QTE-{ctx.quoteNumber}
        </span>
        <span>
          <b>STATUS</b>
          {ctx.isAccepted ? 'SIGNED' : `PENDING · ${ctx.validityDays}D VALID`}
        </span>
        <span>
          <b>REV</b>1.0
        </span>
        <span>
          <b>FILE</b>
          {(ctx.title || 'QUOTE').toUpperCase().replace(/\s+/g, '-').slice(0, 16)}
        </span>
      </div>

      <div className="tq-shell">
        {isVisible(sv, 'header') && (
          <header className="tq-head">
            <div>
              <div className="tq-mark-row">
                <div className="tq-mark-glyph">
                  {ctx.tenant.logoUrl ? <img src={ctx.tenant.logoUrl} alt={ctx.tenant.name} /> : initials}
                </div>
                <div>
                  <div className="tq-mark-name">{ctx.tenant.name.toUpperCase()}</div>
                  {ctx.tenant.tagline && <div className="tq-mark-sub">{ctx.tenant.tagline}</div>}
                </div>
              </div>
              <dl className="tq-meta-grid">
                {ctx.tenant.phone && (
                  <>
                    <dt>Office</dt>
                    <dd>{ctx.tenant.phone}</dd>
                  </>
                )}
                {ctx.tenant.ownerName && (
                  <>
                    <dt>Crew lead</dt>
                    <dd>{ctx.tenant.ownerName}</dd>
                  </>
                )}
                {ctx.tenant.email && (
                  <>
                    <dt>Email</dt>
                    <dd>{ctx.tenant.email}</dd>
                  </>
                )}
                {ctx.tenant.wcbNumber && (
                  <>
                    <dt>WCB</dt>
                    <dd>{ctx.tenant.wcbNumber}</dd>
                  </>
                )}
                {ctx.tenant.gstNumber && (
                  <>
                    <dt>GST</dt>
                    <dd>{ctx.tenant.gstNumber}</dd>
                  </>
                )}
                {ctx.tenant.insurance && (
                  <>
                    <dt>Insured</dt>
                    <dd>{ctx.tenant.insurance}</dd>
                  </>
                )}
              </dl>
            </div>
            <div className="tq-headline">
              <div className="tq-doc-tag">Quote / Estimate</div>
              <div className="tq-doc-num">№Q-{ctx.quoteNumber}</div>
              <div className="tq-doc-meta">
                <div>
                  <span>Issued</span>
                  {ctx.issuedDate}
                </div>
                <div>
                  <span>Expires</span>
                  {ctx.expiresDate}
                </div>
              </div>
              <div className="tq-validity">Valid · {ctx.validityDays} days</div>
            </div>
          </header>
        )}

        {isVisible(sv, 'parties') && (
          <div className="tq-quad">
            {quad.map((c, i) => (
              <div className="tq-quad-cell" key={i}>
                <h4>{c.label}</h4>
                <div className="v">{c.value}</div>
                {c.sub && <div className="s">{c.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {isVisible(sv, 'scope_table') && (
          <>
            <div className="tq-section-bar">
              <span>§ 01 — Scope of work</span>
              <span>
                {includedCount}/{ctx.items.length} included · CAD
              </span>
            </div>

            <table className="tq-table">
              <thead>
                <tr>
                  <th style={{ width: '70px' }}>Code</th>
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
                      <span className="tq-code">{it.code}</span>
                    </td>
                    <td>
                      <div className="tq-desc-main">{it.description}</div>
                      {it.detail && <div className="tq-desc-sub">{it.detail}</div>}
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

        <div className="tq-bottom">
          {isVisible(sv, 'terms') && (
            <div className="tq-terms">
              <h3>§ 02 — Terms</h3>
              {ct.terms_paragraphs?.length ? (
                <ol>
                  {ct.terms_paragraphs.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              ) : ctx.contractDisclaimer ? (
                <p>{ctx.contractDisclaimer}</p>
              ) : (
                <p style={{ color: 'var(--muted)' }}>No contract terms provided.</p>
              )}
            </div>
          )}

          {isVisible(sv, 'summary') && (
            <dl className="tq-totals">
              <div className="tq-tot-row">
                <dt>Subtotal</dt>
                <dd>${fmtNum(ctx.subtotal)}</dd>
              </div>
              {isVisible(sv, 'optional_addons') && ctx.optionalSubtotal > 0 && (
                <div className="tq-tot-row opt">
                  <dt>Optional add-ons</dt>
                  <dd>+${fmtNum(ctx.optionalSubtotal)}</dd>
                </div>
              )}
              <div className="tq-tot-row">
                <dt>GST {(ctx.taxRate * 100).toFixed(0)}%</dt>
                <dd>${fmtNum(ctx.taxAmount)}</dd>
              </div>
              <div className="tq-tot-row grand">
                <dt>Estimate Total</dt>
                <dd>${fmtNum(ctx.total)}</dd>
              </div>
              {isVisible(sv, 'deposit') && ctx.depositRequired && ctx.depositAmount > 0 && (
                <div className="tq-tot-row dep">
                  <dt>Deposit ({ctx.depositPct.toFixed(0)}%)</dt>
                  <dd>${fmtNum(ctx.depositAmount)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        {isVisible(sv, 'accept_block') && (
          <section className="tq-accept">
            <div>
              <h3>{ct.accept_heading || 'To accept · client'}</h3>
              <p>{ct.accept_body || "Sign & date below. We'll invoice the deposit and confirm a start window within 24 hrs."}</p>
              <div className="tq-accept-line">{ctx.acceptedSignatureName || ''}</div>
              <div className="tq-accept-cap">
                <span>Signature</span>
                <span>{ctx.acceptedAt ? ctx.acceptedAt : 'Date'}</span>
              </div>
            </div>
            <div>
              <h3>{ct.issued_by_heading || `Issued by · ${ctx.tenant.name}`}</h3>
              <p>{ct.issued_by_body || `${ctx.tenant.ownerName ?? ctx.tenant.name} — reply with questions before signing.`}</p>
              <div className="tq-accept-line">{ctx.tenant.ownerName || ctx.tenant.name}</div>
              <div className="tq-accept-cap">
                <span>Authorized</span>
                <span>{ctx.issuedDate}</span>
              </div>
            </div>
          </section>
        )}

        {isVisible(sv, 'footer_meta') && (
          <div className="tq-foot">
            <span>
              {ctx.tenant.website && <b>{ctx.tenant.website}</b>}
              {ctx.tenant.phone ? ` · ${ctx.tenant.phone}` : ''}
            </span>
            <span>
              Doc rev 1.0
              {ctx.tenant.wcbNumber && (
                <>
                  {' · '}WCB <b>{ctx.tenant.wcbNumber}</b>
                </>
              )}
              {ctx.tenant.insurance && (
                <>
                  {' · '}Insured to <b>{ctx.tenant.insurance}</b>
                </>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
