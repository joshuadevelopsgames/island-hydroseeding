import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Invoice, InvoiceLineItem, InvoicePayment } from '@/lib/invoicesTypes';

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

export function generateInvoicePdf(
  invoice: Invoice,
  lineItems: InvoiceLineItem[],
  payments: InvoicePayment[],
  account: { name: string; company: string | null; phone: string | null; email: string | null } | null,
  property: { address: string; city: string | null; province: string | null; postal_code: string | null } | null
): jsPDF {
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

  // Invoice badge on right side
  const rightX = pageW - margin - 60;
  doc.setTextColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', rightX, margin + 4);

  doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`#${String(invoice.invoice_number).padStart(4, '0')}`, rightX, margin + 10);

  // Horizontal rule
  y = margin + 14;
  doc.setDrawColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // CLIENT INFO SECTION
  const col1X = margin;
  const col2X = pageW / 2 + 5;

  // Left column: Bill To
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Bill To:', col1X, y);
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

  // Right column: Invoice Details (align to same height as left)
  let detailY = margin + 18 + 4;
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Invoice Details:', col2X, detailY);
  detailY += 4;

  doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Invoice #${String(invoice.invoice_number).padStart(4, '0')}`, col2X, detailY);
  detailY += 4;

  const issueDate = fmtDate(invoice.issue_date);
  doc.text(`Issue Date: ${issueDate}`, col2X, detailY);
  detailY += 4;

  const dueDate = fmtDate(invoice.due_date);
  doc.text(`Due Date: ${dueDate}`, col2X, detailY);
  detailY += 4;

  doc.setFont('helvetica', 'bold');
  doc.text(`Status: ${invoice.status}`, col2X, detailY);

  y += 20;

  // Ensure space for line items table
  if (y > pageH - 100) {
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
  doc.text(fmtCurrency(invoice.subtotal), pageW - margin - 2, y, { align: 'right' });
  y += 5;

  const taxRate = ((invoice.tax_rate ?? 0) * 100).toFixed(0);
  doc.text(`GST (${taxRate}%):`, summaryX, y);
  doc.text(fmtCurrency(invoice.tax_amount ?? 0), pageW - margin - 2, y, { align: 'right' });
  y += 5;

  // Total row with background
  doc.setFillColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.rect(summaryX - 2, y - 3, 52, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL:', summaryX, y + 0.5);
  doc.text(fmtCurrency(invoice.total), pageW - margin - 2, y + 0.5, { align: 'right' });
  y += 8;

  // Amount Paid and Balance Due
  y += 2;
  doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Amount Paid:', summaryX, y);
  doc.text(fmtCurrency(invoice.amount_paid), pageW - margin - 2, y, { align: 'right' });
  y += 5;

  // Balance Due - bold, larger
  doc.setFillColor(TABLE_ALT_ROW.r, TABLE_ALT_ROW.g, TABLE_ALT_ROW.b);
  doc.rect(summaryX - 2, y - 3, 52, 6, 'F');
  doc.setTextColor(BRAND_GREEN.r, BRAND_GREEN.g, BRAND_GREEN.b);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('BALANCE DUE:', summaryX, y + 0.5);
  doc.text(fmtCurrency(invoice.balance_due), pageW - margin - 2, y + 0.5, { align: 'right' });
  y += 8;

  // PAYMENTS SECTION (if any payments exist)
  if (payments.length > 0) {
    y += 4;
    if (y > pageH - 50) {
      doc.addPage();
      y = margin;
    }

    doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Payments', margin, y);
    y += 5;

    const paymentsData: (string | number)[][] = payments.map((payment) => [
      fmtDate(payment.payment_date),
      payment.payment_method ?? '—',
      fmtCurrency(payment.amount),
      payment.reference_number ?? '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Date', 'Method', 'Amount', 'Reference']],
      body: paymentsData,
      margin: { left: margin, right: margin, bottom: 15 },
      tableWidth: pageW - 2 * margin,
      styles: {
        fontSize: 8,
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
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [TABLE_ALT_ROW.r, TABLE_ALT_ROW.g, TABLE_ALT_ROW.b] as [number, number, number],
      },
      theme: 'grid' as const,
      columnStyles: {
        2: { halign: 'right' as const },
      },
    });

    y = (doc as DocWithTable).lastAutoTable?.finalY ?? y;
    y += 6;
  }

  // PAYMENT TERMS
  if (invoice.payment_terms) {
    y += 4;
    if (y > pageH - 40) {
      doc.addPage();
      y = margin;
    }

    doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const termsLines = doc.splitTextToSize(`Payment Terms: ${invoice.payment_terms}`, pageW - 2 * margin);
    doc.text(termsLines, margin, y);
    y += termsLines.length * 3.5 + 4;
  }

  // NOTES SECTION
  if (invoice.notes) {
    y += 2;
    if (y > pageH - 40) {
      doc.addPage();
      y = margin;
    }

    doc.setTextColor(BODY_TEXT.r, BODY_TEXT.g, BODY_TEXT.b);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const notesLines = doc.splitTextToSize(invoice.notes, pageW - 2 * margin);
    doc.text(notesLines, margin, y);
    y += notesLines.length * 3.5 + 4;
  }

  // FOOTER
  const footerY = pageH - 10;
  doc.setTextColor(MUTED_TEXT.r, MUTED_TEXT.g, MUTED_TEXT.b);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Thank you for your business!', pageW / 2, footerY, { align: 'center' });

  // Page number
  doc.setFontSize(7);
  doc.text(`Page ${String(doc.getNumberOfPages())}`, pageW / 2, footerY + 4, { align: 'center' });

  return doc;
}
