create or replace function private.guard_watch_client_mutations()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','pg_temp'
as $function$
begin
  if auth.uid() is null then return coalesce(new,old); end if;

  if tg_op='INSERT' then
    if new.user_id is distinct from auth.uid()
       or new.created_by is distinct from auth.uid()
       or new.organization_id is null
       or not private.can_write_organization(new.organization_id)
       or new.qualification_confidence is not null
       or new.qualification_reason is not null
       or new.suggested_dossier_id is not null
       or new.qualified_at is not null
       or new.source_name is not null
       or new.published_at is not null then
      raise exception 'Invalid manual watch item';
    end if;
    if new.urgency not in ('faible','moyen','fort','absolument urgent') then
      raise exception 'Invalid watch urgency';
    end if;
    if new.dossier_id is not null and not exists (
      select 1 from public.dossiers d
      where d.id=new.dossier_id and d.organization_id=new.organization_id
    ) then
      raise exception 'Watch dossier must belong to the same organization';
    end if;
  elsif tg_op='DELETE' then
    raise exception 'Watch items cannot be deleted from the client';
  elsif tg_op='UPDATE' then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.organization_id is distinct from old.organization_id
       or new.created_by is distinct from old.created_by
       or new.title is distinct from old.title
       or new.nature is distinct from old.nature
       or new.source_url is distinct from old.source_url
       or new.source_name is distinct from old.source_name
       or new.published_at is distinct from old.published_at
       or new.urgency is distinct from old.urgency
       or new.qualification_confidence is distinct from old.qualification_confidence
       or new.qualification_reason is distinct from old.qualification_reason
       or new.suggested_dossier_id is distinct from old.suggested_dossier_id
       or new.qualified_at is distinct from old.qualified_at
       or new.created_at is distinct from old.created_at then
      raise exception 'Only manual dossier assignment may be changed from the client';
    end if;
  end if;
  return coalesce(new,old);
end;
$function$;

revoke insert on public.watch_items from authenticated;
grant insert(title,nature,source_url,dossier_id,urgency) on public.watch_items to authenticated;

drop policy if exists watch_insert_manual_workspace on public.watch_items;
create policy watch_insert_manual_workspace
on public.watch_items
for insert
to authenticated
with check (
  user_id=(select auth.uid())
  and created_by=(select auth.uid())
  and private.can_write_organization(organization_id)
  and qualification_confidence is null
  and qualification_reason is null
  and suggested_dossier_id is null
  and qualified_at is null
  and source_name is null
  and published_at is null
  and urgency in ('faible','moyen','fort','absolument urgent')
  and (
    dossier_id is null
    or exists (
      select 1 from public.dossiers d
      where d.id=watch_items.dossier_id
        and d.organization_id=watch_items.organization_id
    )
  )
);
