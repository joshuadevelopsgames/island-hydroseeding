-- 017_invoice_template_design.sql
-- Invoice design system: pick one of four visual designs (editorial / technical / field / statement),
-- toggle sections per invoice, store overridable strings. Mirrors the quote design system from 016.
-- We don't add an invoice_templates table — invoices are usually created from jobs/quotes, so the
-- design is picked per-invoice. The company default design is read from the default quote template
-- (same visual brand applies to both document types).

alter table public.invoices
  add column if not exists template_design text not null default 'editorial';

alter table public.invoices
  add column if not exists section_visibility jsonb not null default '{}'::jsonb;

alter table public.invoices
  add column if not exists custom_text jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_template_design_chk') then
    alter table public.invoices
      add constraint invoices_template_design_chk
      check (template_design in ('editorial','technical','field','statement'));
  end if;
end $$;

comment on column public.invoices.template_design is 'Visual design: editorial | technical | field | statement (matches quote_templates.template_design)';
comment on column public.invoices.section_visibility is 'Per-invoice toggles for which blocks render in the chosen design';
comment on column public.invoices.custom_text is 'Per-invoice overrides for stock copy in the chosen design';
