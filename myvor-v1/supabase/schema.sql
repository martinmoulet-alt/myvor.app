-- REFERENCE SNAPSHOT ONLY.
-- Production schema changes must be added as new timestamped files in supabase/migrations/.
-- Do not use this file as the deployment history for the live database.

create extension if not exists pgcrypto;

create table if not exists public.dossiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client text not null,
  title text not null,
  objective text not null,
  context text not null default '',
  watch_keywords text[] not null default '{}'::text[],
  watch_priority_phrases text[] not null default '{}'::text[],
  watch_excluded_keywords text[] not null default '{}'::text[],
  watch_rules_updated_at timestamptz not null default now(),
  status text not null default 'Actif',
  created_at timestamptz not null default now()
);

create table if not exists public.watch_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dossier_id uuid references public.dossiers(id) on delete set null,
  title text not null,
  nature text not null,
  source_url text not null,
  urgency text not null check (urgency in ('faible','moyen','fort','absolument urgent')),
  created_at timestamptz not null default now()
);

alter table public.dossiers enable row level security;
alter table public.watch_items enable row level security;

create policy "dossiers_select_own" on public.dossiers for select using (auth.uid() = user_id);
create policy "dossiers_insert_own" on public.dossiers for insert with check (auth.uid() = user_id);
create policy "dossiers_update_own" on public.dossiers for update using (auth.uid() = user_id);
create policy "dossiers_delete_own" on public.dossiers for delete using (auth.uid() = user_id);
create policy "watch_select_own" on public.watch_items for select using (auth.uid() = user_id);
create policy "watch_insert_own" on public.watch_items for insert with check (auth.uid() = user_id);
create policy "watch_update_own" on public.watch_items for update using (auth.uid() = user_id);
create policy "watch_delete_own" on public.watch_items for delete using (auth.uid() = user_id);

create index if not exists dossiers_watch_keywords_gin_idx
  on public.dossiers using gin (watch_keywords);

create or replace function public.touch_dossier_watch_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.watch_rules_updated_at := now();

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
