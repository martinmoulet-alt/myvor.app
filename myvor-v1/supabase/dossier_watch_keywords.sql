-- MYVOR — Mots-clés de veille par dossier
-- À exécuter une fois dans Supabase SQL Editor sur un projet existant.

alter table public.dossiers
  add column if not exists watch_keywords text[] not null default '{}'::text[],
  add column if not exists watch_priority_phrases text[] not null default '{}'::text[],
  add column if not exists watch_excluded_keywords text[] not null default '{}'::text[],
  add column if not exists watch_rules_updated_at timestamptz not null default now();

comment on column public.dossiers.watch_keywords is 'Mots-clés métier utilisés en priorité pour rattacher la veille au dossier.';
comment on column public.dossiers.watch_priority_phrases is 'Expressions dont la présence constitue un signal fort de rattachement au dossier.';
comment on column public.dossiers.watch_excluded_keywords is 'Mots ou expressions qui empêchent un rattachement automatique au dossier.';
comment on column public.dossiers.watch_rules_updated_at is 'Date de dernière modification des règles de rattachement de veille.';

create index if not exists dossiers_watch_keywords_gin_idx
  on public.dossiers using gin (watch_keywords);

create or replace function public.touch_dossier_watch_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.watch_rules_updated_at := now();

  -- Les règles ont changé : les publications encore non rattachées
  -- doivent pouvoir être réévaluées au prochain passage du moteur.
  update public.watch_items
  set
    suggested_dossier_id = null,
    qualification_confidence = null,
    qualification_reason = null,
    qualified_at = null
  where user_id = new.user_id
    and dossier_id is null;

  return new;
end;
$$;

drop trigger if exists dossiers_touch_watch_rules on public.dossiers;
create trigger dossiers_touch_watch_rules
before update of watch_keywords, watch_priority_phrases, watch_excluded_keywords
on public.dossiers
for each row
execute function public.touch_dossier_watch_rules();
