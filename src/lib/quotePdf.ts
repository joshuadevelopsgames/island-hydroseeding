import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Quote, QuoteLineItem } from '@/lib/quotesTypes';

// Brand colors for Island Hydroseeding
const BRAND_GREEN = { r: 45, g: 80, b: 22 }; // #2D5016
const BODY_TEXT = { r: 51, g: 51, b: 51 }; // #333333
const MUTED_TEXT = { r: 102, g: 102, b: 102 }; // #666666
const TABLE_BORDER = { r: 221, g: 221, b: 221 }; // #DDDDDD
const TABLE_ALT_ROW = { r: 249, g: 249, b: 249 }; // #F9F9F9

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
}

function fmtDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

export function generateQuotePdf(
  quote: Quote,
  lineItems: QuoteLineItem[],
  account: { name: string; company: string | null; phone: string | null; email: string | null } | null,
  property: { address: string; city: string | null; province: string | null; postal_code: string | null } | null
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  let y = margin;

  // HEADER AREA
  doc.setTextColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('ISLAND HYDROSEEDING LTD.', margin, y);
  y += 6;

  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Professional Hydroseeding & Site Restoration', margin, y);
  y += 2;

  // Quote badge on right side
  const rightX = pageW - margin - 60;
  doc.setTextColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('QUOTE', rightX, margin + 4);

  doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`#${String(quote.quote_number).padStart(5, '0')}`, rightX, margin + 10);

  // Horizontal rule
  y = margin + 14;
  doc.setDrawColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // CLIENT INFO SECTION
  const col1X = margin;
  const col2X = pageW / 2 + 5;

  // Left column: Prepared For
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Prepared For:', col1X, y);
  y += 4;

  doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  if (account) {
    doc.text(account.name, col1X, y);
    y += 4;

    if (account.company) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(account.company, col1X, y);
      y += 4;
    }
  }

  if (property) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(property.address, col1X, y);
    y += 4;

    let cityLine = '';
    if (property.city) cityLine += property.city;
    if (property.province) cityLine += (cityLine ? ', ' : '') + property.province;
    if (property.postal_code) cityLine += ' ' + property.postal_code;
    if (cityLine) {
      doc.text(cityLine, col1X, y);
      y += 4;
    }
  }

  // Right column: Quote Details (align to same height as left)
  let detailY = margin + 18 + 4;
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Quote Details:', col2X, detailY);
  detailY += 4;

  doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Quote #${String(quote.quote_number).padStart(5, '0')}`, col2X, detailY);
  detailY += 4;

  const quoteDate = fmtDate(quote.created_at);
  doc.text(`Date: ${quoteDate}`, col2X, detailY);
  detailY += 4;

  doc.text('Valid for: 30 days', col2X, detailY);
  detailY += 4;

  doc.setFont('helvetica', 'bold');
  doc.text(`Status: ${quote.status}`, col2X, detailY);

  y += 20;

  // INTRODUCTION SECTION
  if (quote.introduction) {
    doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const introLines = doc.splitTextToSize(quote.introduction, pageW - 2 * margin);
    doc.text(introLines, margin, y);
    y += introLines.length * 3.5 + 4;
  }

  // Ensure space for line items table
  if (y > pageH - 80) {
    doc.addPage();
    y = margin;
  }

  // LINE ITEMS TABLE
  const tableData: (string | number)[][] = lineItems.map((item) => [
    item.product_service_name + (item.description ? `\n${item.description}` : ''),
    String(item.quantity),
    fmtCurrency(item.unit_price),
    fmtCurrency(item.total),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Product / Service', 'Qty', 'Unit Price', 'Total']],
    body: tableData,
    margin: { left: margin, right: margin, bottom: 15 },
    tableWidth: pageW - 2 * margin,
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: [BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b] as [number, number, number],
      lineColor: [TABLE_BORDER.r, TABLE_BORDER.g, TABLE_BORDER.b] as [number, number, number],
      lineWidth: 0.3,
      overflow: 'linebreak' as const,
      valign: 'middle' as const,
    },
    headStyles: {
      fillColor: [BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b] as [number, number, number],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: {
      fillColor: [TABLE_ALT_ROW.r, TABLE_ALT_ROW.g, TABLE_ALT_ROW.b] as [number, number, number],
    },
    theme: 'grid' as const,
    columnStyles: {
      1: { halign: 'center' as const },
      2: { halign: 'right' as const },
      3: { halign: 'right' as const },
    },
  });

  y = (doc as DocWithTable).lastAutoTable?.finalY ?? y;
  y += 8;

  // Subtotal, Tax, Total section
  const summaryX = pageW - margin - 50;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
  doc.text('Subtotal:', summaryX, y);
  doc.text(fmtCurrency(quote.subtotal), pageW - margin - 2, y, { align: 'right' });
  y += 5;

  const taxRate = ((quote.tax_rate ?? 0) * 100).toFixed(0);
  doc.text(`GST (${taxRate}%):`, summaryX, y);
  doc.text(fmtCurrency(quote.tax_amount ?? 0), pageW - margin - 2, y, { align: 'right' });
  y += 5;

  // Total row with background
  doc.setFillColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.rect(summaryX - 2, y - 3, 52, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL:', summaryX, y + 0.5);
  doc.text(fmtCurrency(quote.total), pageW - margin - 2, y + 0.5, { align: 'right' });
  y += 8;

  // Deposit info if applicable
  if (quote.deposit_required && quote.deposit_amount) {
    y += 2;
    doc.setTextColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Deposit Required: ${fmtCurrency(quote.deposit_amount)}`, margin, y);
    y += 5;
  }

  // CONTRACT/DISCLAIMER SECTION
  if (quote.contract_disclaimer) {
    y += 4;
    if (y > pageH - 40) {
      doc.addPage();
      y = margin;
    }

    doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Terms & Conditions', margin, y);
    y += 5;

    doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const contractLines = doc.splitTextToSize(quote.contract_disclaimer, pageW - 2 * margin);
    doc.text(contractLines, margin, y);
    y += contractLines.length * 3 + 4;
  }

  // FOOTER
  const footerY = pageH - 10;
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Thank you for choosing Island Hydroseeding Ltd.', pageW / 2, footerY, { align: 'center' });

  // Page number
  doc.setFontSize(7);
  doc.text(`Page ${String(doc.getNumberOfPages())}`, pageW / 2, footerY + 4, { align: 'center' });

  // Generate filename
  const clientName = account?.name ? account.name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20) : 'Client';
  const filename = `Quote-${String(quote.quote_number).padStart(5, '0')}-${clientName}.pdf`;

  doc.save(filename);
}
