create extension if not exists pgcrypto;

create table if not exists public.dossiers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client text not null,
  title text not null,
  objective text not null,
  context text not null default '',
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
