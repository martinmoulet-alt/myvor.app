-- Myvor dossier intelligence: separate legal corpus from operational watch items.
-- This migration is intentionally upstream-only: Decision Engine modules are untouched.

create table if not exists public.dossier_corpus (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.dossiers(id) on delete cascade,
  organization_id uuid not null,
  jurisdiction text not null check (jurisdiction in ('FR','EU')),
  reference_id text not null,
  title text not null,
  nature text,
  source_url text not null,
  published_at date,
  role text not null check (role in ('pivot','structuring','implementation','update','reference')),
  confidence numeric(5,4) not null default 0,
  reason text,
  change_summary text,
  source_text text not null default '',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(dossier_id,jurisdiction,reference_id)
);

create index if not exists dossier_corpus_dossier_idx on public.dossier_corpus(dossier_id,confidence desc);
create index if not exists dossier_corpus_org_idx on public.dossier_corpus(organization_id,dossier_id);

alter table public.dossier_corpus enable row level security;
drop policy if exists dossier_corpus_read on public.dossier_corpus;
create policy dossier_corpus_read on public.dossier_corpus
for select to authenticated
using (private.is_organization_member(organization_id));
grant select on public.dossier_corpus to authenticated;
grant select,insert,update,delete on public.dossier_corpus to service_role;

create table if not exists public.dossier_intelligence_state (
  dossier_id uuid primary key references public.dossiers(id) on delete cascade,
  organization_id uuid not null,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_status text,
  last_error text,
  corpus_count integer not null default 0,
  linked_count integer not null default 0,
  suggested_count integer not null default 0,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.dossier_intelligence_state enable row level security;
drop policy if exists dossier_intelligence_state_read on public.dossier_intelligence_state;
create policy dossier_intelligence_state_read on public.dossier_intelligence_state
for select to authenticated
using (private.is_organization_member(organization_id));
grant select on public.dossier_intelligence_state to authenticated;
grant select,insert,update,delete on public.dossier_intelligence_state to service_role;

create or replace function public.verify_dossier_intelligence_internal_request(
  p_path text,p_timestamp bigint,p_nonce uuid,p_signature text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','vault','extensions','pg_temp'
as $function$
declare
  v_secret text;
  v_expected text;
  v_now bigint:=floor(extract(epoch from clock_timestamp()))::bigint;
  v_canonical text;
begin
  if p_path<>'/functions/v1/dossier-intelligence-engine' then return false; end if;
  if p_timestamp is null or abs(v_now-p_timestamp)>120 or p_nonce is null or p_signature is null or p_signature!~'^[0-9a-f]{64}$' then return false; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='myvor_cron_secret' limit 1;
  if coalesce(v_secret,'')='' then return false; end if;
  v_canonical:=p_path||E'\n'||p_timestamp::text||E'\n'||p_nonce::text;
  v_expected:=encode(extensions.hmac(v_canonical,v_secret,'sha256'),'hex');
  if v_expected is distinct from lower(p_signature) then return false; end if;
  delete from private.veille_request_nonces where expires_at<clock_timestamp();
  begin
    insert into private.veille_request_nonces(nonce,path,expires_at)
    values(p_nonce,p_path,clock_timestamp()+interval '10 minutes');
  exception when unique_violation then return false;
  end;
  return true;
end;
$function$;

create or replace function public.invoke_dossier_intelligence_once(p_dossier_id uuid)
returns bigint
language plpgsql
security definer
set search_path to 'pg_catalog','public','extensions','net','vault','pg_temp'
as $function$
declare
  v_path text:='/functions/v1/dossier-intelligence-engine';
  v_ts bigint;
  v_nonce uuid;
  v_secret text;
  v_base text;
  v_sig text;
  v_id bigint;
begin
  if p_dossier_id is null then raise exception 'dossier_id required'; end if;
  v_ts:=floor(extract(epoch from clock_timestamp()))::bigint;
  v_nonce:=gen_random_uuid();
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='myvor_cron_secret' limit 1;
  select rtrim(decrypted_secret,'/') into v_base from vault.decrypted_secrets where name='myvor_project_url' limit 1;
  if coalesce(v_secret,'')='' or coalesce(v_base,'')='' then raise exception 'dossier intelligence configuration missing'; end if;
  v_sig:=encode(extensions.hmac(v_path||E'\n'||v_ts::text||E'\n'||v_nonce::text,v_secret,'sha256'),'hex');
  select net.http_post(
    url:=v_base||v_path,
    headers:=jsonb_build_object('Content-Type','application/json','x-myvor-timestamp',v_ts::text,'x-myvor-nonce',v_nonce::text,'x-myvor-signature',v_sig),
    body:=jsonb_build_object('dossier_id',p_dossier_id),
    timeout_milliseconds:=120000
  ) into v_id;
  perform net.wake();
  return v_id;
end;
$function$;

create or replace function public.refresh_dossier_intelligence(p_dossier_id uuid)
returns bigint
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','pg_temp'
as $function$
declare v_org uuid;
begin
  select organization_id into v_org from public.dossiers where id=p_dossier_id;
  if v_org is null or not private.can_write_organization(v_org) then raise exception 'forbidden'; end if;
  return public.invoke_dossier_intelligence_once(p_dossier_id);
end;
$function$;

grant execute on function public.refresh_dossier_intelligence(uuid) to authenticated;

create or replace function private.enqueue_dossier_intelligence()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','pg_temp'
as $function$
begin
  if coalesce(btrim(new.title),'')='' or coalesce(btrim(new.objective),'')='' then return new; end if;
  perform public.invoke_dossier_intelligence_once(new.id);
  return new;
exception when others then
  raise warning 'dossier intelligence enqueue failed for %: %',new.id,sqlerrm;
  return new;
end;
$function$;

drop trigger if exists dossiers_auto_intelligence on public.dossiers;
create trigger dossiers_auto_intelligence
after insert or update of title,objective,context,watch_keywords,watch_priority_phrases,watch_excluded_keywords
on public.dossiers
for each row execute function private.enqueue_dossier_intelligence();

create or replace function public.enqueue_next_dossier_intelligence()
returns bigint
language plpgsql
security definer
set search_path to 'pg_catalog','public','pg_temp'
as $function$
declare v_id uuid;
begin
  select d.id into v_id
  from public.dossiers d
  left join public.dossier_intelligence_state s on s.dossier_id=d.id
  where coalesce(d.status,'')<>'Archivé'
    and (s.last_started_at is null or s.last_started_at < clock_timestamp()-interval '30 minutes')
  order by coalesce(s.last_started_at,'1970-01-01'::timestamptz),d.created_at desc
  limit 1;
  if v_id is null then return null; end if;
  return public.invoke_dossier_intelligence_once(v_id);
end;
$function$;
