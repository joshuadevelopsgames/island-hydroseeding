import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportAllLocalData, EXPORT_KEYS } from './fleetStore';
import { formatInVancouver } from './vancouverTime';

const BRAND = { r: 178, g: 52, b: 56 };
const BG = { r: 246, g: 244, b: 244 };
const TEXT = { r: 26, g: 26, b: 26 };
const MUTED = { r: 92, g: 101, b: 112 };
const BORDER = { r: 230, g: 228, b: 228 };
const HEADER_TINT = { r: 253, g: 234, b: 234 };

function sanitizeCell(v: unknown): string | number | boolean {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v;
  let s: string;
  if (typeof v === 'object') {
    try {
      s = JSON.stringify(v);
    } catch {
      s = String(v);
    }
  } else {
    s = String(v);
  }
  if (/^data:/i.test(s) && s.length > 120) return '[file data omitted]';
  if (s.length > 8000) return `${s.slice(0, 500)}… [truncated]`;
  return s;
}

function flattenRow(row: object): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  const walk = (obj: object, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
        walk(v as object, key);
      } else if (Array.isArray(v)) {
        out[key] = sanitizeCell(v) as string | number | boolean;
      } else {
        out[key] = sanitizeCell(v) as string | number | boolean;
      }
    }
  };
  walk(row, '');
  return out;
}

function uniqueSheetNames(): (base: string) => string {
  const used = new Set<string>();
  return (base: string) => {
    let s = base.replace(/[:\\/?*[\]]/g, '_').replace(/'/g, '').trim() || 'Data';
    if (s.length > 31) s = s.slice(0, 31);
    let candidate = s;
    let n = 2;
    while (used.has(candidate)) {
      const suf = `_${n++}`;
      candidate = (s.slice(0, Math.max(1, 31 - suf.length)) + suf).slice(0, 31);
    }
    used.add(candidate);
    return candidate;
  };
}

/** Spreadsheet — one tab per workspace key (labeled “Sheet” in UI). */
export function downloadWorkspaceSheet(): void {
  const data = exportAllLocalData();
  const wb = XLSX.utils.book_new();
  const nextName = uniqueSheetNames();

  const infoRows = [
    ['Workspace export', 'Island Hydroseeding — Internal ops'],
    ['Generated', String(data.exportedAt ?? '')],
    ['Keys included', EXPORT_KEYS.join(', ')],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(infoRows), nextName('Export_info'));

  for (const key of EXPORT_KEYS) {
    const raw = data[key as keyof typeof data];
    const name = nextName(key.slice(0, 31));

    if (raw === undefined || raw === null) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[`(no data for ${key})`]]), name);
      continue;
    }

    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['(empty)']]), name);
        continue;
      }
      const rows = raw.map((item) =>
        typeof item === 'object' && item !== null ? flattenRow(item as object) : { value: sanitizeCell(item) }
      );
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
      continue;
    }

    if (typeof raw === 'object') {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([flattenRow(raw as object)]), name);
      continue;
    }

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[String(key), sanitizeCell(raw)]]), name);
  }

  const stamp = formatInVancouver(new Date(), 'yyyy-MM-dd');
  XLSX.writeFile(wb, `ih-ops-export-${stamp}.xlsx`);
}

type Row = (string | number)[][];

function tableFromArray(arr: unknown[]): { head: string[]; body: Row } | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const sample = arr.find(
    (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
  ) as Record<string, unknown> | undefined;
  if (!sample) {
    const body: Row = arr.map((row, i) => [i + 1, String(sanitizeCell(row))]);
    return { head: ['#', 'Value'], body };
  }
  const keys = Object.keys(sample);
  if (keys.length === 0) return null;
  const head = keys.map((k) => k.slice(0, 48));
  const body: Row = arr.map((item) => {
    const o = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    return keys.map((k) => String(sanitizeCell(o[k] ?? '')));
  });
  return { head, body };
}

function drawPageCanvas(doc: jsPDF, pageW: number, pageH: number, variant: 'cover' | 'inner') {
  doc.setFillColor(BG.r, BG.g, BG.b);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  if (variant === 'cover') {
    doc.rect(0, 0, pageW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Island Hydroseeding Ltd', 14, 11);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Internal ops · Workspace export', 14, 16);
  } else {
    doc.rect(0, 0, pageW, 6, 'F');
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Island Hydroseeding — Internal ops', 14, 4.5);
  }
}

function paintContinuationPage(doc: jsPDF, pageW: number, pageH: number) {
  doc.setFillColor(BG.r, BG.g, BG.b);
  doc.rect(0, 0, pageW, pageH, 'F');
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, 0, pageW, 6, 'F');
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Island Hydroseeding — Internal ops', 14, 4.5);
}

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

function tableOpts(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  y: number,
  innerPad: number,
  margin: number,
  head: string[],
  body: Row
) {
  return {
    startY: y,
    head: [head],
    body,
    margin: { left: innerPad, right: margin, bottom: 14 },
    tableWidth: pageW - innerPad - margin,
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      textColor: [TEXT.r, TEXT.g, TEXT.b] as [number, number, number],
      lineColor: [BORDER.r, BORDER.g, BORDER.b] as [number, number, number],
      lineWidth: 0.05,
    },
    headStyles: {
      fillColor: [BRAND.r, BRAND.g, BRAND.b] as [number, number, number],
      textColor: 255,
      fontStyle: 'bold' as const,
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: [252, 250, 250] as [number, number, number] },
    theme: 'plain' as const,
    willDrawPage: (hook: { pageNumber: number }) => {
      if (hook.pageNumber > 1) {
        paintContinuationPage(doc, pageW, pageH);
      }
    },
  };
}

/** PDF styled to match the app (brand #b23438, gray #f6f4f4, card headers). */
export function downloadWorkspacePdf(): void {
  const data = exportAllLocalData();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 22;

  drawPageCanvas(doc, pageW, pageH, 'cover');
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated ${formatInVancouver(new Date(), 'MMM d, yyyy · HH:mm')} (Pacific)`, 14, y);
  y = 28;

  const ensureSpace = (need: number) => {
    if (y + need > pageH - 18) {
      doc.addPage();
      drawPageCanvas(doc, pageW, pageH, 'inner');
      y = 14;
    }
  };

  for (const key of EXPORT_KEYS) {
    const raw = data[key as keyof typeof data];
    if (raw === undefined || raw === null) continue;

    ensureSpace(30);

    doc.setFillColor(HEADER_TINT.r, HEADER_TINT.g, HEADER_TINT.b);
    doc.roundedRect(margin, y, pageW - 2 * margin, 8, 1.2, 1.2, 'F');
    doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
    doc.setLineWidth(0.9);
    doc.line(margin, y, margin, y + 8);

    doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(key.replace(/_/g, ' '), margin + 3, y + 5.2);
    y += 10;

    const innerPad = margin + 3;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(TEXT.r, TEXT.g, TEXT.b);

    if (Array.isArray(raw)) {
      const tbl = tableFromArray(raw);
      if (!tbl) {
        doc.setFontSize(8);
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        doc.text('(empty)', innerPad, y + 4);
        y += 12;
      } else {
        autoTable(doc, tableOpts(doc, pageW, pageH, y, innerPad, margin, tbl.head, tbl.body));
        y = (doc as DocWithTable).lastAutoTable?.finalY ?? y;
        y += 8;
      }
    } else if (typeof raw === 'object') {
      const flat = flattenRow(raw as object);
      const rows: Row = Object.entries(flat).map(([k, v]) => [k, String(v)]);
      autoTable(
        doc,
        tableOpts(doc, pageW, pageH, y, innerPad, margin, ['Field', 'Value'], rows)
      );
      y = (doc as DocWithTable).lastAutoTable?.finalY ?? y;
      y += 8;
    } else {
      doc.setFontSize(8);
      doc.text(String(sanitizeCell(raw)), innerPad, y + 4);
      y += 14;
    }
  }

  const stamp = formatInVancouver(new Date(), 'yyyy-MM-dd');
  doc.save(`ih-ops-export-${stamp}.pdf`);
}
