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

DROP POLICY IF EXISTS "productions authenticated select" ON public.productions;
DROP POLICY IF EXISTS "productions authenticated insert" ON public.productions;
DROP POLICY IF EXISTS "productions authenticated update" ON public.productions;
DROP POLICY IF EXISTS "productions authenticated delete" ON public.productions;

create policy "productions authenticated select"
  on public.productions for select
  to authenticated
  using (true);

create policy "productions authenticated insert"
  on public.productions for insert
  to authenticated
  with check (true);

create policy "productions authenticated update"
  on public.productions for update
  to authenticated
  using (true)
  with check (true);

create policy "productions authenticated delete"
  on public.productions for delete
  to authenticated
  using (true);
