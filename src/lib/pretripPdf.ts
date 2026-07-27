/**
 * Single-inspection PDF export for vehicle pre-trips.
 *
 * Produces a self-contained record a driver or an inspector can file: header,
 * unit details, every checklist answer grouped by section, defects, the
 * declaration, and the inspection photos embedded at the end.
 *
 * Photos live behind short-lived signed URLs, so they are fetched and inlined
 * at export time. A photo that cannot be fetched is noted in the PDF instead of
 * failing the whole export — an inspection record is worth more than a picture.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatInVancouver } from './vancouverTime';
import { groupChecklist, failedItems } from './pretripChecklist';
import type { Pretrip } from './pretripsRemote';

const BRAND_GREEN = { r: 45, g: 80, b: 22 }; // #2D5016
const BODY_TEXT = { r: 51, g: 51, b: 51 }; // #333333
const MUTED_TEXT = { r: 102, g: 102, b: 102 }; // #666666
const TABLE_BORDER = { r: 221, g: 221, b: 221 }; // #DDDDDD
const TABLE_ALT_ROW = { r: 249, g: 249, b: 249 }; // #F9F9F9
const FAIL_RED = { r: 185, g: 28, b: 28 }; // #B91C1C
const FAIL_BG = { r: 254, g: 226, b: 226 }; // #FEE2E2
const PASS_GREEN = { r: 22, g: 101, b: 52 }; // #166534

const DECLARATION =
  'I declare that the vehicle shown above has been inspected in accordance with the applicable requirements ' +
  'and any known issues have been noted above. Do not operate a vehicle and/or its contents if it is not safe to operate.';

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

/** Fetches a signed photo URL and inlines it as a data URL. Returns null on failure. */
async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Natural pixel dimensions of a data URL, used to preserve aspect ratio. */
function measureImage(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 4, h: img.naturalHeight || 3 });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = dataUrl;
  });
}

function imageFormat(dataUrl: string): 'JPEG' | 'PNG' | 'WEBP' {
  const head = dataUrl.slice(0, 30).toLowerCase();
  if (head.includes('image/png')) return 'PNG';
  if (head.includes('image/webp')) return 'WEBP';
  return 'JPEG';
}

const safeSegment = (value: string, fallback: string) => {
  const cleaned = value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return cleaned || fallback;
};

export function pretripPdfFilename(log: Pretrip): string {
  const unit = safeSegment(log.equipmentId || '', 'Unit');
  const day = formatInVancouver(log.date, 'yyyy-MM-dd');
  return `PreTrip-${log.type}-${unit}-${day}.pdf`;
}

export async function generatePretripPdf(log: Pretrip): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' }) as DocWithTable;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentW = pageW - 2 * margin;
  const footerReserve = 16;
  let y = margin;

  /** Adds a page when `needed` mm would not fit above the footer. */
  const ensureSpace = (needed: number) => {
    if (y + needed <= pageH - footerReserve) return;
    doc.addPage();
    y = margin;
  };

  // HEADER
  doc.setTextColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ISLAND HYDROSEEDING LTD.', margin, y);
  y += 5.5;

  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Daily vehicle pre-trip inspection — circle check', margin, y);

  doc.setTextColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.setFontSize(19);
  doc.setFont('helvetica', 'bold');
  doc.text(log.type.toUpperCase(), pageW - margin, margin + 2, { align: 'right' });
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('PRE-TRIP', pageW - margin, margin + 7, { align: 'right' });

  y = margin + 12;
  doc.setDrawColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  // STATUS BANNER
  const failed = failedItems(log.checklist);
  const isFail = log.status === 'Action Req';
  const bannerH = 9;
  if (isFail) {
    doc.setFillColor(FAIL_BG.r, FAIL_BG.g, FAIL_BG.b);
  } else {
    doc.setFillColor(232, 245, 233);
  }
  doc.rect(margin, y - 6, contentW, bannerH, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  if (isFail) {
    doc.setTextColor(FAIL_RED.r, FAIL_RED.g, FAIL_RED.b);
    const detail = failed.length
      ? `ACTION REQUIRED — ${failed.length} item${failed.length === 1 ? '' : 's'} failed`
      : 'ACTION REQUIRED';
    doc.text(detail, margin + 3, y);
  } else {
    doc.setTextColor(PASS_GREEN.r, PASS_GREEN.g, PASS_GREEN.b);
    doc.text('PASSED — no defects reported', margin + 3, y);
  }
  y += bannerH - 1;

  // DETAILS GRID (two columns of label / value pairs)
  const details: [string, string][] = [
    ['Date & time', formatInVancouver(log.date, 'PPpp')],
    ['Inspector / driver', log.employeeName || '—'],
    [log.type === 'Truck' ? 'Truck ID / unit' : 'Trailer ID / unit', log.equipmentId || '—'],
    ['Location of inspection', log.location || '—'],
  ];
  if (log.createdByEmail) details.push(['Submitted by', log.createdByEmail]);
  details.push(['Photos on file', String(log.photoCount)]);

  // Each row is a label line plus a value line; step the cursor by the full
  // row height so the pairs never print on top of each other.
  const colW = contentW / 2;
  const rowH = 11;
  y += 7;
  details.forEach(([label, value], i) => {
    const col = i % 2;
    if (col === 0) {
      if (i > 0) y += rowH;
      ensureSpace(rowH + 2);
    }
    const x = margin + col * colW;
    doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(label.toUpperCase(), x, y);
    doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    const valueLines = doc.splitTextToSize(value || '—', colW - 5) as string[];
    doc.text(valueLines[0] ?? '—', x, y + 4.5);
  });
  y += rowH + 3;

  // CHECKLIST — one table per section so a printed record reads like the form
  const sections = groupChecklist(log.checklist);
  for (const section of sections) {
    ensureSpace(20);
    autoTable(doc, {
      startY: y,
      head: [[section.title, 'Result']],
      body: section.items.map((item) => [item.label, item.value || '—']),
      margin: { left: margin, right: margin, top: margin, bottom: footerReserve },
      tableWidth: contentW,
      theme: 'grid' as const,
      styles: {
        fontSize: 8.5,
        cellPadding: 2,
        textColor: [BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b] as [number, number, number],
        lineColor: [TABLE_BORDER.r, TABLE_BORDER.g, TABLE_BORDER.b] as [number, number, number],
        lineWidth: 0.2,
        overflow: 'linebreak' as const,
        valign: 'middle' as const,
      },
      headStyles: {
        fillColor: [BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b] as [number, number, number],
        textColor: [255, 255, 255],
        fontStyle: 'bold' as const,
        fontSize: 9,
      },
      alternateRowStyles: {
        fillColor: [TABLE_ALT_ROW.r, TABLE_ALT_ROW.g, TABLE_ALT_ROW.b] as [number, number, number],
      },
      columnStyles: {
        0: { cellWidth: contentW - 34 },
        1: { cellWidth: 34, halign: 'center' as const, fontStyle: 'bold' as const },
      },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 1) return;
        const text = Array.isArray(data.cell.raw) ? data.cell.raw[0] : data.cell.raw;
        if (text === 'Fail') {
          data.cell.styles.textColor = [FAIL_RED.r, FAIL_RED.g, FAIL_RED.b];
          data.cell.styles.fillColor = [FAIL_BG.r, FAIL_BG.g, FAIL_BG.b];
        } else if (text === 'Pass') {
          data.cell.styles.textColor = [PASS_GREEN.r, PASS_GREEN.g, PASS_GREEN.b];
        } else if (text === 'N/A') {
          data.cell.styles.textColor = [MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b];
        }
      },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 5;
  }

  // DEFECTS / REMARKS
  const remarks = (log.remarks || '').trim() || 'No defects';
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const remarkLines = doc.splitTextToSize(remarks, contentW - 6) as string[];
  y += 3;
  ensureSpace(12 + remarkLines.length * 4);
  doc.setTextColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.text('Details of defects / remarks', margin, y);
  y += 5;
  doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(remarkLines, margin, y);
  y += remarkLines.length * 4 + 4;

  // DECLARATION + SIGN-OFF
  doc.setFontSize(8);
  const declLines = doc.splitTextToSize(DECLARATION, contentW - 6) as string[];
  ensureSpace(declLines.length * 3.4 + 22);
  doc.setDrawColor(TABLE_BORDER.r, TABLE_BORDER.g, TABLE_BORDER.b);
  doc.setLineWidth(0.2);
  doc.rect(margin, y - 3, contentW, declLines.length * 3.4 + 6);
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.text(declLines, margin + 3, y + 1);
  y += declLines.length * 3.4 + 10;

  doc.setDrawColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + 70, y);
  doc.line(pageW - margin - 55, y, pageW - margin, y);
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.text(`Inspector: ${log.employeeName || ''}`.trim(), margin, y + 4);
  doc.text(formatInVancouver(log.date, 'PP'), pageW - margin - 55, y + 4);
  y += 12;

  // PHOTOS — two per row, aspect preserved inside a fixed cell
  if (log.photoUrls.length > 0) {
    const gap = 6;
    const cellW = (contentW - gap) / 2;
    const cellH = 52;

    ensureSpace(cellH + 14);
    doc.setTextColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Inspection photos (${log.photoUrls.length})`, margin, y);
    y += 6;

    let missing = 0;
    for (let i = 0; i < log.photoUrls.length; i += 1) {
      const col = i % 2;
      if (col === 0) ensureSpace(cellH + 8);
      const x = margin + col * (cellW + gap);
      const dataUrl = await fetchAsDataUrl(log.photoUrls[i]);

      doc.setDrawColor(TABLE_BORDER.r, TABLE_BORDER.g, TABLE_BORDER.b);
      doc.setLineWidth(0.2);
      doc.rect(x, y, cellW, cellH);

      if (dataUrl) {
        const { w, h } = await measureImage(dataUrl);
        const scale = Math.min((cellW - 2) / w, (cellH - 2) / h);
        const drawW = w * scale;
        const drawH = h * scale;
        try {
          doc.addImage(
            dataUrl,
            imageFormat(dataUrl),
            x + (cellW - drawW) / 2,
            y + (cellH - drawH) / 2,
            drawW,
            drawH,
            undefined,
            'FAST'
          );
        } catch {
          missing += 1;
        }
      } else {
        missing += 1;
        doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('Photo unavailable', x + cellW / 2, y + cellH / 2, { align: 'center' });
      }

      doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`Photo ${i + 1} of ${log.photoUrls.length}`, x, y + cellH + 3.5);

      if (col === 1 || i === log.photoUrls.length - 1) y += cellH + 8;
    }

    if (missing > 0) {
      ensureSpace(8);
      doc.setTextColor(FAIL_RED.r, FAIL_RED.g, FAIL_RED.b);
      doc.setFontSize(8);
      doc.text(
        `${missing} photo${missing === 1 ? '' : 's'} could not be downloaded and ${missing === 1 ? 'is' : 'are'} missing from this export.`,
        margin,
        y
      );
    }
  }

  // FOOTER on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${log.type} pre-trip · ${log.equipmentId || 'Unit'} · ${formatInVancouver(log.date, 'PP p')}`,
      margin,
      pageH - 8
    );
    doc.text(`Page ${p} of ${pages}`, pageW - margin, pageH - 8, { align: 'right' });
  }

  return doc;
}

/** Builds the PDF and hands it to the browser as a download. */
export async function downloadPretripPdf(log: Pretrip): Promise<void> {
  const doc = await generatePretripPdf(log);
  doc.save(pretripPdfFilename(log));
}
