import { Star } from 'lucide-react';
import type { QuoteDesign } from '@/lib/quotesTypes';
import { QUOTE_DESIGNS } from '@/lib/quotesTypes';

export type DesignMeta = {
  id: QuoteDesign;
  label: string;
  blurb: string;
  // Tiny preview swatch (palette + serif/mono indicator).
  swatch: { paper: string; ink: string; accent: string; font: 'serif' | 'mono' | 'sans' };
};

export const DESIGN_META: DesignMeta[] = [
  {
    id: 'editorial',
    label: 'Editorial & Earthy',
    blurb: 'Warm cream paper, serif headlines, magazine-style layout.',
    swatch: { paper: '#f4ede1', ink: '#1a1612', accent: '#b03337', font: 'serif' },
  },
  {
    id: 'technical',
    label: 'Technical & Bold',
    blurb: 'Grid background, monospace, document-control vibe.',
    swatch: { paper: '#f6f5f2', ink: '#14130f', accent: '#b03337', font: 'mono' },
  },
  {
    id: 'field',
    label: 'Field Journal',
    blurb: 'Field-notebook aesthetic, italic serif, hand-stamped feel.',
    swatch: { paper: '#f7f1e1', ink: '#2b2418', accent: '#b03337', font: 'serif' },
  },
  {
    id: 'statement',
    label: 'Statement / Bright',
    blurb: 'Bold red side rail, sans-serif, bank-statement structure.',
    swatch: { paper: '#f5f1e8', ink: '#1a1612', accent: '#b03337', font: 'sans' },
  },
];

type Props = {
  value: QuoteDesign;
  onChange: (next: QuoteDesign) => void;
  defaultDesign?: QuoteDesign;
  onSetDefault?: (next: QuoteDesign) => void;
};

export default function QuoteDesignPicker({ value, onChange, defaultDesign, onSetDefault }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px',
      }}
    >
      {DESIGN_META.map((d) => {
        const selected = value === d.id;
        const isDefault = defaultDesign === d.id;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onChange(d.id)}
            aria-pressed={selected}
            style={{
              textAlign: 'left',
              cursor: 'pointer',
              padding: 0,
              background: 'transparent',
              border: selected ? '2px solid var(--primary-green, #2a7a3a)' : '2px solid var(--border-color, #ddd)',
              borderRadius: '10px',
              overflow: 'hidden',
              transition: 'transform .12s, border-color .12s',
              transform: selected ? 'translateY(-2px)' : 'none',
            }}
          >
            <Swatch design={d} />
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <strong style={{ fontSize: '14px' }}>{d.label}</strong>
                {QUOTE_DESIGNS.includes(d.id) && onSetDefault && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetDefault(d.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        onSetDefault(d.id);
                      }
                    }}
                    title={isDefault ? 'Default for company' : 'Set as default for company'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      background: isDefault ? 'rgba(176, 51, 55, 0.08)' : 'transparent',
                      color: isDefault ? '#b03337' : 'var(--text-muted, #888)',
                      border: `1px solid ${isDefault ? '#b03337' : 'var(--border-color, #ddd)'}`,
                    }}
                  >
                    <Star size={12} fill={isDefault ? '#b03337' : 'transparent'} />
                    {isDefault ? 'Default' : 'Set default'}
                  </span>
                )}
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted, #666)', lineHeight: 1.4 }}>
                {d.blurb}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Swatch({ design }: { design: DesignMeta }) {
  const { paper, ink, accent, font } = design.swatch;
  const fontFamily =
    font === 'mono'
      ? "'JetBrains Mono', monospace"
      : font === 'serif'
      ? "'Fraunces', Georgia, serif"
      : "'Inter', sans-serif";

  if (design.id === 'statement') {
    // Show the side-rail variant
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', height: '110px' }}>
        <div style={{ background: accent }} />
        <div style={{ background: paper, padding: '10px 12px', fontFamily, color: ink }}>
          <div style={{ fontSize: '8px', letterSpacing: '2px', color: accent, textTransform: 'uppercase' }}>
            Quote · CAD
          </div>
          <div style={{ fontSize: '20px', fontWeight: 300, marginTop: '4px' }}>
            No. <em style={{ color: accent }}>Q · 118</em>
          </div>
          <div style={{ marginTop: '8px', height: '4px', background: ink, opacity: 0.08, borderRadius: '2px' }} />
          <div style={{ marginTop: '4px', height: '4px', background: ink, opacity: 0.08, borderRadius: '2px', width: '80%' }} />
        </div>
      </div>
    );
  }

  if (design.id === 'technical') {
    return (
      <div
        style={{
          height: '110px',
          background: paper,
          backgroundImage: `linear-gradient(to right, rgba(0,0,0,.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.06) 1px, transparent 1px)`,
          backgroundSize: '12px 12px',
          padding: '10px 12px',
          fontFamily,
          color: ink,
          position: 'relative',
        }}
      >
        <div style={{ background: ink, color: paper, padding: '3px 8px', fontSize: '8px', letterSpacing: '1.5px', display: 'inline-block' }}>
          DOC · QTE-118
        </div>
        <div style={{ marginTop: '8px', fontSize: '24px', fontWeight: 700, letterSpacing: '-1px' }}>№Q-118</div>
        <div style={{ position: 'absolute', bottom: '8px', right: '12px', background: accent, color: paper, padding: '3px 8px', fontSize: '8px', letterSpacing: '1.5px' }}>
          VALID 30D
        </div>
      </div>
    );
  }

  if (design.id === 'field') {
    return (
      <div
        style={{
          height: '110px',
          background: paper,
          padding: '10px 12px',
          fontFamily,
          color: ink,
          backgroundImage: `radial-gradient(circle at 20% 30%, rgba(91,79,58,.08) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(91,79,58,.1) 0, transparent 50%)`,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              border: `1.5px solid ${ink}`,
              display: 'grid',
              placeItems: 'center',
              fontStyle: 'italic',
              fontSize: '18px',
            }}
          >
            S
          </div>
          <div>
            <div style={{ fontSize: '14px', fontStyle: 'italic' }}>
              Salish <span style={{ color: accent }}>Hydroseed</span>
            </div>
            <div style={{ fontSize: '8px', letterSpacing: '1.5px', textTransform: 'uppercase', color: ink, opacity: 0.6 }}>
              Field Journal style
            </div>
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            transform: 'rotate(8deg)',
            border: `2px solid ${accent}`,
            color: accent,
            padding: '2px 6px',
            fontSize: '8px',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Estimate
        </div>
      </div>
    );
  }

  // Editorial
  return (
    <div style={{ height: '110px', background: paper, padding: '10px 12px', fontFamily, color: ink, position: 'relative' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: accent,
            color: paper,
            display: 'grid',
            placeItems: 'center',
            fontStyle: 'italic',
            fontSize: '18px',
          }}
        >
          h
        </div>
        <div style={{ fontSize: '13px', fontWeight: 500 }}>
          Salish <em style={{ color: accent, fontStyle: 'italic' }}>Hydroseed</em>
        </div>
      </div>
      <div style={{ marginTop: '14px', fontSize: '24px', fontWeight: 300, letterSpacing: '-1px' }}>
        Quote <em style={{ color: accent, fontStyle: 'italic' }}>№ Q-118</em>
      </div>
      <div style={{ marginTop: '6px', height: '1px', background: ink }} />
    </div>
  );
}
