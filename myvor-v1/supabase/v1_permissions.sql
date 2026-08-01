-- Myvor V1 — droits Supabase cohérents avec l'application actuelle.
-- L'application exige une session Supabase Auth avant d'afficher le cockpit.
-- On n'ouvre donc pas les tables métier au rôle anon.

alter table public.dossiers enable row level security;
alter table public.watch_items enable row level security;
alter table public.actions enable row level security;

revoke all on table public.dossiers from anon;
revoke all on table public.watch_items from anon;
revoke all on table public.actions from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.dossiers to authenticated;
grant select, insert, update, delete on table public.watch_items to authenticated;
grant select, insert, update, delete on table public.actions to authenticated;

drop policy if exists "authenticated read dossiers" on public.dossiers;
drop policy if exists "authenticated insert dossiers" on public.dossiers;
drop policy if exists "authenticated update dossiers" on public.dossiers;
drop policy if exists "authenticated delete dossiers" on public.dossiers;

create policy "authenticated read dossiers"
on public.dossiers for select to authenticated using (true);
create policy "authenticated insert dossiers"
on public.dossiers for insert to authenticated with check (true);
create policy "authenticated update dossiers"
on public.dossiers for update to authenticated using (true) with check (true);
create policy "authenticated delete dossiers"
on public.dossiers for delete to authenticated using (true);

drop policy if exists "authenticated read watch_items" on public.watch_items;
drop policy if exists "authenticated insert watch_items" on public.watch_items;
drop policy if exists "authenticated update watch_items" on public.watch_items;
drop policy if exists "authenticated delete watch_items" on public.watch_items;

create policy "authenticated read watch_items"
on public.watch_items for select to authenticated using (true);
create policy "authenticated insert watch_items"
on public.watch_items for insert to authenticated with check (true);
create policy "authenticated update watch_items"
on public.watch_items for update to authenticated using (true) with check (true);
create policy "authenticated delete watch_items"
on public.watch_items for delete to authenticated using (true);

drop policy if exists "Users can read actions" on public.actions;
drop policy if exists "Users can create actions" on public.actions;
drop policy if exists "Users can update actions" on public.actions;
drop policy if exists "Users can delete actions" on public.actions;
drop policy if exists "authenticated read actions" on public.actions;
drop policy if exists "authenticated insert actions" on public.actions;
drop policy if exists "authenticated update actions" on public.actions;
drop policy if exists "authenticated delete actions" on public.actions;
drop policy if exists "anon read actions" on public.actions;

create policy "authenticated read actions"
on public.actions for select to authenticated using (true);
create policy "authenticated insert actions"
on public.actions for insert to authenticated with check (true);
create policy "authenticated update actions"
on public.actions for update to authenticated using (true) with check (true);
create policy "authenticated delete actions"
on public.actions for delete to authenticated using (true);

-- Vérification utile après exécution
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('dossiers','watch_items','actions')
  and grantee in ('authenticated','anon')
order by table_name, grantee, privilege_type;

select tablename, policyname, roles, cmd
from pg_policies
where schemaname='public'
  and tablename in ('dossiers','watch_items','actions')
order by tablename, policyname;
