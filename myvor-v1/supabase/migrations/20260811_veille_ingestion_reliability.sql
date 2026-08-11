-- Myvor veille ingestion reliability — 2026-08-11
-- Structural only: workers, integrity guards and schedules. No historical cleanup data is replayed here.

create table if not exists private.veille_worker_leases (
  worker text primary key,
  holder uuid not null,
  lease_until timestamptz not null,
  acquired_at timestamptz not null default clock_timestamp()
);

alter table private.veille_worker_leases drop constraint if exists veille_worker_leases_worker_check;
alter table private.veille_worker_leases add constraint veille_worker_leases_worker_check
check (worker = any(array[
  'catalog','qualifier','content-enricher','jorf-repair','institutional','eurlex',
  'vie-publique','date-enricher','authorities','commission-news'
]::text[]));

create or replace function public.acquire_veille_worker_lease(p_worker text,p_holder uuid,p_seconds integer default 90)
returns boolean language plpgsql security definer
set search_path='pg_catalog','public','private','pg_temp'
as $$
declare v_count integer;
begin
  if p_worker not in ('catalog','qualifier','content-enricher','jorf-repair','institutional','eurlex','vie-publique','date-enricher','authorities','commission-news') or p_holder is null then return false; end if;
  p_seconds:=greatest(15,least(coalesce(p_seconds,90),180));
  insert into private.veille_worker_leases(worker,holder,lease_until,acquired_at)
  values(p_worker,p_holder,clock_timestamp()+make_interval(secs=>p_seconds),clock_timestamp())
  on conflict(worker) do update
    set holder=excluded.holder,lease_until=excluded.lease_until,acquired_at=excluded.acquired_at
    where private.veille_worker_leases.lease_until<clock_timestamp();
  get diagnostics v_count=row_count;
  return v_count=1;
end;
$$;

create or replace function public.release_veille_worker_lease(p_worker text,p_holder uuid)
returns boolean language plpgsql security definer
set search_path='pg_catalog','public','private','pg_temp'
as $$
declare v_count integer;
begin
  delete from private.veille_worker_leases where worker=p_worker and holder=p_holder;
  get diagnostics v_count=row_count;
  return v_count=1;
end;
$$;

create table if not exists private.veille_request_nonces (
  nonce uuid primary key,
  path text not null,
  expires_at timestamptz not null
);

create or replace function public.verify_veille_internal_request(p_path text,p_timestamp bigint,p_nonce uuid,p_signature text)
returns boolean language plpgsql security definer
set search_path='pg_catalog','public','private','vault','extensions','pg_temp'
as $$
declare
  v_secret text;
  v_expected text;
  v_now bigint:=floor(extract(epoch from clock_timestamp()))::bigint;
  v_canonical text;
begin
  if p_path not in (
    '/functions/v1/sync-watch','/functions/v1/sync-watch-catalog','/functions/v1/qualify-watch-ai','/functions/v1/historical-source-backfill',
    '/functions/v1/watch-content-enricher','/functions/v1/watch-date-enricher','/functions/v1/watch-jorf-repair',
    '/functions/v1/sync-watch-institutional','/functions/v1/sync-watch-authorities','/functions/v1/sync-watch-commission-news',
    '/functions/v1/sync-watch-special-sources','/functions/v1/sync-watch-vie-publique','/functions/v1/sync-watch-cour-comptes',
    '/functions/v1/sync-watch-eurlex-cellar','/functions/v1/sync-watch-dgccrf'
  ) then return false; end if;
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
$$;

create or replace function public.get_veille_ingestion_targets()
returns table(organization_id uuid,user_id uuid)
language sql security definer
set search_path='pg_catalog','public','pg_temp'
as $$
  with enabled as (
    select distinct vs.user_id from public.veille_settings vs where vs.enabled=true
  ), resolved as (
    select e.user_id,
      coalesce(
        (select w.organization_id from public.watch_items w where w.user_id=e.user_id and w.organization_id is not null order by w.created_at desc limit 1),
        (select d.organization_id from public.dossiers d where d.user_id=e.user_id and d.organization_id is not null order by d.created_at desc limit 1),
        (select up.active_organization_id from public.user_profiles up where up.user_id=e.user_id and up.active_organization_id is not null limit 1),
        (select om.organization_id from public.organization_members om where om.user_id=e.user_id order by om.joined_at limit 1)
      ) organization_id
    from enabled e
  )
  select distinct on (organization_id) organization_id,user_id
  from resolved where organization_id is not null
  order by organization_id,user_id;
$$;

create or replace function public.get_missing_watch_items_for_enrichment(p_limit integer default 72)
returns table(id uuid,organization_id uuid,title text,source_url text,source_name text,published_at timestamptz,dossier_id uuid,created_at timestamptz)
language sql security definer
set search_path='pg_catalog','public','pg_temp'
as $$
  select w.id,w.organization_id,w.title,w.source_url,w.source_name,w.published_at,w.dossier_id,w.created_at
  from public.watch_items w
  left join public.watch_item_content c on c.watch_item_id=w.id
  where c.watch_item_id is null and w.source_url is not null and w.organization_id is not null
  order by (w.dossier_id is not null) desc,w.created_at desc
  limit greatest(1,least(coalesce(p_limit,72),200));
$$;

create or replace function public.get_watch_items_missing_dates(p_limit integer default 24)
returns table(id uuid,source_url text,source_name text)
language sql security definer
set search_path='pg_catalog','public','pg_temp'
as $$
  select w.id,w.source_url,w.source_name
  from public.watch_items w
  where w.published_at is null and w.source_url is not null and w.source_url~'^https://'
  order by (w.dossier_id is not null) desc,(w.suggested_dossier_id is not null) desc,w.created_at desc
  limit greatest(1,least(coalesce(p_limit,24),60));
$$;

create or replace function public.get_jorf_items_for_strict_repair(p_limit integer default 12)
returns table(id uuid,organization_id uuid,source_url text,published_at timestamptz,current_text text)
language sql security definer
set search_path='pg_catalog','public','pg_temp'
as $$
  select w.id,w.organization_id,w.source_url,w.published_at,c.source_text
  from public.watch_items w
  left join public.watch_item_content c on c.watch_item_id=w.id
  where w.source_url like 'https://%legifrance.gouv.fr/jorf/id/JORFTEXT%'
    and w.published_at is not null
    and (c.watch_item_id is null or substring(coalesce(c.source_text,'') from 1 for 120)!~substring(w.source_url from '(JORFTEXT[0-9]+)'))
  order by (w.dossier_id is not null) desc,w.published_at desc
  limit greatest(1,least(coalesce(p_limit,12),30));
$$;

create or replace function public.reuse_existing_watch_content_by_url()
returns integer language plpgsql security definer
set search_path='pg_catalog','public','pg_temp'
as $$
declare v_count integer:=0;
begin
  with reusable as (
    select distinct on (target.id)
      target.id target_id,target.organization_id,source_content.source_text,source_content.source_text_chars
    from public.watch_items target
    left join public.watch_item_content existing on existing.watch_item_id=target.id
    join public.watch_items source_item on source_item.source_url=target.source_url and source_item.id<>target.id
    join public.watch_item_content source_content on source_content.watch_item_id=source_item.id
    where existing.watch_item_id is null and source_content.source_text_chars>=80
    order by target.id,source_content.updated_at desc nulls last
  ), ins as (
    insert into public.watch_item_content(watch_item_id,organization_id,source_text,source_text_chars,fetched_at,updated_at)
    select target_id,organization_id,source_text,source_text_chars,clock_timestamp(),clock_timestamp() from reusable
    on conflict(watch_item_id) do nothing returning watch_item_id
  ) select count(*) into v_count from ins;

  update public.watch_items target
  set published_at=source_item.published_at
  from public.watch_items source_item
  where target.published_at is null and target.source_url=source_item.source_url and source_item.published_at is not null and target.id<>source_item.id;
  return v_count;
end;
$$;

create or replace function public.sanitize_watch_item_metadata()
returns trigger language plpgsql set search_path=''
as $$
declare v_host text;
begin
  if new.published_at is not null and new.published_at>now()+interval '36 hours' then new.published_at:=null; end if;
  if coalesce(new.source_url,'')~'^http://' then
    v_host:=lower(substring(new.source_url from '^http://([^/:?#]+)'));
    if v_host~'(^|\.)(assemblee-nationale\.fr|senat\.fr|conseil-etat\.fr|economie\.gouv\.fr|ecologie\.gouv\.fr|arcep\.fr|cnil\.fr|conseil-constitutionnel\.fr|legifrance\.gouv\.fr|vie-publique\.fr)$' then
      new.source_url:=regexp_replace(new.source_url,'^http://','https://');
    end if;
  end if;
  if coalesce(new.source_name,'')='Conseil constitutionnel' and coalesce(new.source_url,'') like '%/agenda/%' then new.nature:='Échéance institutionnelle'; end if;
  return new;
end;
$$;

create or replace function public.reject_static_watch_source()
returns trigger language plpgsql
set search_path='pg_catalog','public','pg_temp'
as $$
declare u text:=coalesce(new.source_url,''); t text:=lower(trim(coalesce(new.title,'')));
begin
  if new.source_name='CNIL' and new.published_at is null and (
    u~'/fr/(missions|comprendre-mes-droits|mon-quotidien|saisir-la-cnil|thematiques|technologies|agir|la-cnil|modeles|fonctionnement|enjeux-numeriques)/'
    or u~'/fr/(adresser-une-plainte|gestion-des-cookies|particulier-intelligence-artificielle-ia|utiliser-votre-smartphone-et-vos-applications|transports-et-mobilite-particulier|demander-une-verification-sur-un-fichier-de-police-ou-de-renseignement|vos-droits-lintervention-humaine-face-votre-profilage-ou-une-decision-automatisee)$'
    or u~'/fr/(achats-et-publicite|mission-de-la-CNIL-anticiper-innovation|la-protection-des-donnees-dans-le-monde|la-cnil-dans-le-monde|evenements)$'
    or u like 'https://www.cnil.fr/fr/en-europe-et-dans-le-monde/%' or u like 'https://www.cnil.fr/fr/tag/%'
  ) then return null; end if;
  if new.source_name='ARCEP' and new.published_at is null and u in ('https://www.arcep.fr/actualites/les-consultations-publiques.html','https://www.arcep.fr/actualites/actualites-et-communiques.html') then return null; end if;
  if new.source_name='Conseil constitutionnel' and new.published_at is null and (
    u like '%/les-decisions/tables-analytiques%' or u not like 'https://%conseil-constitutionnel.fr/%'
    or (u like 'https://qpc360.conseil-constitutionnel.fr/%' and u not like 'https://qpc360.conseil-constitutionnel.fr/agenda/affaire-%')
    or t in ('aller au menu','accueil','menu')
  ) then return null; end if;
  if new.source_name='DGCCRF — Fiches pratiques' and new.published_at is null and (
    u like 'https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/panorama-des-textes%'
    or u='https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/les-fiches-pratiques-sommaire'
  ) then return null; end if;
  if new.source_name='Commission européenne — Numérique' and new.published_at is null and u like 'https://digital-strategy.ec.europa.eu/en/policies/%' then return null; end if;
  return new;
end;
$$;

drop trigger if exists "00_reject_static_watch_sources" on public.watch_items;
create trigger "00_reject_static_watch_sources" before insert on public.watch_items
for each row execute function public.reject_static_watch_source();

revoke all on function public.get_veille_ingestion_targets() from public,anon,authenticated;
revoke all on function public.get_missing_watch_items_for_enrichment(integer) from public,anon,authenticated;
revoke all on function public.get_watch_items_missing_dates(integer) from public,anon,authenticated;
revoke all on function public.get_jorf_items_for_strict_repair(integer) from public,anon,authenticated;
revoke all on function public.reuse_existing_watch_content_by_url() from public,anon,authenticated;
grant execute on function public.get_veille_ingestion_targets() to service_role;
grant execute on function public.get_missing_watch_items_for_enrichment(integer) to service_role;
grant execute on function public.get_watch_items_missing_dates(integer) to service_role;
grant execute on function public.get_jorf_items_for_strict_repair(integer) to service_role;
grant execute on function public.reuse_existing_watch_content_by_url() to service_role;

-- Internal cron scheduling. Each job uses the existing vault secrets myvor_cron_secret + myvor_project_url.
do $$
declare r record; old_job bigint; command_sql text;
begin
  for r in select * from (values
    ('myvor-sync-watch-authorities-every-15-minutes','1,16,31,46 * * * *','/functions/v1/sync-watch-authorities'),
    ('myvor-sync-watch-institutional-every-15-minutes','4,19,34,49 * * * *','/functions/v1/sync-watch-institutional'),
    ('myvor-sync-watch-dgccrf-every-15-minutes','5,20,35,50 * * * *','/functions/v1/sync-watch-dgccrf'),
    ('myvor-sync-watch-eurlex-cellar-every-15-minutes','7,22,37,52 * * * *','/functions/v1/sync-watch-eurlex-cellar'),
    ('myvor-sync-watch-vie-publique-every-30-minutes','11,41 * * * *','/functions/v1/sync-watch-vie-publique'),
    ('myvor-sync-watch-commission-news-every-30-minutes','13,43 * * * *','/functions/v1/sync-watch-commission-news'),
    ('myvor-watch-content-enricher-every-5-minutes','0,5,10,15,20,25,30,35,40,45,50,55 * * * *','/functions/v1/watch-content-enricher'),
    ('myvor-watch-jorf-repair-every-5-minutes','1,6,11,16,21,26,31,36,41,46,51,56 * * * *','/functions/v1/watch-jorf-repair')
  ) as x(jobname,schedule,path)
  loop
    select jobid into old_job from cron.job where jobname=r.jobname limit 1;
    if old_job is not null then perform cron.unschedule(old_job); end if;
    command_sql:=format($cmd$
      with req as (
        select %L::text path,
               floor(extract(epoch from clock_timestamp()))::bigint ts,
               gen_random_uuid() nonce,
               (select decrypted_secret from vault.decrypted_secrets where name='myvor_cron_secret' limit 1) secret,
               (select rtrim(decrypted_secret,'/') from vault.decrypted_secrets where name='myvor_project_url' limit 1) base_url
      )
      select net.http_post(
        url:=base_url||path,
        headers:=jsonb_build_object(
          'Content-Type','application/json',
          'x-myvor-timestamp',ts::text,
          'x-myvor-nonce',nonce::text,
          'x-myvor-signature',encode(extensions.hmac(path||E'\n'||ts::text||E'\n'||nonce::text,secret,'sha256'),'hex')
        ),
        body:=jsonb_build_object('source','supabase-ingestion-cron','requested_at',clock_timestamp()),
        timeout_milliseconds:=60000
      ) from req;
    $cmd$,r.path);
    perform cron.schedule(r.jobname,r.schedule,command_sql);
    old_job:=null;
  end loop;
end;
$$;