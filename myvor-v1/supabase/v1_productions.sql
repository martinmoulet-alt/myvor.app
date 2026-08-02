-- LEGACY COMPATIBILITY SCRIPT.
-- New schema changes must go in supabase/migrations/.
-- This file remains safe to re-run and MUST NOT introduce permissive using(true) policies.

create table if not exists public.productions (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  type text not null check (type in ('impact','radar','builder')),
  title text not null,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists productions_dossier_created_idx
  on public.productions(dossier_id, created_at desc);

alter table public.productions enable row level security;

revoke all on table public.productions from anon;
grant select, insert, update, delete on table public.productions to authenticated;

drop policy if exists "productions authenticated select" on public.productions;
drop policy if exists "productions authenticated insert" on public.productions;
drop policy if exists "productions authenticated update" on public.productions;
drop policy if exists "productions authenticated delete" on public.productions;
drop policy if exists "productions_select_own_dossier" on public.productions;
drop policy if exists "productions_insert_own_dossier" on public.productions;
drop policy if exists "productions_update_own_dossier" on public.productions;
drop policy if exists "productions_delete_own_dossier" on public.productions;

create policy "productions_select_own_dossier"
on public.productions for select to authenticated
using (
  exists (
    select 1 from public.dossiers d
    where d.id = productions.dossier_id
      and d.user_id = auth.uid()
  )
);

create policy "productions_insert_own_dossier"
on public.productions for insert to authenticated
with check (
  exists (
    select 1 from public.dossiers d
    where d.id = productions.dossier_id
      and d.user_id = auth.uid()
  )
);

create policy "productions_update_own_dossier"
on public.productions for update to authenticated
using (
  exists (
    select 1 from public.dossiers d
    where d.id = productions.dossier_id
      and d.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.dossiers d
    where d.id = productions.dossier_id
      and d.user_id = auth.uid()
  )
);

create policy "productions_delete_own_dossier"
on public.productions for delete to authenticated
using (
  exists (
    select 1 from public.dossiers d
    where d.id = productions.dossier_id
      and d.user_id = auth.uid()
  )
);
