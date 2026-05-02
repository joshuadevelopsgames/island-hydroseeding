import { fmtMoney, isVisible, type DesignContext } from './types';

const STYLE = `
  .fq-quote{--paper:#f7f1e1;--paper-edge:#ebe2cc;--ink:#2b2418;--ink-soft:#5b4f3a;--accent:#b03337;--moss:#5a6b3a;
    box-sizing:border-box;width:850px;max-width:850px;overflow:hidden;background:var(--paper);color:var(--ink);font-family:'Fraunces',Georgia,serif;position:relative;
    box-shadow:0 1px 0 rgba(0,0,0,.04),0 30px 60px -20px rgba(60,40,20,.25);
    background-image:radial-gradient(circle at 20% 30%,rgba(91,79,58,.04) 0,transparent 40%),radial-gradient(circle at 80% 70%,rgba(91,79,58,.05) 0,transparent 50%);}
  .fq-quote *{box-sizing:border-box;}
  .fq-quote h1,.fq-quote h2,.fq-quote h3,.fq-quote h4,.fq-quote h5,.fq-quote h6{color:inherit;font-weight:inherit;letter-spacing:inherit;}
  .fq-stamp{position:absolute;top:30px;right:60px;transform:rotate(8deg);color:var(--accent);border:3px solid var(--accent);padding:8px 14px 6px;font-family:'Inter',sans-serif;font-weight:800;font-size:13px;letter-spacing:3px;text-transform:uppercase;opacity:.85;z-index:5;background:rgba(247,241,225,.7);}
  .fq-stamp::before{content:'';position:absolute;inset:-4px;border:1px dashed var(--accent);border-radius:2px;opacity:.5;}
  .fq-stamp small{display:block;font-family:'Fraunces',serif;font-style:italic;font-weight:400;font-size:9px;letter-spacing:1px;text-transform:none;margin-top:2px;}
  .fq-accept-stamp{position:absolute;top:380px;left:80px;transform:rotate(-12deg);color:var(--accent);font-family:'Fraunces',serif;font-style:italic;font-size:54px;font-weight:500;letter-spacing:-.02em;opacity:.55;pointer-events:none;z-index:4;}
  .fq-shell{padding:52px 64px 44px;position:relative;}
  .fq-hero{display:grid;grid-template-columns:110px 1fr;gap:28px;align-items:center;padding-bottom:22px;border-bottom:2px solid var(--ink);}
  .fq-crest{width:110px;height:110px;border:2px solid var(--ink);border-radius:50%;display:grid;place-items:center;position:relative;background:var(--paper-edge);overflow:hidden;}
  .fq-crest::before{content:'';position:absolute;inset:6px;border:1px solid var(--ink);border-radius:50%;}
  .fq-crest img{width:100%;height:100%;object-fit:cover;}
  .fq-crest-letter{font-family:'Fraunces',serif;font-style:italic;font-size:54px;font-weight:500;color:var(--ink);}
  .fq-hero-title{font-family:'Fraunces',serif;font-size:42px;font-weight:400;letter-spacing:-.015em;line-height:1;margin:0 0 6px;}
  .fq-hero-title em{font-style:italic;color:var(--accent);font-weight:500;}
  .fq-hero-sub{font-style:italic;font-size:14px;color:var(--ink-soft);margin-bottom:8px;}
  .fq-hero-meta{display:flex;gap:22px;flex-wrap:wrap;font-family:'Inter',sans-serif;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink-soft);}
  .fq-hero-meta b{color:var(--ink);font-weight:600;}
  .fq-doc-row{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:22px;margin-bottom:24px;align-items:end;}
  .fq-doc-num{font-family:'Fraunces',serif;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:var(--ink-soft);margin-bottom:4px;}
  .fq-doc-num-big{font-family:'Fraunces',serif;font-size:34px;font-weight:400;letter-spacing:-.01em;line-height:1;}
  .fq-doc-num-big em{color:var(--accent);font-style:italic;}
  .fq-doc-num-sub{font-style:italic;font-size:14px;color:var(--ink-soft);margin-top:6px;}
  .fq-validity{text-align:right;font-family:'Inter',sans-serif;font-size:11px;color:var(--ink-soft);}
  .fq-validity .pill{display:inline-block;background:var(--accent);color:var(--paper);padding:6px 14px;font-size:9px;letter-spacing:2px;text-transform:uppercase;font-weight:600;margin-bottom:8px;}
  .fq-validity b{display:block;font-family:'Fraunces',serif;font-style:italic;font-weight:400;font-size:17px;color:var(--ink);margin-top:2px;}
  .fq-info{display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:1px dashed var(--ink);border-bottom:1px dashed var(--ink);}
  .fq-info-cell{padding:18px 0;border-right:1px dashed var(--ink);padding-right:24px;}
  .fq-info-cell:nth-child(2n){padding-right:0;padding-left:24px;border-right:0;}
  .fq-info-cell h4{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--accent);margin:0 0 8px;font-weight:600;display:flex;align-items:center;gap:6px;}
  .fq-info-cell h4::before{content:'✻';font-size:10px;}
  .fq-info-cell .name{font-family:'Fraunces',serif;font-style:italic;font-size:21px;font-weight:400;line-height:1.15;margin-bottom:4px;}
  .fq-info-cell .det{font-family:'Inter',sans-serif;font-size:11.5px;color:var(--ink-soft);line-height:1.5;}
  .fq-specimen{margin-top:24px;margin-bottom:24px;padding:20px 22px;background:var(--paper-edge);border:1px solid var(--ink);position:relative;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px;}
  .fq-specimen::before{content:'Site assessment';position:absolute;top:-9px;left:18px;background:var(--paper);padding:0 8px;font-family:'Fraunces',serif;font-style:italic;font-size:13px;color:var(--ink-soft);}
  .fq-stat{padding-right:14px;border-right:1px dotted var(--ink);}
  .fq-stat:last-child{border-right:0;}
  .fq-stat .lbl{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-soft);margin-bottom:4px;}
  .fq-stat .val{font-family:'Fraunces',serif;font-size:20px;font-weight:500;line-height:1;}
  .fq-stat .val small{font-style:italic;font-weight:400;font-size:11px;color:var(--ink-soft);margin-left:3px;}
  .fq-stat .det{font-family:'Inter',sans-serif;font-size:10px;color:var(--ink-soft);margin-top:4px;line-height:1.4;}
  .fq-rule{font-family:'Fraunces',serif;font-style:italic;font-size:18px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:baseline;}
  .fq-rule small{font-family:'Inter',sans-serif;font-style:normal;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-soft);}
  .fq-table{width:100%;border-collapse:collapse;table-layout:fixed;}
  .fq-table thead th{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--ink-soft);font-weight:500;text-align:left;padding:6px 10px 8px;border-bottom:1px solid var(--ink);}
  .fq-table thead th.num{text-align:right;}
  .fq-table tbody td{padding:13px 10px;border-bottom:1px dotted var(--ink-soft);vertical-align:top;font-family:'Inter',sans-serif;font-size:12px;line-height:1.5;}
  .fq-table tbody td.num{text-align:right;font-family:'JetBrains Mono',monospace;font-feature-settings:'tnum';font-size:13px;}
  .fq-table tr.opt td{opacity:.65;}
  .fq-code-tag{display:inline-block;padding:3px 7px;background:var(--ink);color:var(--paper);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.2px;border-radius:2px;}
  .fq-code-tag.opt{background:transparent;color:var(--ink-soft);border:1px dashed var(--ink-soft);}
  .fq-desc-main{font-family:'Fraunces',serif;font-size:15px;font-weight:500;line-height:1.25;margin-bottom:3px;}
  .fq-desc-main em{font-style:italic;color:var(--accent);font-size:11px;font-weight:400;margin-left:4px;}
  .fq-desc-sub{font-family:'Fraunces',serif;font-style:italic;font-size:11.5px;color:var(--ink-soft);line-height:1.45;}
  .fq-bottom{display:grid;grid-template-columns:1fr 320px;gap:36px;margin-top:28px;}
  .fq-terms h4{font-family:'Fraunces',serif;font-style:italic;font-size:17px;font-weight:400;margin:0 0 12px;display:flex;align-items:baseline;gap:10px;}
  .fq-terms h4::after{content:'';flex:1;height:1px;background:repeating-linear-gradient(to right,var(--ink-soft) 0 2px,transparent 2px 5px);}
  .fq-terms p{font-family:'Inter',sans-serif;font-size:11px;color:var(--ink);margin:0 0 10px;line-height:1.55;white-space:pre-wrap;}
  .fq-terms p b{color:var(--accent);font-weight:600;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;display:block;margin-bottom:2px;}
  .fq-totals{padding:18px 22px;background:var(--paper-edge);border:1px solid var(--ink);position:relative;}
  .fq-totals::before{content:'Estimate tally';position:absolute;top:-10px;left:16px;background:var(--paper);padding:0 8px;font-family:'Fraunces',serif;font-style:italic;font-size:13px;color:var(--ink-soft);}
  .fq-tot-row{display:flex;justify-content:space-between;padding:7px 0;font-family:'Inter',sans-serif;font-size:12px;border-bottom:1px dotted var(--ink-soft);}
  .fq-tot-row dt{color:var(--ink-soft);}
  .fq-tot-row dd{margin:0;font-family:'JetBrains Mono',monospace;}
  .fq-tot-row.opt dt,.fq-tot-row.opt dd{color:var(--accent);font-style:italic;}
  .fq-tot-row.grand{border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);margin-top:6px;padding:12px 0;}
  .fq-tot-row.grand dt{font-family:'Fraunces',serif;font-style:italic;font-size:18px;color:var(--ink);font-weight:500;}
  .fq-tot-row.grand dd{font-family:'Fraunces',serif;font-size:22px;color:var(--ink);font-weight:500;}
  .fq-tot-row.dep{margin-top:8px;padding:12px 14px;background:var(--accent);color:var(--paper);border:0;margin-left:-22px;margin-right:-22px;margin-bottom:-18px;}
  .fq-tot-row.dep dt{font-family:'Fraunces',serif;font-style:italic;font-size:16px;color:var(--paper);}
  .fq-tot-row.dep dd{font-family:'Fraunces',serif;font-size:22px;font-weight:500;color:var(--paper);}
  .fq-accept{margin-top:30px;padding:24px;border:1.5px solid var(--ink);background:var(--paper);position:relative;}
  .fq-accept::before{content:'';position:absolute;top:-1px;left:-1px;right:-1px;bottom:-1px;border:1px dashed var(--ink-soft);margin:6px;pointer-events:none;}
  .fq-accept-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--ink);}
  .fq-accept-head h3{font-family:'Fraunces',serif;font-style:italic;font-size:22px;font-weight:400;margin:0;}
  .fq-accept-head small{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--accent);font-weight:600;}
  .fq-accept-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;}
  .fq-accept-grid p{font-family:'Inter',sans-serif;font-size:11px;color:var(--ink-soft);line-height:1.5;margin:0 0 12px;}
  .fq-sig{border-bottom:1px solid var(--ink);min-height:48px;max-height:48px;overflow:hidden;display:flex;align-items:flex-end;padding-bottom:4px;font-family:'Fraunces',serif;font-style:italic;font-size:24px;color:var(--accent);white-space:nowrap;text-overflow:ellipsis;}
  .fq-sig-cap{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink-soft);margin-top:4px;display:flex;justify-content:space-between;}
`;

export default function FieldQuoteDesign({ ctx }: { ctx: DesignContext }) {
  const sv = ctx.sectionVisibility;
  const ct = ctx.customText;

  const includedCount = ctx.items.filter((i) => !i.isOptional).length;
  const optionalCount = ctx.items.filter((i) => i.isOptional).length;

  const tenantInitial = (ctx.tenant.name || 'H').trim().charAt(0).toUpperCase() || 'H';

  const stats = ct.banner_stats?.length
    ? ct.banner_stats
    : [
        { label: 'Items', value: String(ctx.items.length), sub: `${includedCount} incl` },
        { label: 'Subtotal', value: fmtMoney(ctx.subtotal).replace('$', '$ '), sub: 'pre-tax' },
        { label: 'Tax', value: `${(ctx.taxRate * 100).toFixed(0)}%`, sub: 'GST' },
        { label: 'Valid', value: `${ctx.validityDays}`, sub: 'days' },
      ];

  return (
    <div className="fq-quote">
      <style>{STYLE}</style>

      <div className="fq-stamp">
        Estimate
        <small>{ctx.validityDays}-day validity</small>
      </div>
      {ctx.isAccepted && <div className="fq-accept-stamp">accepted ✓</div>}

      <div className="fq-shell">
        {isVisible(sv, 'header') && (
          <header className="fq-hero">
            <div className="fq-crest">
              {ctx.tenant.logoUrl ? (
                <img src={ctx.tenant.logoUrl} alt={ctx.tenant.name} />
              ) : (
                <div className="fq-crest-letter">{tenantInitial}</div>
              )}
            </div>
            <div>
              <div className="fq-hero-title">
                <em>{ctx.tenant.name}</em>
              </div>
              {ctx.tenant.tagline && <div className="fq-hero-sub">{ctx.tenant.tagline}</div>}
              <div className="fq-hero-meta">
                {ctx.tenant.wcbNumber && (
                  <span>
                    WCB <b>{ctx.tenant.wcbNumber}</b>
                  </span>
                )}
                {ctx.tenant.gstNumber && (
                  <span>
                    GST <b>{ctx.tenant.gstNumber}</b>
                  </span>
                )}
                {ctx.tenant.phone && (
                  <span>
                    Office <b>{ctx.tenant.phone}</b>
                  </span>
                )}
              </div>
            </div>
          </header>
        )}

        <div className="fq-doc-row">
          <div>
            <div className="fq-doc-num">Quote — preliminary</div>
            <div className="fq-doc-num-big">
              № <em>Q · {ctx.quoteNumber}</em>
            </div>
            <div className="fq-doc-num-sub">{ctx.title || 'Pre-job estimate'}</div>
          </div>
          <div className="fq-validity">
            <div className="pill">Valid {ctx.validityDays} days</div>
            <div style={{ display: 'flex', gap: '24px', justifyContent: 'flex-end' }}>
              <div>
                Issued<b>{ctx.issuedDate}</b>
              </div>
              <div>
                Expires<b>{ctx.expiresDate}</b>
              </div>
            </div>
          </div>
        </div>

        {isVisible(sv, 'parties') && (
          <section className="fq-info">
            <div className="fq-info-cell">
              <h4>Prepared for</h4>
              <div className="name">{ctx.account?.name || '—'}</div>
              <div className="det">
                {ctx.account?.company && (
                  <>
                    {ctx.account.company}
                    <br />
                  </>
                )}
                {ctx.account?.email}
                {ctx.account?.email && ctx.account?.phone && ' · '}
                {ctx.account?.phone}
              </div>
            </div>
            <div className="fq-info-cell">
              <h4>Job site</h4>
              <div className="name">{ctx.property?.address || ctx.title || '—'}</div>
              <div className="det">
                {[ctx.property?.city, ctx.property?.province, ctx.property?.postal_code]
                  .filter(Boolean)
                  .join(', ') || '—'}
                {ctx.property?.notes && (
                  <>
                    <br />
                    {ctx.property.notes}
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {isVisible(sv, 'stats_banner') && (
          <section className="fq-specimen">
            {stats.map((s, i) => (
              <div className="fq-stat" key={i}>
                <div className="lbl">{s.label}</div>
                <div className="val">
                  {s.value}
                  {s.sub && <small>{s.sub}</small>}
                </div>
              </div>
            ))}
          </section>
        )}

        {isVisible(sv, 'scope_table') && (
          <>
            <h2 className="fq-rule">
              Proposed scope{' '}
              <small>
                {includedCount} included
                {optionalCount > 0 ? ` · ${optionalCount} optional` : ''} · CAD
              </small>
            </h2>

            <table className="fq-table">
              <thead>
                <tr>
                  <th style={{ width: '64px' }}>Code</th>
                  <th>Description</th>
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
                      <span className={'fq-code-tag ' + (it.isOptional ? 'opt' : '')}>{it.code}</span>
                    </td>
                    <td>
                      <div className="fq-desc-main">
                        {it.description}
                        {it.isOptional && <em>+ add-on</em>}
                      </div>
                      {it.detail && <div className="fq-desc-sub">{it.detail}</div>}
                    </td>
                    <td className="num">{it.quantity}</td>
                    <td>{it.unit}</td>
                    <td className="num">{fmtMoney(it.rate)}</td>
                    <td className="num">{fmtMoney(it.amount)}</td>
                  </tr>
                ))}
                {ctx.items.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: '24px' }}>
                      No line items yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        <div className="fq-bottom">
          {isVisible(sv, 'terms') && (
            <div className="fq-terms">
              <h4>Terms</h4>
              {ct.terms_paragraphs?.length ? (
                ct.terms_paragraphs.map((p, i) => <p key={i}>{p}</p>)
              ) : ctx.contractDisclaimer ? (
                <p>{ctx.contractDisclaimer}</p>
              ) : (
                <p style={{ color: 'var(--ink-soft)' }}>No contract terms provided.</p>
              )}
            </div>
          )}
          {isVisible(sv, 'summary') && (
            <dl className="fq-totals">
              <div className="fq-tot-row">
                <dt>Subtotal</dt>
                <dd>{fmtMoney(ctx.subtotal)}</dd>
              </div>
              {isVisible(sv, 'optional_addons') && ctx.optionalSubtotal > 0 && (
                <div className="fq-tot-row opt">
                  <dt>If add-ons selected</dt>
                  <dd>+{fmtMoney(ctx.optionalSubtotal)}</dd>
                </div>
              )}
              <div className="fq-tot-row">
                <dt>GST ({(ctx.taxRate * 100).toFixed(0)}%)</dt>
                <dd>{fmtMoney(ctx.taxAmount)}</dd>
              </div>
              <div className="fq-tot-row grand">
                <dt>Estimated total</dt>
                <dd>{fmtMoney(ctx.total)}</dd>
              </div>
              {isVisible(sv, 'deposit') && ctx.depositRequired && ctx.depositAmount > 0 && (
                <div className="fq-tot-row dep">
                  <dt>Deposit ({ctx.depositPct.toFixed(0)}%)</dt>
                  <dd>{fmtMoney(ctx.depositAmount)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        {isVisible(sv, 'accept_block') && (
          <section className="fq-accept">
            <div className="fq-accept-head">
              <h3>{ct.accept_heading || 'Accept this estimate'}</h3>
              <small>
                Sign to schedule · {ctx.validityDays}-day validity
              </small>
            </div>
            <div className="fq-accept-grid">
              <div>
                <p>{ct.accept_body || 'Sign & date below, or simply reply "accepted". We\'ll send a deposit invoice and lock in your start window within 24 hours.'}</p>
                <div className="fq-sig">{ctx.acceptedSignatureName || ''}</div>
                <div className="fq-sig-cap">
                  <span>Client signature</span>
                  <span>{ctx.acceptedAt || 'Date'}</span>
                </div>
              </div>
              <div>
                <p>{ct.issued_by_body || `${ctx.tenant.ownerName ?? ctx.tenant.name} will be your point of contact through the job.`}</p>
                <div className="fq-sig">{ctx.tenant.ownerName || ctx.tenant.name}</div>
                <div className="fq-sig-cap">
                  <span>{ct.issued_by_heading || ctx.tenant.name}</span>
                  <span>{ctx.issuedDate}</span>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
