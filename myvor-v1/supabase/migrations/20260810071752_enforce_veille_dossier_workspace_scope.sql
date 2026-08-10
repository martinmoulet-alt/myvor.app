create or replace function private.enforce_watch_dossier_scope()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
begin
  if new.dossier_id is not null and not exists (
    select 1 from public.dossiers d
    where d.id=new.dossier_id and d.organization_id=new.organization_id
  ) then
    raise exception 'Watch dossier must belong to the same organization';
  end if;

  if new.suggested_dossier_id is not null and not exists (
    select 1 from public.dossiers d
    where d.id=new.suggested_dossier_id and d.organization_id=new.organization_id
  ) then
    raise exception 'Suggested watch dossier must belong to the same organization';
  end if;

  return new;
end;
$$;
revoke all on function private.enforce_watch_dossier_scope() from public,anon,authenticated;

drop trigger if exists watch_items_dossier_scope on public.watch_items;
create trigger watch_items_dossier_scope
before insert or update of dossier_id,suggested_dossier_id,organization_id on public.watch_items
for each row execute function private.enforce_watch_dossier_scope();
