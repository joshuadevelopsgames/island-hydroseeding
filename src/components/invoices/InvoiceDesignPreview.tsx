import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import EditorialInvoiceDesign from './designs/EditorialInvoiceDesign';
import TechnicalInvoiceDesign from './designs/TechnicalInvoiceDesign';
import FieldInvoiceDesign from './designs/FieldInvoiceDesign';
import StatementInvoiceDesign from './designs/StatementInvoiceDesign';
import type { InvoiceDesignContext } from './designs/types';
import type { QuoteDesign } from '@/lib/quotesTypes';

type Props = {
  design: QuoteDesign;
  ctx: InvoiceDesignContext;
  /** Render Stripe pay sidebar to the right (used on the public /pay/:token view). */
  showPaySidebar?: boolean;
  paySidebarSlot?: ReactNode;
  autoFit?: boolean;
};

const renderers: Record<QuoteDesign, ComponentType<{ ctx: InvoiceDesignContext }>> = {
  editorial: EditorialInvoiceDesign,
  technical: TechnicalInvoiceDesign,
  field: FieldInvoiceDesign,
  statement: StatementInvoiceDesign,
};

export default function InvoiceDesignPreview({
  design,
  ctx,
  showPaySidebar = false,
  paySidebarSlot,
  autoFit = true,
}: Props) {
  const Design = renderers[design] ?? EditorialInvoiceDesign;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!autoFit) return;
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
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
      style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', width: '100%' }}
    >
      <div style={{ flex: '0 0 auto', width: 850 * scale, height: 'auto' }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 850 }}>
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
          {paySidebarSlot}
        </aside>
      )}
    </div>
  );
}
