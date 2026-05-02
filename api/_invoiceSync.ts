import type { SupabaseClient } from '@supabase/supabase-js';
import { documentTotalsFromSubtotal, roundMoney, balancesMatch } from './_documentPricing';

const NOW_ISO = () => new Date().toISOString();

/**
 * Recompute invoice subtotal / tax_amount / total from line items,
 * amount_paid from payment rows, balance_due, and adjust status when fully paid or reopened.
 */
export async function syncInvoiceFinancials(db: SupabaseClient, invoiceId: string, tenantId: string) {
  const { data: lineItems, error: lineErr } = await db
    .from('invoice_line_items')
    .select('total')
    .eq('invoice_id', invoiceId)
    .eq('tenant_id', tenantId);

  if (lineErr) throw lineErr;

  const subtotalRaw = (lineItems ?? []).reduce((sum, row) => sum + Number(row.total ?? 0), 0);

  const { data: inv, error: invErr } = await db
    .from('invoices')
    .select('tax_rate, status')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single();

  if (invErr) throw invErr;

  const taxRate = Number(inv?.tax_rate ?? 0.05);
  const { subtotal, tax_amount, total } = documentTotalsFromSubtotal(subtotalRaw, taxRate);

  const { data: payments, error: payErr } = await db
    .from('invoice_payments')
    .select('amount')
    .eq('invoice_id', invoiceId)
    .eq('tenant_id', tenantId);

  if (payErr) throw payErr;

  const amountPaid = roundMoney((payments ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0));
  const balanceDue = Math.max(roundMoney(total - amountPaid), 0);

  const prevStatus = String(inv?.status ?? 'Draft');
  let status = prevStatus;
  if (balancesMatch(balanceDue, 0)) {
    status = 'Paid';
  } else if (status === 'Paid' && !balancesMatch(balanceDue, 0)) {
    status = 'Sent';
  }

  // Stamp paid_at on the Paid transition; clear it on reopen so the next
  // clear restamps cleanly. Lets Insights compute "avg time to paid" without
  // relying on updated_at as a proxy (which gets touched by unrelated edits).
  const updates: Record<string, unknown> = {
    subtotal,
    tax_amount,
    total,
    amount_paid: amountPaid,
    balance_due: balanceDue,
    status,
    updated_at: NOW_ISO(),
  };
  if (status === 'Paid' && prevStatus !== 'Paid') {
    updates.paid_at = NOW_ISO();
  } else if (status !== 'Paid' && prevStatus === 'Paid') {
    updates.paid_at = null;
  }

  const { error: updateErr } = await db
    .from('invoices')
    .update(updates)
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId);

  if (updateErr) throw updateErr;
}
