-- Myvor security checkpoint — enforce strict per-user isolation on V1 business data.
-- Safe to apply after earlier migrations: all policies are rebuilt deterministically.

begin;

alter table public.dossiers enable row level security;
alter table public.watch_items enable row level security;
alter table public.actions enable row level security;
alter table public.productions enable row level security;

alter table public.dossiers force row level security;
alter table public.watch_items force row level security;
alter table public.actions force row level security;
alter table public.productions force row level security;

alter table public.dossiers alter column user_id set default auth.uid();
alter table public.watch_items alter column user_id set default auth.uid();

revoke all on table public.dossiers from anon;
revoke all on table public.watch_items from anon;
revoke all on table public.actions from anon;
revoke all on table public.productions from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.dossiers to authenticated;
grant select, insert, update, delete on table public.watch_items to authenticated;
grant select, insert, update, delete on table public.actions to authenticated;
grant select, insert, update, delete on table public.productions to authenticated;

-- Permissive policies are OR'ed in PostgreSQL. Remove every previous business
-- policy so no historical USING (true) rule can reopen another user's data.
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
on public.dossiers for select to authenticated
using (auth.uid() = user_id);

create policy "dossiers_insert_own"
on public.dossiers for insert to authenticated
with check (auth.uid() = user_id);

create policy "dossiers_update_own"
on public.dossiers for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "dossiers_delete_own"
on public.dossiers for delete to authenticated
using (auth.uid() = user_id);

create policy "watch_select_own"
on public.watch_items for select to authenticated
using (
  auth.uid() = user_id
  and (
    dossier_id is null
    or exists (
      select 1 from public.dossiers d
      where d.id = watch_items.dossier_id
        and d.user_id = auth.uid()
    )
  )
);

create policy "watch_insert_own"
on public.watch_items for insert to authenticated
with check (
  auth.uid() = user_id
  and (
    dossier_id is null
    or exists (
      select 1 from public.dossiers d
      where d.id = watch_items.dossier_id
        and d.user_id = auth.uid()
    )
  )
);

create policy "watch_update_own"
on public.watch_items for update to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (
    dossier_id is null
    or exists (
      select 1 from public.dossiers d
      where d.id = watch_items.dossier_id
        and d.user_id = auth.uid()
    )
  )
);

create policy "watch_delete_own"
on public.watch_items for delete to authenticated
using (auth.uid() = user_id);

create policy "actions_select_own_dossier"
on public.actions for select to authenticated
using (
  exists (
    select 1 from public.dossiers d
    where d.id = actions.dossier_id
      and d.user_id = auth.uid()
  )
);

create policy "actions_insert_own_dossier"
on public.actions for insert to authenticated
with check (
  exists (
    select 1 from public.dossiers d
    where d.id = actions.dossier_id
      and d.user_id = auth.uid()
  )
);

create policy "actions_update_own_dossier"
on public.actions for update to authenticated
using (
  exists (
    select 1 from public.dossiers d
    where d.id = actions.dossier_id
      and d.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.dossiers d
    where d.id = actions.dossier_id
      and d.user_id = auth.uid()
  )
);

create policy "actions_delete_own_dossier"
on public.actions for delete to authenticated
using (
  exists (
    select 1 from public.dossiers d
    where d.id = actions.dossier_id
      and d.user_id = auth.uid()
  )
);

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

create index if not exists dossiers_user_id_idx on public.dossiers(user_id);
create index if not exists watch_items_user_id_idx on public.watch_items(user_id);
create index if not exists watch_items_dossier_id_idx on public.watch_items(dossier_id);
create index if not exists actions_dossier_id_idx on public.actions(dossier_id);
create index if not exists productions_dossier_id_idx on public.productions(dossier_id);

-- Fail the migration if a future edit accidentally leaves a permissive policy.
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('dossiers', 'watch_items', 'actions', 'productions')
      and (coalesce(qual, '') in ('true', '(true)') or coalesce(with_check, '') in ('true', '(true)'))
  ) then
    raise exception 'Myvor tenant isolation check failed: permissive business policy detected';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('dossiers', 'watch_items', 'actions', 'productions')
  ) <> 16 then
    raise exception 'Myvor tenant isolation check failed: expected 16 business policies';
  end if;
end
$$;

commit;
