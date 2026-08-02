-- MYVOR — Mots-clés de veille par dossier
-- À exécuter une fois dans Supabase SQL Editor sur un projet existant.

alter table public.dossiers
  add column if not exists watch_keywords text[] not null default '{}'::text[],
  add column if not exists watch_priority_phrases text[] not null default '{}'::text[],
  add column if not exists watch_excluded_keywords text[] not null default '{}'::text[];

comment on column public.dossiers.watch_keywords is 'Mots-clés métier utilisés en priorité pour rattacher la veille au dossier.';
comment on column public.dossiers.watch_priority_phrases is 'Expressions dont la présence constitue un signal fort de rattachement au dossier.';
comment on column public.dossiers.watch_excluded_keywords is 'Mots ou expressions qui empêchent un rattachement automatique au dossier.';

create index if not exists dossiers_watch_keywords_gin_idx
  on public.dossiers using gin (watch_keywords);
