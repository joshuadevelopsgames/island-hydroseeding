/**
 * XLSX export helpers — built on SheetJS (already a project dependency).
 *
 * `downloadXlsx` writes a single-sheet workbook from rows of objects.
 * `downloadXlsxWorkbook` writes a multi-sheet workbook — used by the
 * Insights "Export view" button so the user gets one file with one sheet
 * per dashboard section.
 */

import * as XLSX from 'xlsx';

export type SheetSpec = {
  name: string;
  /** Column headers in the order they should appear. */
  headers: string[];
  /** Rows in the same column order as headers. Strings, numbers, or null. */
  rows: (string | number | null | undefined)[][];
};

function trimSheetName(name: string): string {
  // Excel sheet names are limited to 31 chars and can't contain : \ / ? * [ ]
  return name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Sheet';
}

function buildSheet(spec: SheetSpec): XLSX.WorkSheet {
  const aoa: (string | number | null | undefined)[][] = [spec.headers, ...spec.rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Auto column widths: the longer of header or longest cell value, capped to 60.
  const colCount = spec.headers.length;
  const widths: { wch: number }[] = [];
  for (let c = 0; c < colCount; c++) {
    let max = String(spec.headers[c] ?? '').length;
    for (const r of spec.rows) {
      const v = r[c];
      const len = v == null ? 0 : String(v).length;
      if (len > max) max = len;
    }
    widths.push({ wch: Math.min(60, Math.max(8, max + 2)) });
  }
  ws['!cols'] = widths;
  return ws;
}

/** Single-sheet workbook (the common case for one report). */
export function downloadXlsx(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const wb = XLSX.utils.book_new();
  const ws = buildSheet({ name: 'Sheet1', headers, rows });
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/** Multi-sheet workbook — one tab per SheetSpec. Used by Insights export. */
export function downloadXlsxWorkbook(filename: string, sheets: SheetSpec[]): void {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = buildSheet(s);
    XLSX.utils.book_append_sheet(wb, ws, trimSheetName(s.name));
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/** Convert an array of objects to a [headers, rows] tuple. Handy for ad-hoc exports. */
export function tableFromObjects<T extends Record<string, unknown>>(
  rows: T[],
  headerOrder: { key: keyof T; label: string }[]
): { headers: string[]; rows: (string | number | null)[][] } {
  return {
    headers: headerOrder.map((h) => h.label),
    rows: rows.map((r) =>
      headerOrder.map((h) => {
        const v = r[h.key];
        if (v == null) return null;
        if (typeof v === 'number') return v;
        return String(v);
      })
    ),
  };
}
