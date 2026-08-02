-- Myvor — automatisation de la veille
-- À exécuter une fois dans Supabase > SQL Editor.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

create table if not exists public.veille_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  auto_link_threshold numeric(4,3) not null default 0.900 check (auto_link_threshold between 0 and 1),
  review_threshold numeric(4,3) not null default 0.550 check (review_threshold between 0 and 1),
  last_run_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.veille_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('running','success','partial','error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sources_count integer not null default 0,
  fetched_count integer not null default 0,
  new_count integer not null default 0,
  auto_linked_count integer not null default 0,
  review_count integer not null default 0,
  actions_created_count integer not null default 0,
  engine text,
  message text
);

create index if not exists veille_runs_user_started_idx
  on public.veille_runs(user_id, started_at desc);

create index if not exists watch_items_user_source_idx
  on public.watch_items(user_id, source_url);

create index if not exists watch_items_user_dossier_idx
  on public.watch_items(user_id, dossier_id);

alter table public.veille_settings enable row level security;
alter table public.veille_runs enable row level security;

drop policy if exists "veille_settings_select_own" on public.veille_settings;
create policy "veille_settings_select_own"
  on public.veille_settings for select
  using (auth.uid() = user_id);

drop policy if exists "veille_settings_insert_own" on public.veille_settings;
create policy "veille_settings_insert_own"
  on public.veille_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "veille_settings_update_own" on public.veille_settings;
create policy "veille_settings_update_own"
  on public.veille_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "veille_runs_select_own" on public.veille_runs;
create policy "veille_runs_select_own"
  on public.veille_runs for select
  using (auth.uid() = user_id);

-- Une ligne de réglages est créée automatiquement dès qu'un utilisateur possède un dossier.
insert into public.veille_settings(user_id)
select distinct user_id from public.dossiers
on conflict (user_id) do nothing;

-- Crée les réglages au premier dossier d'un nouvel utilisateur.
create or replace function public.ensure_veille_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.veille_settings(user_id)
  values (new.user_id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists dossiers_ensure_veille_settings on public.dossiers;
create trigger dossiers_ensure_veille_settings
after insert on public.dossiers
for each row execute function public.ensure_veille_settings();
