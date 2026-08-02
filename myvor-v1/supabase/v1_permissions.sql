-- LEGACY COMPATIBILITY SCRIPT.
-- New RLS changes must go in supabase/migrations/.
-- Canonical migration: migrations/20260802100000_secure_tenant_rls.sql
-- This file remains safe to re-run and MUST NOT introduce permissive using(true) policies.

begin;

alter table public.dossiers enable row level security;
alter table public.watch_items enable row level security;
alter table public.actions enable row level security;
alter table public.productions enable row level security;

revoke all on table public.dossiers from anon;
revoke all on table public.watch_items from anon;
revoke all on table public.actions from anon;
revoke all on table public.productions from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.dossiers to authenticated;
grant select, insert, update, delete on table public.watch_items to authenticated;
grant select, insert, update, delete on table public.actions to authenticated;
grant select, insert, update, delete on table public.productions to authenticated;

-- IMPORTANT : les policies PostgreSQL permissives sont combinées avec OR.
-- On supprime donc TOUTES les anciennes policies de ces tables avant de
-- reconstruire l'isolation par propriétaire.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('dossiers', 'watch_items', 'actions', 'productions')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

create policy "dossiers_select_own"
on public.dossiers
for select
to authenticated
using (auth.uid() = user_id);

create policy "dossiers_insert_own"
on public.dossiers
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "dossiers_update_own"
on public.dossiers
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "dossiers_delete_own"
on public.dossiers
for delete
to authenticated
using (auth.uid() = user_id);

create policy "watch_select_own"
on public.watch_items
for select
to authenticated
using (
  auth.uid() = user_id
  and (
    dossier_id is null
    or exists (
      select 1
      from public.dossiers d
      where d.id = watch_items.dossier_id
        and d.user_id = auth.uid()
    )
  )
);

create policy "watch_insert_own"
on public.watch_items
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    dossier_id is null
    or exists (
      select 1
      from public.dossiers d
      where d.id = watch_items.dossier_id
        and d.user_id = auth.uid()
    )
  )
);

create policy "watch_update_own"
on public.watch_items
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (
    dossier_id is null
    or exists (
      select 1
      from public.dossiers d
      where d.id = watch_items.dossier_id
        and d.user_id = auth.uid()
    )
  )
);

create policy "watch_delete_own"
on public.watch_items
for delete
to authenticated
using (auth.uid() = user_id);

create policy "actions_select_own_dossier"
on public.actions
for select
to authenticated
using (
  exists (
    select 1
    from public.dossiers d
    where d.id = actions.dossier_id
      and d.user_id = auth.uid()
  )
);

create policy "actions_insert_own_dossier"
on public.actions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.dossiers d
    where d.id = actions.dossier_id
      and d.user_id = auth.uid()
  )
);

create policy "actions_update_own_dossier"
on public.actions
for update
to authenticated
using (
  exists (
    select 1
    from public.dossiers d
    where d.id = actions.dossier_id
      and d.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.dossiers d
    where d.id = actions.dossier_id
      and d.user_id = auth.uid()
  )
);

create policy "actions_delete_own_dossier"
on public.actions
for delete
to authenticated
using (
  exists (
    select 1
    from public.dossiers d
    where d.id = actions.dossier_id
      and d.user_id = auth.uid()
  )
);

create policy "productions_select_own_dossier"
on public.productions
for select
to authenticated
using (
  exists (
    select 1
    from public.dossiers d
    where d.id = productions.dossier_id
      and d.user_id = auth.uid()
  )
);

create policy "productions_insert_own_dossier"
on public.productions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.dossiers d
    where d.id = productions.dossier_id
      and d.user_id = auth.uid()
  )
);

create policy "productions_update_own_dossier"
on public.productions
for update
to authenticated
using (
  exists (
    select 1
    from public.dossiers d
    where d.id = productions.dossier_id
      and d.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.dossiers d
    where d.id = productions.dossier_id
      and d.user_id = auth.uid()
  )
);

create policy "productions_delete_own_dossier"
on public.productions
for delete
to authenticated
using (
  exists (
    select 1
    from public.dossiers d
    where d.id = productions.dossier_id
      and d.user_id = auth.uid()
  )
);

commit;

select
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('dossiers', 'watch_items', 'actions', 'productions')
order by tablename, policyname;
