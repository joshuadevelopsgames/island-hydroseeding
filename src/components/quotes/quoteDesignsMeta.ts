import type { QuoteDesign } from '@/lib/quotesTypes';

export type DesignMeta = {
  id: QuoteDesign;
  label: string;
  blurb: string;
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
