import { Fragment } from 'react';
import { fmtMoney, isVisible, type DesignContext } from './types';
import EditableText from './EditableText';

const STYLE = `
  .eq-quote {
    --ink:#1a1612; --paper:#f4ede1; --paper-2:#ebe1d0; --accent:#b03337; --muted:#6b5d4a; --soft:#d4c5a9;
    box-sizing:border-box; width:850px; max-width:850px; overflow:hidden;
    background:var(--paper); color:var(--ink); font-family:'Fraunces',Georgia,serif;
    padding:64px 64px 48px; position:relative;
    box-shadow:0 1px 0 rgba(0,0,0,.04),0 30px 60px -20px rgba(60,40,20,.25);
  }
  .eq-quote *{box-sizing:border-box;}
  .eq-quote h1,.eq-quote h2,.eq-quote h3,.eq-quote h4,.eq-quote h5,.eq-quote h6{color:inherit;font-weight:inherit;letter-spacing:inherit;}
  .eq-accept-stamp{position:absolute;top:110px;right:80px;transform:rotate(-12deg);border:4px double var(--accent);color:var(--accent);padding:8px 22px;font-family:'Inter',sans-serif;font-weight:800;font-size:24px;letter-spacing:3px;opacity:.85;pointer-events:none;text-transform:uppercase;border-radius:4px;}
  .eq-accept-stamp small{display:block;font-style:italic;font-family:'Fraunces',serif;font-weight:400;font-size:11px;letter-spacing:1px;text-transform:none;margin-top:2px;}
  .eq-head{display:grid;grid-template-columns:1fr auto;gap:40px;align-items:start;padding-bottom:24px;border-bottom:1px solid var(--ink);}
  .eq-mark{display:flex;align-items:center;gap:14px;}
  .eq-mark-glyph{width:56px;height:56px;border-radius:50%;background:var(--accent);color:var(--paper);display:grid;place-items:center;font-family:'Fraunces',serif;font-style:italic;font-weight:600;font-size:30px;padding-bottom:4px;overflow:hidden;flex:none;}
  .eq-mark-glyph img{max-width:88%;max-height:88%;width:auto;height:auto;object-fit:contain;object-position:center;border-radius:50%;}
  .eq-mark-logo{height:64px;display:flex;align-items:center;flex:none;}
  .eq-mark-logo img{height:64px;max-height:64px;width:auto;max-width:200px;object-fit:contain;object-position:left center;display:block;}
  .eq-mark-name{font-size:26px;font-weight:500;letter-spacing:-.01em;line-height:1.05;}
  .eq-mark-name em{font-style:italic;color:var(--accent);font-weight:400;}
  .eq-mark-tag{font-family:'Inter',sans-serif;font-size:10px;letter-spacing:2.4px;text-transform:uppercase;color:var(--muted);margin-top:4px;}
  .eq-meta{text-align:right;font-family:'Inter',sans-serif;font-size:11px;color:var(--muted);}
  .eq-meta-row{display:flex;gap:14px;justify-content:flex-end;margin-bottom:4px;}
  .eq-meta-row dt{text-transform:uppercase;letter-spacing:1.6px;}
  .eq-meta-row dd{color:var(--ink);margin:0;font-family:'JetBrains Mono',monospace;font-size:12px;}
  .eq-title-row{display:grid;grid-template-columns:1fr auto;align-items:end;margin-top:32px;margin-bottom:24px;gap:24px;}
  .eq-title{font-family:'Fraunces',serif;font-size:64px;line-height:.92;letter-spacing:-.035em;font-weight:300;margin:0;}
  .eq-title em{font-style:italic;font-weight:300;color:var(--accent);}
  .eq-title-sub{font-style:italic;font-size:18px;color:var(--muted);margin-top:6px;font-weight:400;}
  .eq-validity{text-align:right;}
  .eq-valid-pill{display:inline-block;background:var(--accent);color:var(--paper);padding:8px 14px;font-family:'Inter',sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:600;border-radius:2px;margin-bottom:8px;}
  .eq-valid-detail{font-family:'Inter',sans-serif;font-size:11px;color:var(--muted);letter-spacing:1px;}
  .eq-valid-detail b{display:block;font-family:'Fraunces',serif;font-style:italic;font-weight:400;font-size:18px;color:var(--ink);margin-top:2px;letter-spacing:0;}
  .eq-parties{display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;padding:22px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--ink);margin-bottom:28px;}
  .eq-p-label{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:2.4px;text-transform:uppercase;color:var(--muted);margin-bottom:8px;}
  .eq-p-name{font-family:'Fraunces',serif;font-size:18px;font-weight:500;margin-bottom:4px;line-height:1.2;}
  .eq-p-detail{font-family:'Inter',sans-serif;font-size:12px;line-height:1.5;}
  .eq-p-detail span{color:var(--muted);}
  .eq-banner{background:var(--paper-2);padding:18px 22px;margin-bottom:28px;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;border-left:3px solid var(--accent);}
  .eq-stat-l{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:6px;}
  .eq-stat-v{font-family:'Fraunces',serif;font-size:20px;font-weight:500;line-height:1;}
  .eq-stat-v small{font-size:11px;color:var(--muted);font-style:italic;font-weight:400;margin-left:4px;}
  .eq-section-h{font-family:'Inter',sans-serif;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--ink);display:flex;justify-content:space-between;}
  .eq-section-h span:last-child{color:var(--ink);font-family:'JetBrains Mono',monospace;}
  .eq-table{width:100%;border-collapse:collapse;table-layout:fixed;}
  .eq-table thead th{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:500;text-align:left;padding:6px 10px;border-bottom:1px solid var(--soft);}
  .eq-table thead th.num{text-align:right;}
  .eq-table tbody td{padding:13px 10px;border-bottom:1px dashed var(--soft);vertical-align:top;font-family:'Inter',sans-serif;font-size:13px;line-height:1.5;}
  .eq-table tbody td.num{text-align:right;font-family:'JetBrains Mono',monospace;}
  .eq-table tr.opt td{opacity:.62;}
  .eq-code{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1px;color:var(--accent);background:rgba(176,51,55,.08);padding:3px 7px;border-radius:3px;display:inline-block;white-space:nowrap;}
  .eq-code.opt-tag{background:transparent;color:var(--muted);border:1px dashed var(--muted);}
  .eq-desc-main{font-family:'Fraunces',serif;font-size:16px;font-weight:500;margin-bottom:2px;color:var(--ink);}
  .eq-desc-main em{font-style:italic;color:var(--muted);font-weight:400;font-size:12px;margin-left:6px;}
  .eq-desc-sub{font-size:11px;color:var(--muted);line-height:1.45;}
  .eq-bottom{display:grid;grid-template-columns:1fr 320px;gap:48px;margin-top:32px;}
  .eq-terms h4{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin:0 0 8px;font-weight:600;}
  .eq-terms p{font-family:'Inter',sans-serif;font-size:11.5px;color:var(--ink);line-height:1.55;margin:0 0 12px;white-space:pre-wrap;}
  .eq-terms p span{color:var(--muted);}
  .eq-tot dt{color:var(--muted);}
  .eq-tot{font-family:'Inter',sans-serif;}
  .eq-tot-row{display:flex;justify-content:space-between;padding:9px 0;font-size:13px;border-bottom:1px dashed var(--soft);}
  .eq-tot-row dd{margin:0;font-family:'JetBrains Mono',monospace;}
  .eq-tot-row.opt dt,.eq-tot-row.opt dd{color:var(--muted);font-style:italic;}
  .eq-tot-row.grand{margin-top:8px;padding:16px 0;border-top:2px solid var(--ink);border-bottom:2px solid var(--ink);}
  .eq-tot-row.grand dt{font-family:'Fraunces',serif;font-size:20px;color:var(--ink);font-weight:500;font-style:italic;}
  .eq-tot-row.grand dd{font-family:'Fraunces',serif;font-size:26px;color:var(--accent);font-weight:500;}
  .eq-tot-row.deposit{background:var(--paper-2);padding:12px 14px;margin:6px -14px 0;}
  .eq-tot-row.deposit dt{font-family:'Inter',sans-serif;font-weight:600;color:var(--ink);font-size:11px;letter-spacing:1.5px;text-transform:uppercase;}
  .eq-tot-row.deposit dd{font-family:'Fraunces',serif;font-style:italic;font-size:18px;color:var(--accent);}
  .eq-accept{margin-top:36px;padding:24px;background:var(--paper-2);display:grid;grid-template-columns:1fr 1fr;gap:32px;border-top:3px solid var(--accent);}
  .eq-accept h3{font-family:'Fraunces',serif;font-style:italic;font-weight:400;font-size:24px;margin:0 0 8px;}
  .eq-accept p{font-family:'Inter',sans-serif;font-size:11.5px;color:var(--muted);margin:0 0 14px;line-height:1.5;}
  .eq-sig-line{border-bottom:1px solid var(--ink);min-height:48px;max-height:48px;overflow:hidden;display:flex;align-items:flex-end;padding-bottom:4px;font-family:'Fraunces',serif;font-style:italic;font-size:22px;color:var(--accent);white-space:nowrap;text-overflow:ellipsis;}
  .eq-sig-cap{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:1.8px;text-transform:uppercase;color:var(--muted);margin-top:4px;display:flex;justify-content:space-between;}
  .eq-foot{margin-top:28px;padding-top:18px;border-top:1px solid var(--ink);display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end;}
  .eq-foot-q{font-family:'Fraunces',serif;font-style:italic;font-weight:300;font-size:15px;color:var(--muted);max-width:380px;line-height:1.4;}
  .eq-foot-meta{font-family:'Inter',sans-serif;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);text-align:right;line-height:1.7;}
  .eq-foot-meta b{color:var(--ink);}
`;

export default function EditorialQuoteDesign({ ctx }: { ctx: DesignContext }) {
  const sv = ctx.sectionVisibility;
  const ct = ctx.customText;

  const includedCount = ctx.items.filter((i) => !i.isOptional).length;
  const optionalCount = ctx.items.filter((i) => i.isOptional).length;

  // Banner stats: prefer custom override, otherwise derive from totals.
  const bannerStats = ct.banner_stats?.length
    ? ct.banner_stats
    : [
        { label: 'Items', value: String(ctx.items.length), sub: `${includedCount} incl` },
        { label: 'Subtotal', value: fmtMoney(ctx.subtotal).replace('$', '$ '), sub: 'CAD' },
        { label: 'Tax', value: `${(ctx.taxRate * 100).toFixed(0)}%`, sub: 'GST' },
        { label: 'Valid', value: `${ctx.validityDays}`, sub: 'days' },
      ];

  const tenantInitial =
    (ctx.tenant.name || 'h').trim().charAt(0).toLowerCase() || 'h';

  return (
    <div className="eq-quote">
      <style>{STYLE}</style>

      {ctx.isAccepted && (
        <div className="eq-accept-stamp">
          Accepted<small>Client signed</small>
        </div>
      )}

      {isVisible(sv, 'header') && (
        <header className="eq-head">
          <div className="eq-mark">
            {ctx.tenant.logoUrl ? (
              <div className="eq-mark-logo">
                <img src={ctx.tenant.logoUrl} alt={ctx.tenant.name} />
              </div>
            ) : (
              <div className="eq-mark-glyph">{tenantInitial}</div>
            )}
            <div>
              <div className="eq-mark-name">{ctx.tenant.name}</div>
              {ctx.tenant.tagline && <div className="eq-mark-tag">{ctx.tenant.tagline}</div>}
            </div>
          </div>
          <dl className="eq-meta">
            {ctx.tenant.phone && (
              <div className="eq-meta-row">
                <dt>Office</dt>
                <dd>{ctx.tenant.phone}</dd>
              </div>
            )}
            {ctx.tenant.email && (
              <div className="eq-meta-row">
                <dt>Email</dt>
                <dd>{ctx.tenant.email}</dd>
              </div>
            )}
            {ctx.tenant.gstNumber && (
              <div className="eq-meta-row">
                <dt>GST</dt>
                <dd>{ctx.tenant.gstNumber}</dd>
              </div>
            )}
          </dl>
        </header>
      )}

      <div className="eq-title-row">
        <div>
          <h1 className="eq-title">
            Quote <em>№ Q-{ctx.quoteNumber}</em>
          </h1>
          <EditableText
            as="div"
            field="title"
            value={ctx.title}
            onEdit={ctx.onFieldEdit}
            placeholder="Estimate for hydroseeding services — pre-job"
            className="eq-title-sub"
          />

        </div>
        <div className="eq-validity">
          <div className="eq-valid-pill">Valid {ctx.validityDays} days</div>
          <div className="eq-valid-detail">
            Issued<b>{ctx.issuedDate}</b>
          </div>
          <div className="eq-valid-detail" style={{ marginTop: '6px' }}>
            Expires<b>{ctx.expiresDate}</b>
          </div>
        </div>
      </div>

      {isVisible(sv, 'parties') && (
        <section className="eq-parties">
          <div>
            <div className="eq-p-label">Prepared for</div>
            <div className="eq-p-name">{ctx.account?.name || '—'}</div>
            <div className="eq-p-detail">
              {ctx.account?.company && (
                <>
                  <span>{ctx.account.company}</span>
                  <br />
                </>
              )}
              {ctx.account?.email && <span>{ctx.account.email}</span>}
            </div>
          </div>
          <div>
            <div className="eq-p-label">Job site</div>
            <div className="eq-p-name">{ctx.property?.address || ctx.title || '—'}</div>
            <div className="eq-p-detail">
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
            <div className="eq-p-label">Issued by</div>
            <div className="eq-p-name">{ctx.tenant.ownerName || ctx.tenant.name}</div>
            <div className="eq-p-detail">
              <span>Issued {ctx.issuedDate}</span>
              <br />
              {ctx.tenant.phone && <span>{ctx.tenant.phone}</span>}
            </div>
          </div>
        </section>
      )}

      {isVisible(sv, 'stats_banner') && (
        <section className="eq-banner">
          {bannerStats.map((s, i) => (
            <div key={i}>
              <div className="eq-stat-l">{s.label}</div>
              <div className="eq-stat-v">
                {s.value}
                {s.sub && <small>{s.sub}</small>}
              </div>
            </div>
          ))}
        </section>
      )}

      {isVisible(sv, 'scope_table') && (
        <>
          <div className="eq-section-h">
            <span>Scope of work</span>
            <span>
              {includedCount}/{ctx.items.length} included
              {optionalCount > 0 ? ` · ${optionalCount} optional` : ''}
            </span>
          </div>

          {(ctx.introduction || ctx.onFieldEdit) && (
            <EditableText
              as="div"
              multiline
              field="introduction"
              value={ctx.introduction ?? ''}
              onEdit={ctx.onFieldEdit}
              placeholder="Add an introduction…"
              style={{
                fontFamily: 'Inter,sans-serif',
                fontSize: '12.5px',
                color: 'var(--muted)',
                marginTop: 0,
                marginBottom: '14px',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
              }}
            />
          )}

          <table className="eq-table">
            <thead>
              <tr>
                <th style={{ width: '70px' }}>Code</th>
                <th>Description</th>
                <th className="num" style={{ width: '60px' }}>
                  Qty
                </th>
                <th style={{ width: '50px' }}>Unit</th>
                <th className="num" style={{ width: '90px' }}>
                  Rate
                </th>
                <th className="num" style={{ width: '110px' }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {ctx.items.map((it) => (
                <Fragment key={String(it.id)}>
                  {it.sectionHeading ? (
                    <tr className="eq-section-hdr">
                      <td
                        colSpan={6}
                        style={{
                          padding: '12px 8px 6px',
                          fontFamily: "'Inter',sans-serif",
                          fontSize: '11px',
                          letterSpacing: '2px',
                          textTransform: 'uppercase',
                          color: 'var(--accent)',
                          borderBottom: '1px solid var(--soft)',
                        }}
                      >
                        {it.sectionHeading}
                      </td>
                    </tr>
                  ) : null}
                  <tr className={it.isOptional ? 'opt' : ''}>
                    <td>
                      <span className={'eq-code ' + (it.isOptional ? 'opt-tag' : '')}>{it.code}</span>
                    </td>
                    <td>
                      <div className="eq-desc-main">
                        {it.description}
                        {it.isOptional && <em>+ optional add-on</em>}
                      </div>
                      {it.detail && <div className="eq-desc-sub">{it.detail}</div>}
                    </td>
                    <td className="num">{it.quantity}</td>
                    <td>{it.unit}</td>
                    <td className="num">{fmtMoney(it.rate)}</td>
                    <td className="num">{fmtMoney(it.amount)}</td>
                  </tr>
                </Fragment>
              ))}
              {ctx.items.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>
                    Add line items in the editor to see them here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <div className="eq-bottom">
        {isVisible(sv, 'terms') && (
          <div className="eq-terms">
            <h4>Terms &amp; conditions</h4>
            {ct.terms_paragraphs?.length ? (
              ct.terms_paragraphs.map((p, i) => <p key={i}>{p}</p>)
            ) : (
              <EditableText
                as="div"
                multiline
                field="contractDisclaimer"
                value={ctx.contractDisclaimer ?? ''}
                onEdit={ctx.onFieldEdit}
                placeholder="Add terms & conditions…"
                emptyFallback={<p><span>No contract terms provided.</span></p>}
                style={{ whiteSpace: 'pre-wrap' }}
              />
            )}
          </div>
        )}
        {isVisible(sv, 'summary') && (
          <div>
            <div className="eq-section-h">
              <span>Estimate summary</span>
              <span>CAD</span>
            </div>
            <dl className="eq-tot">
              <div className="eq-tot-row">
                <dt>Subtotal (included)</dt>
                <dd>{fmtMoney(ctx.subtotal)}</dd>
              </div>
              {isVisible(sv, 'optional_addons') && ctx.optionalSubtotal > 0 && (
                <div className="eq-tot-row opt">
                  <dt>Optional add-ons</dt>
                  <dd>+{fmtMoney(ctx.optionalSubtotal)}</dd>
                </div>
              )}
              <div className="eq-tot-row">
                <dt>GST ({(ctx.taxRate * 100).toFixed(0)}%)</dt>
                <dd>{fmtMoney(ctx.taxAmount)}</dd>
              </div>
              <div className="eq-tot-row grand">
                <dt>Estimated total</dt>
                <dd>{fmtMoney(ctx.total)}</dd>
              </div>
              {isVisible(sv, 'deposit') && ctx.depositRequired && ctx.depositAmount > 0 && (
                <div className="eq-tot-row deposit">
                  <dt>Deposit due ({ctx.depositPct.toFixed(0)}%)</dt>
                  <dd>{fmtMoney(ctx.depositAmount)}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>

      {isVisible(sv, 'accept_block') && (
        <section className="eq-accept">
          <div>
            <EditableText
              as="div"
              field="accept_heading"
              value={ct.accept_heading || 'To accept this estimate'}
              onEdit={ctx.onFieldEdit}
              style={{ fontFamily: "'Fraunces',serif", fontStyle: 'italic', fontWeight: 400, fontSize: '24px', margin: '0 0 8px' }}
            />
            <EditableText
              as="div"
              multiline
              field="accept_body"
              value={ct.accept_body || 'Sign & date below, or reply to this email with "accepted". We\'ll send a deposit invoice and lock in your scheduling window.'}
              onEdit={ctx.onFieldEdit}
              style={{ fontFamily: "'Inter',sans-serif", fontSize: '11.5px', color: 'var(--muted)', marginBottom: '14px', lineHeight: 1.5 }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
              <div>
                <div className="eq-sig-line">{ctx.acceptedSignatureName || ''}</div>
                <div className="eq-sig-cap">
                  <span>Client signature</span>
                  <span>Print name</span>
                </div>
              </div>
              <div>
                <div className="eq-sig-line">{ctx.acceptedAt ? ctx.acceptedAt : ''}</div>
                <div className="eq-sig-cap">
                  <span>Date</span>
                </div>
              </div>
            </div>
          </div>
          <div>
            <EditableText
              as="div"
              field="issued_by_heading"
              value={ct.issued_by_heading || 'Issued by'}
              onEdit={ctx.onFieldEdit}
              style={{ fontFamily: "'Fraunces',serif", fontStyle: 'italic', fontWeight: 400, fontSize: '24px', margin: '0 0 8px' }}
            />
            <EditableText
              as="div"
              multiline
              field="issued_by_body"
              value={ct.issued_by_body || `${ctx.tenant.ownerName ?? ctx.tenant.name} will be your point of contact.`}
              onEdit={ctx.onFieldEdit}
              style={{ fontFamily: "'Inter',sans-serif", fontSize: '11.5px', color: 'var(--muted)', marginBottom: '14px', lineHeight: 1.5 }}
            />
            <div
              className="eq-sig-line"
              style={{ color: 'var(--accent)', fontFamily: "'Fraunces',serif", fontStyle: 'italic', fontSize: '26px' }}
            >
              {ctx.tenant.ownerName || ctx.tenant.name}
            </div>
            <div className="eq-sig-cap">
              <span>{ctx.tenant.name}</span>
              <span>{ctx.issuedDate}</span>
            </div>
          </div>
        </section>
      )}

      {(isVisible(sv, 'footer_quote') || isVisible(sv, 'footer_meta')) && (
        <footer className="eq-foot">
          {isVisible(sv, 'footer_quote') && (ct.footer_quote || ctx.onFieldEdit) && (
            <EditableText
              as="div"
              field="footer_quote"
              value={ct.footer_quote ?? ''}
              onEdit={ctx.onFieldEdit}
              placeholder='Add a footer note…'
              className="eq-foot-q"
            />
          )}
          {isVisible(sv, 'footer_meta') && (
            <div className="eq-foot-meta" style={{ marginLeft: 'auto' }}>
              <b>{ctx.tenant.name}</b>
              <br />
              {ctx.tenant.footerNote || [ctx.tenant.website, ctx.tenant.wcbNumber, ctx.tenant.insurance].filter(Boolean).join(' · ')}
            </div>
          )}
        </footer>
      )}
    </div>
  );
}
