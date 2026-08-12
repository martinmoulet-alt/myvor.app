alter table public.watch_items
  add column if not exists link_justification jsonb,
  add column if not exists link_justification_engine text,
  add column if not exists link_justified_at timestamptz;

comment on column public.watch_items.link_justification is 'Structured explanation of why a watch item is linked or suggested to a dossier.';
comment on column public.watch_items.link_justification_engine is 'Engine/version that produced the structured link justification.';
comment on column public.watch_items.link_justified_at is 'Timestamp when the link justification was last generated.';
