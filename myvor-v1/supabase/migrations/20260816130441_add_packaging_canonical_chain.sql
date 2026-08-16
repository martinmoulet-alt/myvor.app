-- Canonical French packaging chain for PPWR / REP dossiers.

insert into public.legal_catalog_fr(document_id,title,nature,source_url,source_name,published_at,source_text,source_text_chars)
values
('JORFTEXT000052587525','Décret n° 2025-1081 du 17 novembre 2025 relatif aux emballages ainsi qu''aux déchets d''emballages et instituant la filière de responsabilité élargie des producteurs d''emballages consommés ou utilisés par les professionnels','Décret','https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000052587525','Légifrance — Journal officiel','2025-11-18T00:00:00Z','',0),
('JORFTEXT000045536300','Décret n° 2022-507 du 8 avril 2022 relatif à la proportion minimale d''emballages réemployés à mettre sur le marché annuellement','Décret','https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000045536300','Légifrance — Journal officiel','2022-04-09T00:00:00Z','',0),
('JORFTEXT000043458675','Décret n° 2021-517 du 29 avril 2021 relatif aux objectifs de réduction, de réutilisation et de réemploi, et de recyclage des emballages en plastique à usage unique pour la période 2021-2025','Décret','https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000043458675','Légifrance — Journal officiel','2021-04-30T00:00:00Z','',0)
on conflict(document_id) do update set title=excluded.title,nature=excluded.nature,source_url=excluded.source_url,source_name=excluded.source_name,published_at=excluded.published_at,updated_at=clock_timestamp();

create or replace function private.ensure_packaging_canonical_chain()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','pg_temp'
as $function$
declare
  v_text text;
  v_refs text[] := coalesce(new.reference_texts,array[]::text[]);
  v_item uuid;
  v_changed boolean := false;
  v_packaging boolean;
  v_professional_rep boolean;
  v_reuse boolean;
  v_plastic boolean;
  v_ref text;
begin
  v_text := translate(lower(
    coalesce(new.title,'')||' '||coalesce(new.objective,'')||' '||coalesce(new.context,'')||' '||
    array_to_string(coalesce(new.watch_keywords,array[]::text[]),' ')||' '||
    array_to_string(coalesce(new.watch_priority_phrases,array[]::text[]),' ')
  ),'àâäçéèêëîïôöùûü','aaaceeeeiioouuu');

  v_packaging := v_text ~ '(emballag|ppwr|responsabilite elargie du producteur|eco[- ]organisme)';
  if not v_packaging then return new; end if;

  v_professional_rep := v_text ~ '(professionnel|responsabilite elargie du producteur|eco[- ]organisme|(^|[^a-z])rep([^a-z]|$))';
  v_reuse := v_text ~ '(reemploi|reutilisation)';
  v_plastic := v_text ~ '(plastique|usage unique)';

  if v_professional_rep then
    v_ref := 'JORFTEXT000052587525 — Décret n° 2025-1081 du 17 novembre 2025 relatif aux emballages ainsi qu''aux déchets d''emballages et instituant la filière de responsabilité élargie des producteurs d''emballages consommés ou utilisés par les professionnels';
    if not exists(select 1 from unnest(v_refs) r where r like 'JORFTEXT000052587525 — %') then v_refs:=array_append(v_refs,v_ref); v_changed:=true; end if;
    insert into public.watch_items(user_id,organization_id,created_by,dossier_id,title,nature,source_url,source_name,urgency,published_at,qualification_confidence,qualification_reason,qualified_at,change_type,change_summary,change_computed_at,change_engine)
    values(new.user_id,new.organization_id,coalesce(new.created_by,new.user_id),null,
      'Décret n° 2025-1081 du 17 novembre 2025 relatif aux emballages ainsi qu''aux déchets d''emballages et instituant la filière de responsabilité élargie des producteurs d''emballages consommés ou utilisés par les professionnels',
      'Décret','https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000052587525','Légifrance — Corpus canonique','moyen','2025-11-18T00:00:00Z',.999,
      'Corpus canonique FR emballages : décret structurant la REP des emballages consommés ou utilisés par les professionnels, directement pertinent pour le dossier.',clock_timestamp(),'application',
      'Met en œuvre le régime de responsabilité élargie du producteur applicable aux emballages professionnels et précise les règles de gestion des déchets correspondants.',clock_timestamp(),'canonical-packaging-chain-v1')
    on conflict(organization_id,source_url) do update set published_at=coalesce(public.watch_items.published_at,excluded.published_at),source_name=coalesce(public.watch_items.source_name,excluded.source_name);
    select id into v_item from public.watch_items where organization_id=new.organization_id and source_url='https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000052587525' limit 1;
    if v_item is not null then
      insert into public.watch_item_dossier_links(watch_item_id,dossier_id,organization_id,score,status,reason,engine,updated_at)
      values(v_item,new.id,new.organization_id,.999,'linked','Chaîne canonique emballages : le décret 2025-1081 structure la REP des emballages professionnels et complète le cadre AGEC/PPWR.','canonical-packaging-chain-v1',clock_timestamp())
      on conflict(watch_item_id,dossier_id) do update set score=.999,status='linked',reason=excluded.reason,engine=excluded.engine,updated_at=excluded.updated_at;
    end if;
  end if;

  if v_reuse then
    v_ref := 'JORFTEXT000045536300 — Décret n° 2022-507 du 8 avril 2022 relatif à la proportion minimale d''emballages réemployés à mettre sur le marché annuellement';
    if not exists(select 1 from unnest(v_refs) r where r like 'JORFTEXT000045536300 — %') then v_refs:=array_append(v_refs,v_ref); v_changed:=true; end if;
    insert into public.watch_items(user_id,organization_id,created_by,dossier_id,title,nature,source_url,source_name,urgency,published_at,qualification_confidence,qualification_reason,qualified_at,change_type,change_summary,change_computed_at,change_engine)
    values(new.user_id,new.organization_id,coalesce(new.created_by,new.user_id),null,
      'Décret n° 2022-507 du 8 avril 2022 relatif à la proportion minimale d''emballages réemployés à mettre sur le marché annuellement',
      'Décret','https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000045536300','Légifrance — Corpus canonique','faible','2022-04-09T00:00:00Z',.999,
      'Corpus historique FR emballages : texte de référence sur les proportions minimales d''emballages réemployés, conservé comme socle du dossier.',clock_timestamp(),'socle_initial',
      'Fixe les proportions minimales annuelles d''emballages réemployés ou réutilisés à mettre sur le marché, avec des échéances qui atteignent notamment 2026.',clock_timestamp(),'canonical-packaging-chain-v1')
    on conflict(organization_id,source_url) do update set published_at=coalesce(public.watch_items.published_at,excluded.published_at),source_name=coalesce(public.watch_items.source_name,excluded.source_name);
    select id into v_item from public.watch_items where organization_id=new.organization_id and source_url='https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000045536300' limit 1;
    if v_item is not null then
      insert into public.watch_item_dossier_links(watch_item_id,dossier_id,organization_id,score,status,reason,engine,updated_at)
      values(v_item,new.id,new.organization_id,.999,'linked','Chaîne canonique emballages : le décret 2022-507 constitue le socle national du réemploi/réutilisation des emballages.','canonical-packaging-chain-v1',clock_timestamp())
      on conflict(watch_item_id,dossier_id) do update set score=.999,status='linked',reason=excluded.reason,engine=excluded.engine,updated_at=excluded.updated_at;
    end if;
  end if;

  if v_plastic then
    v_ref := 'JORFTEXT000043458675 — Décret n° 2021-517 du 29 avril 2021 relatif aux objectifs de réduction, de réutilisation et de réemploi, et de recyclage des emballages en plastique à usage unique pour la période 2021-2025';
    if not exists(select 1 from unnest(v_refs) r where r like 'JORFTEXT000043458675 — %') then v_refs:=array_append(v_refs,v_ref); v_changed:=true; end if;
    insert into public.watch_items(user_id,organization_id,created_by,dossier_id,title,nature,source_url,source_name,urgency,published_at,qualification_confidence,qualification_reason,qualified_at,change_type,change_summary,change_computed_at,change_engine)
    values(new.user_id,new.organization_id,coalesce(new.created_by,new.user_id),null,
      'Décret n° 2021-517 du 29 avril 2021 relatif aux objectifs de réduction, de réutilisation et de réemploi, et de recyclage des emballages en plastique à usage unique pour la période 2021-2025',
      'Décret','https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000043458675','Légifrance — Corpus canonique','faible','2021-04-30T00:00:00Z',.999,
      'Corpus historique FR emballages : trajectoire nationale de réduction, réemploi et recyclage des emballages plastiques à usage unique.',clock_timestamp(),'socle_initial',
      'Fixe la trajectoire 2021-2025 de réduction, réutilisation, réemploi et recyclage des emballages plastiques à usage unique.',clock_timestamp(),'canonical-packaging-chain-v1')
    on conflict(organization_id,source_url) do update set published_at=coalesce(public.watch_items.published_at,excluded.published_at),source_name=coalesce(public.watch_items.source_name,excluded.source_name);
    select id into v_item from public.watch_items where organization_id=new.organization_id and source_url='https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000043458675' limit 1;
    if v_item is not null then
      insert into public.watch_item_dossier_links(watch_item_id,dossier_id,organization_id,score,status,reason,engine,updated_at)
      values(v_item,new.id,new.organization_id,.999,'linked','Chaîne canonique emballages : le décret 2021-517 fournit le socle historique français relatif aux emballages plastiques à usage unique.','canonical-packaging-chain-v1',clock_timestamp())
      on conflict(watch_item_id,dossier_id) do update set score=.999,status='linked',reason=excluded.reason,engine=excluded.engine,updated_at=excluded.updated_at;
    end if;
  end if;

  if v_changed then update public.dossiers set reference_texts=v_refs where id=new.id; end if;
  return new;
end;
$function$;

drop trigger if exists dossiers_ensure_packaging_canonical_chain on public.dossiers;
create trigger dossiers_ensure_packaging_canonical_chain
after insert or update of title,objective,context,watch_keywords,watch_priority_phrases
on public.dossiers
for each row when (pg_trigger_depth() < 2)
execute function private.ensure_packaging_canonical_chain();
