-- Myvor dossier ↔ veille hardening — FR legal catalog, deep dossier profile and RGPD national complement.

create table if not exists public.legal_catalog_fr (
  document_id text primary key,
  title text not null,
  nature text,
  source_url text not null,
  source_name text,
  published_at timestamptz,
  source_text text not null default '',
  source_text_chars integer not null default 0,
  first_seen_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create unique index if not exists legal_catalog_fr_source_url_uidx on public.legal_catalog_fr(source_url);
create index if not exists legal_catalog_fr_published_idx on public.legal_catalog_fr(published_at desc);
create index if not exists legal_catalog_fr_title_fts_idx on public.legal_catalog_fr using gin(to_tsvector('french',coalesce(title,'')));
grant select,insert,update,delete on public.legal_catalog_fr to service_role;

create or replace function public.search_legal_catalog_fr(p_queries text[], p_limit integer default 20)
returns table(document_id text,title text,nature text,source_url text,published_at timestamptz,source_text text,score numeric)
language sql
security definer
set search_path to 'pg_catalog','public','pg_temp'
as $function$
with q0 as (
  select lower(regexp_replace(trim(value),'\s+',' ','g')) query
  from unnest(coalesce(p_queries,array[]::text[])) value
  where length(trim(value))>=4
), scope as (
  select
    bool_or(query like '%outre-mer%' or query like '%outre mer%') outre_mer,
    bool_or(query like '%polynésie%' or query like '%polynesie%') polynesie,
    bool_or(query like '%nouvelle-calédonie%' or query like '%nouvelle caledonie%') nouvelle_caledonie,
    bool_or(query like '%guadeloupe%') guadeloupe,
    bool_or(query like '%martinique%') martinique,
    bool_or(query like '%guyane%') guyane,
    bool_or(query like '%réunion%' or query like '%reunion%') reunion
  from q0
), q as (
  select query from q0 where query not in (
    'santé publique','sante publique','transport de personnes','mobilité urbaine','mobilite urbaine',
    'plateforme de mobilité','plateforme de mobilite','politique agricole commune','souveraineté alimentaire',
    'souverainete alimentaire','innovation thérapeutique','innovation therapeutique','réseaux et prix de l’énergie',
    'reseaux et prix de l energie','protection des données','protection des donnees','traitement des données',
    'traitement des donnees','transfert de données','transfert de donnees'
  )
), ranked as (
  select c.*,
    max(case when lower(c.title) like '%'||q.query||'%' then 1.0
             else ts_rank_cd(to_tsvector('french',coalesce(c.title,'')),plainto_tsquery('french',q.query))::numeric end) score
  from public.legal_catalog_fr c cross join q cross join scope s
  where (lower(c.title) like '%'||q.query||'%' or to_tsvector('french',coalesce(c.title,'')) @@ plainto_tsquery('french',q.query))
    and (s.outre_mer or (lower(c.title) not like '%outre-mer%' and lower(c.title) not like '%outre mer%'))
    and (s.polynesie or lower(c.title) not like '%polynésie%')
    and (s.nouvelle_caledonie or (lower(c.title) not like '%nouvelle-calédonie%' and lower(c.title) not like '%nouvelle calédonie%'))
    and (s.guadeloupe or lower(c.title) not like '%guadeloupe%')
    and (s.martinique or lower(c.title) not like '%martinique%')
    and (s.guyane or lower(c.title) not like '%guyane%')
    and (s.reunion or lower(c.title) not like '%réunion%')
  group by c.document_id,c.title,c.nature,c.source_url,c.source_name,c.published_at,c.source_text,c.source_text_chars,c.first_seen_at,c.updated_at
)
select document_id,title,nature,source_url,published_at,source_text,score
from ranked where score>=0.02
order by score desc,
  case when lower(title) like 'loi %' then 5 when lower(title) like 'ordonnance %' then 5 when lower(title) like 'décret %' or lower(title) like 'decret %' then 4 when lower(title) like 'arrêté %' or lower(title) like 'arrete %' then 2 else 0 end desc,
  published_at desc nulls last
limit greatest(1,least(coalesce(p_limit,20),100));
$function$;

create or replace function private.enqueue_dossier_profile_autofill()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','extensions','net','vault','pg_temp'
as $function$
declare v_has_deep_profile boolean;
begin
  if coalesce(btrim(new.title),'')='' or coalesce(btrim(new.objective),'')='' then return new; end if;
  v_has_deep_profile :=
    coalesce(length(btrim(new.sector)),0)>=3 and coalesce(length(btrim(new.activity)),0)>=220 and
    coalesce(cardinality(new.strategic_issues),0)>=8 and coalesce(cardinality(new.risks_to_avoid),0)>=8 and
    coalesce(cardinality(new.opportunities),0)>=8 and coalesce(length(btrim(new.client_position)),0)>=450 and
    coalesce(cardinality(new.key_actors),0)>=8 and coalesce(cardinality(new.watch_topics),0)>=6 and
    coalesce(cardinality(new.watch_subtopics),0)>=10;
  if v_has_deep_profile then return new; end if;
  perform public.invoke_dossier_profile_autofill_once(new.id);
  return new;
exception when others then
  raise warning 'dossier strategic profile enqueue failed for %: %',new.id,sqlerrm;
  return new;
end;
$function$;

create or replace function private.ensure_french_rgpd_complement()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','pg_temp'
as $function$
declare
  v_fr_ref constant text := 'JORFTEXT000000886460 — LOI n° 78-17 du 6 janvier 1978 relative à l''informatique, aux fichiers et aux libertés';
  v_url constant text := 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000886460';
  v_watch_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if not exists(select 1 from unnest(coalesce(new.reference_texts,'{}'::text[])) r where r ilike '32016R0679%') then return new; end if;
  if not exists(select 1 from unnest(coalesce(new.reference_texts,'{}'::text[])) r where r ilike 'JORFTEXT000000886460%') then
    update public.dossiers set reference_texts=array_append(coalesce(new.reference_texts,'{}'::text[]),v_fr_ref) where id=new.id;
  end if;
  select id into v_watch_id from public.watch_items where organization_id=new.organization_id and source_url=v_url limit 1;
  if v_watch_id is not null then
    insert into public.watch_item_dossier_links(watch_item_id,dossier_id,organization_id,score,status,reason,engine,updated_at)
    values(v_watch_id,new.id,new.organization_id,.999,'linked','Complément national RGPD : la loi Informatique et Libertés complète le cadre applicable en France.','canonical-fr-rgpd-complement-v1',v_now)
    on conflict(watch_item_id,dossier_id) do update set score=.999,status='linked',reason=excluded.reason,engine=excluded.engine,updated_at=v_now;
  end if;
  return new;
end;
$function$;

drop trigger if exists dossiers_ensure_french_rgpd_complement on public.dossiers;
create trigger dossiers_ensure_french_rgpd_complement after update of reference_texts on public.dossiers
for each row execute function private.ensure_french_rgpd_complement();
