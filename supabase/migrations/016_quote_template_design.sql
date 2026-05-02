-- 016_quote_template_design.sql
-- Quote template design system: pick one of four visual designs (editorial / technical / field / statement),
-- toggle sections per template, store overridable strings, mark one template as the company-wide default.

-- ═══════════════════════════════════════════
-- quote_templates: design picker + visibility + custom text + default flag
-- ═══════════════════════════════════════════
alter table public.quote_templates
  add column if not exists template_design text not null default 'editorial';

alter table public.quote_templates
  add column if not exists is_default boolean not null default false;

-- Section visibility per template (which blocks render in the chosen design).
-- Keys are advisory; renderers default to "show" for unknown keys to stay forward-compatible.
alter table public.quote_templates
  add column if not exists section_visibility jsonb not null default '{
    "header": true,
    "parties": true,
    "stats_banner": true,
    "scope_table": true,
    "terms": true,
    "summary": true,
    "deposit": true,
    "accept_block": true,
    "footer_quote": true,
    "footer_meta": true,
    "optional_addons": true
  }'::jsonb;

-- Free-text overrides for the chosen design's stock copy.
alter table public.quote_templates
  add column if not exists custom_text jsonb not null default '{}'::jsonb;

-- Constrain to known designs.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quote_templates_template_design_chk') then
    alter table public.quote_templates
      add constraint quote_templates_template_design_chk
      check (template_design in ('editorial','technical','field','statement'));
  end if;
end $$;

-- At most one default per tenant.
create unique index if not exists quote_templates_one_default_per_tenant_idx
  on public.quote_templates (tenant_id)
  where is_default = true;

-- ═══════════════════════════════════════════
-- quotes: snapshot the chosen design + template at create time
-- ═══════════════════════════════════════════
alter table public.quotes
  add column if not exists template_id uuid references public.quote_templates (id) on delete set null;

alter table public.quotes
  add column if not exists template_design text not null default 'editorial';

alter table public.quotes
  add column if not exists section_visibility jsonb not null default '{}'::jsonb;

alter table public.quotes
  add column if not exists custom_text jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotes_template_design_chk') then
    alter table public.quotes
      add constraint quotes_template_design_chk
      check (template_design in ('editorial','technical','field','statement'));
  end if;
end $$;

-- ═══════════════════════════════════════════
-- tenants: pointer to the default quote template
-- ═══════════════════════════════════════════
alter table public.tenants
  add column if not exists default_quote_template_id uuid references public.quote_templates (id) on delete set null;

-- ═══════════════════════════════════════════
-- Backfill: mark the seeded "Standard Hydroseeding" template (per tenant) as default if no default exists.
-- ═══════════════════════════════════════════
with picks as (
  select distinct on (tenant_id) id, tenant_id
    from public.quote_templates
   order by tenant_id, created_at asc
)
update public.quote_templates qt
   set is_default = true
  from picks p
 where qt.id = p.id
   and not exists (
     select 1 from public.quote_templates d
      where d.tenant_id = qt.tenant_id and d.is_default = true
   );

update public.tenants t
   set default_quote_template_id = qt.id
  from public.quote_templates qt
 where qt.tenant_id = t.id
   and qt.is_default = true
   and t.default_quote_template_id is null;

comment on column public.quote_templates.template_design is 'Visual design: editorial | technical | field | statement';
comment on column public.quote_templates.is_default is 'Exactly one template per tenant may be the default; unique partial index enforces it';
comment on column public.quote_templates.section_visibility is 'Per-template toggles for which blocks render';
comment on column public.quote_templates.custom_text is 'Per-template overrides for stock copy in the chosen design';
comment on column public.quotes.template_design is 'Snapshot of the design at create time so the look is locked even if the template changes';
comment on column public.quotes.section_visibility is 'Snapshot of section toggles at create time';
comment on column public.quotes.custom_text is 'Snapshot of custom text at create time';
