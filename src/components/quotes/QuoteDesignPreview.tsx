import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import EditorialQuoteDesign from './designs/EditorialQuoteDesign';
import TechnicalQuoteDesign from './designs/TechnicalQuoteDesign';
import FieldQuoteDesign from './designs/FieldQuoteDesign';
import StatementQuoteDesign from './designs/StatementQuoteDesign';
import type { DesignContext } from './designs/types';
import type { QuoteDesign } from '@/lib/quotesTypes';

type Props = {
  design: QuoteDesign;
  ctx: DesignContext;
  /** When true, render a Stripe-pay sidebar slot to the right of the quote (Jobber-style). */
  showPaySidebar?: boolean;
  paySidebarSlot?: ReactNode;
  /** Auto-scale the 850px design to fit the container. Default true. */
  autoFit?: boolean;
};

const renderers: Record<QuoteDesign, ComponentType<{ ctx: DesignContext }>> = {
  editorial: EditorialQuoteDesign,
  technical: TechnicalQuoteDesign,
  field: FieldQuoteDesign,
  statement: StatementQuoteDesign,
};

export default function QuoteDesignPreview({
  design,
  ctx,
  showPaySidebar = false,
  paySidebarSlot,
  autoFit = true,
}: Props) {
  const Design = renderers[design] ?? EditorialQuoteDesign;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // The 4 designs are pixel-pinned to 850px wide. Scale them to fit the container.
  useEffect(() => {
    if (!autoFit) return;
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      // Reserve sidebar width when shown (320 + 24 gap).
      const sidebarReserve = showPaySidebar ? 344 : 0;
      const available = Math.max(0, w - sidebarReserve);
      const next = Math.min(1, available / 850);
      setScale(Number.isFinite(next) && next > 0 ? next : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoFit, showPaySidebar]);

  return (
    <div
      ref={wrapRef}
      style={{
        display: 'flex',
        gap: '24px',
        alignItems: 'flex-start',
        width: '100%',
      }}
    >
      <div
        style={{
          flex: '0 0 auto',
          width: 850 * scale,
          height: 'auto',
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: 850,
          }}
        >
          <Design ctx={ctx} />
        </div>
      </div>

      {showPaySidebar && (
        <aside
          style={{
            flex: '0 0 320px',
            position: 'sticky',
            top: '24px',
            background: 'var(--surface-color, #fff)',
            border: '1px solid var(--border-color, #e5e5e5)',
            borderRadius: '8px',
            padding: '20px',
          }}
        >
          {paySidebarSlot ?? <DefaultPaySidebar ctx={ctx} />}
        </aside>
      )}
    </div>
  );
}

function DefaultPaySidebar({ ctx }: { ctx: DesignContext }) {
  const fmt = (n: number) =>
    '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div>
      <h3 style={{ margin: 0, fontSize: '14px', letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--text-muted, #666)' }}>
        Pay deposit
      </h3>
      <div style={{ marginTop: '8px', fontSize: '32px', fontWeight: 600, color: 'var(--primary-green, #2a7a3a)', lineHeight: 1.1 }}>
        {ctx.depositRequired && ctx.depositAmount > 0 ? fmt(ctx.depositAmount) : fmt(ctx.total)}
      </div>
      <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-muted, #666)', lineHeight: 1.5 }}>
        {ctx.depositRequired
          ? `${ctx.depositPct.toFixed(0)}% deposit due to confirm scheduling. Balance net 21 days from completion.`
          : 'Pay the full estimate now to lock in your scheduling window.'}
      </p>
      <button
        type="button"
        disabled
        title="Stripe payment integration — coming soon"
        style={{
          marginTop: '16px',
          width: '100%',
          padding: '12px 16px',
          background: 'var(--primary-green, #2a7a3a)',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          fontWeight: 600,
          fontSize: '14px',
          cursor: 'not-allowed',
          opacity: 0.7,
        }}
      >
        Pay with card (Stripe)
      </button>
      <div
        style={{
          marginTop: '12px',
          fontSize: '11px',
          color: 'var(--text-muted, #888)',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          textAlign: 'center',
        }}
      >
        Powered by Stripe · secure
      </div>
      <hr style={{ margin: '16px 0', border: 0, borderTop: '1px solid var(--border-color, #eee)' }} />
      <details style={{ fontSize: '12px', color: 'var(--text-muted, #666)' }}>
        <summary style={{ cursor: 'pointer' }}>Other ways to pay</summary>
        <p style={{ margin: '8px 0 0' }}>
          Reply to this quote with "accepted" and we'll send a deposit invoice with e-transfer instructions.
        </p>
      </details>
    </div>
  );
}
