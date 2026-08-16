-- Make the packaging chain survive profile refreshes and the canonical link guard.

create or replace function private.enrich_packaging_reference_texts()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','pg_temp'
as $function$
declare
  v_text text;
  v_refs text[] := coalesce(new.reference_texts,array[]::text[]);
  v_ref text;
begin
  v_text := translate(lower(
    coalesce(new.title,'')||' '||coalesce(new.objective,'')||' '||coalesce(new.context,'')||' '||
    array_to_string(coalesce(new.watch_keywords,array[]::text[]),' ')||' '||
    array_to_string(coalesce(new.watch_priority_phrases,array[]::text[]),' ')
  ),'àâäçéèêëîïôöùûü','aaaceeeeiioouuu');

  if v_text !~ '(emballag|ppwr|responsabilite elargie du producteur|eco[- ]organisme)' then return new; end if;

  if v_text ~ '(professionnel|responsabilite elargie du producteur|eco[- ]organisme|(^|[^a-z])rep([^a-z]|$))' then
    v_ref := 'JORFTEXT000052587525 — Décret n° 2025-1081 du 17 novembre 2025 relatif aux emballages ainsi qu''aux déchets d''emballages et instituant la filière de responsabilité élargie des producteurs d''emballages consommés ou utilisés par les professionnels';
    if not exists(select 1 from unnest(v_refs) r where r like 'JORFTEXT000052587525 — %') then v_refs:=array_append(v_refs,v_ref); end if;
  end if;

  if v_text ~ '(reemploi|reutilisation)' then
    v_ref := 'JORFTEXT000045536300 — Décret n° 2022-507 du 8 avril 2022 relatif à la proportion minimale d''emballages réemployés à mettre sur le marché annuellement';
    if not exists(select 1 from unnest(v_refs) r where r like 'JORFTEXT000045536300 — %') then v_refs:=array_append(v_refs,v_ref); end if;
  end if;

  if v_text ~ '(plastique|usage unique)' then
    v_ref := 'JORFTEXT000043458675 — Décret n° 2021-517 du 29 avril 2021 relatif aux objectifs de réduction, de réutilisation et de réemploi, et de recyclage des emballages en plastique à usage unique pour la période 2021-2025';
    if not exists(select 1 from unnest(v_refs) r where r like 'JORFTEXT000043458675 — %') then v_refs:=array_append(v_refs,v_ref); end if;
  end if;

  new.reference_texts := v_refs;
  return new;
end;
$function$;

drop trigger if exists "00_dossiers_enrich_packaging_refs" on public.dossiers;
create trigger "00_dossiers_enrich_packaging_refs"
before insert or update of reference_texts,title,objective,context,watch_keywords,watch_priority_phrases
on public.dossiers
for each row execute function private.enrich_packaging_reference_texts();

create or replace function private.canonical_dossier_accepts_watch(p_dossier_id uuid,p_source_url text)
returns boolean
language plpgsql
stable security definer
set search_path to 'pg_catalog','public','private','pg_temp'
as $function$
declare
  v_refs text[];
  v_org uuid;
  v_key text;
  v_url text:=upper(coalesce(p_source_url,''));
  v_published timestamptz;
  v_engine text;
  v_reason text;
  v_text text;
begin
  if p_dossier_id is null then return true; end if;
  select reference_texts,organization_id,
    translate(lower(coalesce(title,'')||' '||coalesce(objective,'')||' '||coalesce(context,'')||' '||array_to_string(coalesce(watch_keywords,array[]::text[]),' ')||' '||array_to_string(coalesce(watch_priority_phrases,array[]::text[]),' ')),'àâäçéèêëîïôöùûü','aaaceeeeiioouuu')
    into v_refs,v_org,v_text
  from public.dossiers where id=p_dossier_id;
  if coalesce(cardinality(v_refs),0)=0 then return true; end if;

  if v_url ~ 'EUR-LEX\\.EUROPA\\.EU/.+CELEX:' then
    v_key:=substring(v_url from 'CELEX:([^&?#]+)');
  elsif v_url ~ 'LEGIFRANCE\\.GOUV\\.FR/' then
    v_key:=substring(v_url from '(JORFTEXT[0-9]+|JORFARTI[0-9]+|JORFSCTA[0-9]+|LEGIARTI[0-9]+|LEGITEXT[0-9]+|LEGISCTA[0-9]+|CNILTEXT[0-9]+)');
  else
    return true;
  end if;
  if coalesce(v_key,'')='' then return true; end if;

  if exists(select 1 from unnest(v_refs) ref where upper(ref) like '%'||v_key||'%') then return true; end if;

  if v_key='JORFTEXT000052587525'
     and v_text ~ '(emballag|ppwr)'
     and v_text ~ '(professionnel|responsabilite elargie du producteur|eco[- ]organisme|(^|[^a-z])rep([^a-z]|$))' then return true; end if;
  if v_key='JORFTEXT000045536300'
     and v_text ~ '(emballag|ppwr)'
     and v_text ~ '(reemploi|reutilisation)' then return true; end if;
  if v_key='JORFTEXT000043458675'
     and v_text ~ '(emballag|ppwr)'
     and v_text ~ '(plastique|usage unique)' then return true; end if;

  select w.published_at,w.link_justification_engine,w.qualification_reason
    into v_published,v_engine,v_reason
  from public.watch_items w
  where w.organization_id=v_org and upper(w.source_url)=v_url
  limit 1;

  if v_published>=clock_timestamp()-interval '370 days'
     and coalesce(v_reason,'') !~* '(rejeté|rejete|aucun effet direct|hors périmètre|hors perimetre|corpus applicable v10|prefiltre|préfiltre)'
     and (
       coalesce(v_reason,'') ~* 'pertinent direct'
       or coalesce(v_reason,'') ~* '^(Filtre IA|Règles dossier v14|Regles dossier v14)'
       or coalesce(v_engine,'') in ('link-qualification-v8-history-m2m-50-40','link-qualification-v6-causal-recheck')
     )
  then return true; end if;

  return false;
end;
$function$;
