alter table public.user_profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists legal_version text;

create or replace function private.bootstrap_myvor_user()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  org_id uuid;
  requested_org uuid;
  requested_role text;
  workspace_name text;
  accepted_at timestamptz;
  privacy_at timestamptz;
  accepted_version text;
begin
  begin requested_org:=nullif(new.raw_user_meta_data->>'myvor_org_id','')::uuid; exception when others then requested_org:=null; end;
  requested_role:=coalesce(nullif(new.raw_user_meta_data->>'myvor_org_role',''),'member');
  if requested_role not in ('admin','member','viewer') then requested_role:='member'; end if;

  accepted_version:=nullif(new.raw_user_meta_data->>'myvor_legal_version','');
  begin accepted_at:=nullif(new.raw_user_meta_data->>'myvor_terms_accepted_at','')::timestamptz; exception when others then accepted_at:=null; end;
  begin privacy_at:=nullif(new.raw_user_meta_data->>'myvor_privacy_accepted_at','')::timestamptz; exception when others then privacy_at:=null; end;

  insert into public.user_profiles(user_id,terms_accepted_at,privacy_accepted_at,legal_version)
  values(new.id,accepted_at,privacy_at,accepted_version)
  on conflict(user_id) do update set
    terms_accepted_at=coalesce(public.user_profiles.terms_accepted_at,excluded.terms_accepted_at),
    privacy_accepted_at=coalesce(public.user_profiles.privacy_accepted_at,excluded.privacy_accepted_at),
    legal_version=coalesce(public.user_profiles.legal_version,excluded.legal_version);

  if requested_org is not null and exists(select 1 from public.organizations where id=requested_org) then
    org_id:=requested_org;
    insert into public.organization_members(organization_id,user_id,role,email,display_name)
    values(org_id,new.id,requested_role,new.email,coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),nullif(split_part(coalesce(new.email,''),'@',1),''),'Utilisateur'))
    on conflict(organization_id,user_id) do update set role=excluded.role,email=excluded.email,display_name=excluded.display_name;
    update public.organization_invitations set status='accepted',accepted_at=now() where organization_id=org_id and lower(email)=lower(coalesce(new.email,'')) and status='pending';
  else
    workspace_name:=left(coalesce(nullif(trim(new.raw_user_meta_data->>'company'),''),nullif(trim(new.raw_user_meta_data->>'full_name'),''),nullif(split_part(coalesce(new.email,''),'@',1),''),'Workspace Myvor'),120);
    insert into public.organizations(name,created_by) values(workspace_name,new.id) returning id into org_id;
    insert into public.organization_members(organization_id,user_id,role,email,display_name)
    values(org_id,new.id,'owner',new.email,coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),nullif(split_part(coalesce(new.email,''),'@',1),''),'Utilisateur'));
  end if;

  update public.user_profiles set active_organization_id=org_id,updated_at=now() where user_id=new.id;
  return new;
end
$$;

create or replace function private.protect_user_profile_legal_fields()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public','pg_temp'
as $$
begin
  if auth.uid() is not null
     and coalesce(current_setting('myvor.legal_acceptance',true),'') <> '1'
     and (new.terms_accepted_at is distinct from old.terms_accepted_at
       or new.privacy_accepted_at is distinct from old.privacy_accepted_at
       or new.legal_version is distinct from old.legal_version)
  then
    new.terms_accepted_at:=old.terms_accepted_at;
    new.privacy_accepted_at:=old.privacy_accepted_at;
    new.legal_version:=old.legal_version;
  end if;
  return new;
end
$$;
revoke all on function private.protect_user_profile_legal_fields() from public,anon,authenticated;

drop trigger if exists user_profiles_protect_legal_fields on public.user_profiles;
create trigger user_profiles_protect_legal_fields
before update of terms_accepted_at,privacy_accepted_at,legal_version on public.user_profiles
for each row execute function private.protect_user_profile_legal_fields();

create or replace function public.accept_myvor_legal_terms(p_version text)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public','pg_temp'
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_version is null or p_version <> '2026-08-10' then raise exception 'Unsupported legal version'; end if;
  perform set_config('myvor.legal_acceptance','1',true);
  update public.user_profiles
     set terms_accepted_at=coalesce(terms_accepted_at,clock_timestamp()),
         privacy_accepted_at=coalesce(privacy_accepted_at,clock_timestamp()),
         legal_version=p_version,
         updated_at=clock_timestamp()
   where user_id=uid;
  if not found then raise exception 'User profile unavailable'; end if;
  return true;
end
$$;
revoke all on function public.accept_myvor_legal_terms(text) from public,anon;
grant execute on function public.accept_myvor_legal_terms(text) to authenticated;