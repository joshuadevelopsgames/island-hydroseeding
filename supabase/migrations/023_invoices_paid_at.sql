-- 023_invoices_paid_at.sql
-- Track when an invoice transitioned to fully paid. Insights' "average time to
-- paid" was using updated_at as a proxy, which gets touched on any unrelated
-- edit (notes, line items, attachments). paid_at flips exactly once when the
-- balance reaches zero, and back to NULL if the invoice is reopened.

alter table public.invoices
  add column if not exists paid_at timestamptz;

create index if not exists invoices_paid_at_idx
  on public.invoices (tenant_id, paid_at)
  where paid_at is not null;

-- Backfill: for invoices already marked Paid, use updated_at as a best guess.
-- Future rows will be set precisely by syncInvoiceFinancials() the moment the
-- last payment clears the balance.
update public.invoices
   set paid_at = updated_at
 where status = 'Paid'
   and paid_at is null;

comment on column public.invoices.paid_at is
  'Timestamp the invoice was first fully paid. NULL while there is still a balance. Reset to NULL if reopened.';
