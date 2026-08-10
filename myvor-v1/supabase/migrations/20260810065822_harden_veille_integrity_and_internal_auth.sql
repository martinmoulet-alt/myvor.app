create table if not exists private.trusted_watch_hosts (
  host text primary key,
  allow_subdomains boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
revoke all on table private.trusted_watch_hosts from public, anon, authenticated;
grant select on table private.trusted_watch_hosts to service_role;

insert into private.trusted_watch_hosts(host,allow_subdomains,enabled) values
  ('assemblee-nationale.fr',true,true),('senat.fr',true,true),('legifrance.gouv.fr',true,true),
  ('vie-publique.fr',true,true),('economie.gouv.fr',true,true),('ecologie.gouv.fr',true,true),
  ('tresor.economie.gouv.fr',true,true),('conseil-etat.fr',true,true),('conseil-constitutionnel.fr',true,true),
  ('ccomptes.fr',true,true),('cnil.fr',true,true),('arcep.fr',true,true),('cre.fr',true,true),
  ('amf-france.org',true,true),('autoritedelaconcurrence.fr',true,true),('eur-lex.europa.eu',false,true)
on conflict(host) do update set allow_subdomains=excluded.allow_subdomains,enabled=excluded.enabled;

create table if not exists private.veille_request_nonces (
  nonce uuid primary key,
  path text not null,
  used_at timestamptz not null default now(),
  expires_at timestamptz not null
);
revoke all on table private.veille_request_nonces from public,anon,authenticated;

create or replace function public.verify_veille_internal_request(p_path text,p_timestamp bigint,p_nonce uuid,p_signature text)
returns boolean language plpgsql security definer
set search_path=pg_catalog,public,private,vault,extensions,pg_temp as $$
declare v_secret text;v_expected text;v_now bigint:=floor(extract(epoch from clock_timestamp()))::bigint;v_canonical text;
begin
  if p_path not in ('/functions/v1/sync-watch','/functions/v1/sync-watch-catalog','/functions/v1/qualify-watch-ai') then return false; end if;
  if p_timestamp is null or abs(v_now-p_timestamp)>120 then return false; end if;
  if p_nonce is null or p_signature is null or p_signature !~ '^[0-9a-f]{64}$' then return false; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='myvor_cron_secret' limit 1;
  if coalesce(v_secret,'')='' then return false; end if;
  v_canonical:=p_path||E'\n'||p_timestamp::text||E'\n'||p_nonce::text;
  v_expected:=encode(extensions.hmac(v_canonical,v_secret,'sha256'),'hex');
  if v_expected is distinct from lower(p_signature) then return false; end if;
  delete from private.veille_request_nonces where expires_at<clock_timestamp();
  begin
    insert into private.veille_request_nonces(nonce,path,expires_at) values(p_nonce,p_path,clock_timestamp()+interval '10 minutes');
  exception when unique_violation then return false;
  end;
  return true;
end $$;
revoke all on function public.verify_veille_internal_request(text,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.verify_veille_internal_request(text,bigint,uuid,text) to service_role;

create or replace function public.get_veille_source_bridge_token()
returns text language sql security definer set search_path=pg_catalog,vault,pg_temp as $$
  select decrypted_secret from vault.decrypted_secrets where name='myvor_cron_secret' limit 1
$$;
revoke all on function public.get_veille_source_bridge_token() from public,anon,authenticated;
grant execute on function public.get_veille_source_bridge_token() to service_role;

create or replace function private.enforce_watch_source_integrity()
returns trigger language plpgsql security definer set search_path=pg_catalog,private,pg_temp as $$
declare v_host text;
begin
  if new.source_url is null or char_length(new.source_url)>1600 then raise exception 'Invalid watch source URL'; end if;
  if new.source_url !~ '^https://' then raise exception 'Watch sources must use HTTPS'; end if;
  v_host:=lower(substring(new.source_url from '^https://([^/:?#]+)'));
  if v_host is null or not exists(select 1 from private.trusted_watch_hosts h where h.enabled and (v_host=h.host or (h.allow_subdomains and v_host like '%.'||h.host))) then
    raise exception 'Untrusted watch source host: %',coalesce(v_host,'unknown');
  end if;
  if char_length(new.title)>1000 or char_length(new.nature)>180 or char_length(coalesce(new.source_name,''))>220 then raise exception 'Watch source metadata too large'; end if;
  return new;
end $$;
revoke all on function private.enforce_watch_source_integrity() from public,anon,authenticated;

create or replace function private.guard_watch_client_mutations()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $$
begin
  if auth.uid() is null then return coalesce(new,old); end if;
  if tg_op='INSERT' then raise exception 'Watch items are server-managed';
  elsif tg_op='DELETE' then raise exception 'Watch items cannot be deleted from the client';
  elsif tg_op='UPDATE' then
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.organization_id is distinct from old.organization_id
       or new.created_by is distinct from old.created_by or new.title is distinct from old.title or new.nature is distinct from old.nature
       or new.source_url is distinct from old.source_url or new.source_name is distinct from old.source_name or new.published_at is distinct from old.published_at
       or new.urgency is distinct from old.urgency or new.qualification_confidence is distinct from old.qualification_confidence
       or new.qualification_reason is distinct from old.qualification_reason or new.suggested_dossier_id is distinct from old.suggested_dossier_id
       or new.qualified_at is distinct from old.qualified_at or new.created_at is distinct from old.created_at then
      raise exception 'Only manual dossier assignment may be changed from the client';
    end if;
  end if;
  return coalesce(new,old);
end $$;
revoke all on function private.guard_watch_client_mutations() from public,anon,authenticated;

create or replace function private.enforce_watch_content_integrity()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.watch_items where id=new.watch_item_id;
  if v_org is null then raise exception 'Unknown watch item'; end if;
  new.organization_id:=v_org;
  if char_length(coalesce(new.source_text,''))>40000 then raise exception 'Watch source text exceeds 40000 characters'; end if;
  new.source_text_chars:=char_length(coalesce(new.source_text,''));
  return new;
end $$;
revoke all on function private.enforce_watch_content_integrity() from public,anon,authenticated;

update public.watch_items set source_url='https://'||substring(source_url from 8) where source_url like 'http://www.senat.fr/%';
delete from public.watch_items where lower(split_part(split_part(source_url,'://',2),'/',1)) in ('www.cnb.avocat.fr','example.invalid');

drop trigger if exists watch_items_source_integrity on public.watch_items;
create trigger watch_items_source_integrity before insert or update of source_url,source_name,title,nature on public.watch_items for each row execute function private.enforce_watch_source_integrity();
drop trigger if exists watch_items_guard_client_mutations on public.watch_items;
create trigger watch_items_guard_client_mutations before insert or update or delete on public.watch_items for each row execute function private.guard_watch_client_mutations();
drop trigger if exists watch_item_content_integrity on public.watch_item_content;
create trigger watch_item_content_integrity before insert or update on public.watch_item_content for each row execute function private.enforce_watch_content_integrity();

create unique index if not exists watch_items_organization_source_uidx on public.watch_items(organization_id,source_url);
alter table public.watch_items drop constraint if exists watch_items_source_url_https_check;
alter table public.watch_items add constraint watch_items_source_url_https_check check(source_url ~ '^https://');
alter table public.watch_items drop constraint if exists watch_items_metadata_length_check;
alter table public.watch_items add constraint watch_items_metadata_length_check check(char_length(title)<=1000 and char_length(nature)<=180 and char_length(source_url)<=1600 and char_length(coalesce(source_name,''))<=220 and char_length(coalesce(qualification_reason,''))<=1200);
alter table public.watch_item_content drop constraint if exists watch_item_content_text_length_check;
alter table public.watch_item_content add constraint watch_item_content_text_length_check check(char_length(source_text)<=40000);

alter table public.watch_items force row level security;
alter table public.watch_item_content force row level security;
alter table public.veille_runs force row level security;
alter table public.veille_settings force row level security;
revoke insert,delete,update on public.watch_items from authenticated;
grant select on public.watch_items to authenticated;
grant update(dossier_id) on public.watch_items to authenticated;
drop policy if exists watch_insert_workspace on public.watch_items;
drop policy if exists watch_delete_workspace on public.watch_items;
