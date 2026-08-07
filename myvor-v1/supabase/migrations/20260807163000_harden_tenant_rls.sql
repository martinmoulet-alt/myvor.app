-- Myvor tenant isolation hardening
-- Safe to run repeatedly: policies are replaced only for tables that exist.

-- Dossiers and watch_items already use direct user_id ownership.
alter table if exists public.dossiers enable row level security;
alter table if exists public.watch_items enable row level security;

-- Productions and actions are owned through their dossier.
do $$
begin
  if to_regclass('public.productions') is not null then
    execute 'alter table public.productions enable row level security';

    execute 'drop policy if exists productions_select_own on public.productions';
    execute 'drop policy if exists productions_insert_own on public.productions';
    execute 'drop policy if exists productions_update_own on public.productions';
    execute 'drop policy if exists productions_delete_own on public.productions';

    execute $policy$
      create policy productions_select_own
      on public.productions
      for select
      using (
        exists (
          select 1
          from public.dossiers d
          where d.id = productions.dossier_id
            and d.user_id = auth.uid()
        )
      )
    $policy$;

    execute $policy$
      create policy productions_insert_own
      on public.productions
      for insert
      with check (
        exists (
          select 1
          from public.dossiers d
          where d.id = productions.dossier_id
            and d.user_id = auth.uid()
        )
      )
    $policy$;

    execute $policy$
      create policy productions_update_own
      on public.productions
      for update
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
      )
    $policy$;

    execute $policy$
      create policy productions_delete_own
      on public.productions
      for delete
      using (
        exists (
          select 1
          from public.dossiers d
          where d.id = productions.dossier_id
            and d.user_id = auth.uid()
        )
      )
    $policy$;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.actions') is not null then
    execute 'alter table public.actions enable row level security';

    execute 'drop policy if exists actions_select_own on public.actions';
    execute 'drop policy if exists actions_insert_own on public.actions';
    execute 'drop policy if exists actions_update_own on public.actions';
    execute 'drop policy if exists actions_delete_own on public.actions';

    execute $policy$
      create policy actions_select_own
      on public.actions
      for select
      using (
        exists (
          select 1
          from public.dossiers d
          where d.id = actions.dossier_id
            and d.user_id = auth.uid()
        )
      )
    $policy$;

    execute $policy$
      create policy actions_insert_own
      on public.actions
      for insert
      with check (
        exists (
          select 1
          from public.dossiers d
          where d.id = actions.dossier_id
            and d.user_id = auth.uid()
        )
      )
    $policy$;

    execute $policy$
      create policy actions_update_own
      on public.actions
      for update
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
      )
    $policy$;

    execute $policy$
      create policy actions_delete_own
      on public.actions
      for delete
      using (
        exists (
          select 1
          from public.dossiers d
          where d.id = actions.dossier_id
            and d.user_id = auth.uid()
        )
      )
    $policy$;
  end if;
end
$$;

-- Prevent authenticated users from changing dossier ownership through updates.
drop policy if exists dossiers_update_own on public.dossiers;
create policy dossiers_update_own
on public.dossiers
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Same invariant for watch items: user_id can never be moved to another tenant.
drop policy if exists watch_update_own on public.watch_items;
create policy watch_update_own
on public.watch_items
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- A watch item may only be attached to one of the current user's dossiers.
drop policy if exists watch_insert_own on public.watch_items;
create policy watch_insert_own
on public.watch_items
for insert
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

drop policy if exists watch_update_own on public.watch_items;
create policy watch_update_own
on public.watch_items
for update
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
