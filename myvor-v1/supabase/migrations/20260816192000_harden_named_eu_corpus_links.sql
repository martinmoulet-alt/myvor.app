-- Precision guard for dossier ↔ veille links around explicitly named EU instruments.
-- A French text may be auto-linked/canonised to such a dossier only when its official
-- text actually cites one of the EU instruments named in the dossier.

create or replace function public.myvor_named_eu_refs(
  p_title text,
  p_priority text[],
  p_reference_texts text[]
)
returns text[]
language plpgsql
stable
set search_path = pg_catalog, public, pg_temp
as $$
declare
  corpus text := concat_ws(' ', coalesce(p_title,''), array_to_string(coalesce(p_priority,array[]::text[]),' '), array_to_string(coalesce(p_reference_texts,array[]::text[]),' '));
  m text[];
  refs text[] := array[]::text[];
  n text;
begin
  for m in select regexp_matches(corpus, '(?:règlement|reglement|directive)[^0-9]{0,50}(20[0-9]{2})[[:space:]]*/[[:space:]]*0*([0-9]{1,5})', 'gi') loop
    n := coalesce(nullif(ltrim(m[2],'0'),''),'0');
    refs := array_append(refs, m[1] || '/' || n);
  end loop;

  for m in select regexp_matches(upper(corpus), '3(20[0-9]{2})[RL]0*([0-9]{1,4})', 'g') loop
    n := coalesce(nullif(ltrim(m[2],'0'),''),'0');
    refs := array_append(refs, m[1] || '/' || n);
  end loop;

  return coalesce((select array_agg(distinct x order by x) from unnest(refs) x), array[]::text[]);
end;
$$;

create or replace function public.myvor_text_mentions_eu_ref(p_text text, p_ref text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
  yr text := split_part(coalesce(p_ref,''),'/',1);
  no text := split_part(coalesce(p_ref,''),'/',2);
begin
  if yr !~ '^20[0-9]{2}$' or no !~ '^[0-9]{1,5}$' then return false; end if;
  return coalesce(p_text,'') ~* (yr || '[[:space:]]*/[[:space:]]*0*' || no || '([^0-9]|$)')
      or upper(coalesce(p_text,'')) ~ ('3' || yr || '[RL]0*' || no || '([^0-9]|$)');
end;
$$;

create or replace function public.myvor_watch_mentions_named_eu(p_watch_item_id uuid, p_refs text[])
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  txt text;
  r text;
begin
  select concat_ws(' ', w.title, c.source_text)
    into txt
  from public.watch_items w
  left join public.watch_item_content c on c.watch_item_id = w.id
  where w.id = p_watch_item_id;

  if txt is null then return false; end if;
  foreach r in array coalesce(p_refs,array[]::text[]) loop
    if public.myvor_text_mentions_eu_ref(txt,r) then return true; end if;
  end loop;
  return false;
end;
$$;

create or replace function public.myvor_guard_named_eu_auto_link()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  d_title text;
  d_priority text[];
  d_refs text[];
  named_refs text[];
  src text;
begin
  if new.status <> 'linked' then return new; end if;
  if coalesce(new.engine,'') ~* '(manual|accepted-suggestion|user)' then return new; end if;

  select d.title, d.watch_priority_phrases, d.reference_texts
    into d_title, d_priority, d_refs
  from public.dossiers d where d.id = new.dossier_id;

  named_refs := public.myvor_named_eu_refs(d_title,d_priority,d_refs);
  if coalesce(cardinality(named_refs),0)=0 then return new; end if;

  select w.source_url into src from public.watch_items w where w.id = new.watch_item_id;
  if coalesce(src,'') not ilike '%legifrance.gouv.fr%' then return new; end if;
  if public.myvor_watch_mentions_named_eu(new.watch_item_id,named_refs) then return new; end if;

  new.status := 'rejected';
  new.score := least(coalesce(new.score,0.39),0.39);
  new.reason := 'Rejet automatique : texte français sans référence démontrée au règlement ou à la directive UE explicitement suivi par le dossier.';
  new.engine := 'relevance-gate-named-eu-v1';
  new.link_justification := null;
  new.justified_at := coalesce(new.justified_at,now());
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_myvor_guard_named_eu_auto_link on public.watch_item_dossier_links;
create trigger trg_myvor_guard_named_eu_auto_link
before insert or update of status,score,reason,engine on public.watch_item_dossier_links
for each row execute function public.myvor_guard_named_eu_auto_link();

create or replace function public.myvor_filter_named_eu_reference_texts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  named_refs text[];
  ref text;
  fr_id text;
  doc_text text;
  eu_ref text;
  keep_ref boolean;
  cleaned text[] := array[]::text[];
begin
  named_refs := public.myvor_named_eu_refs(new.title,new.watch_priority_phrases,new.reference_texts);
  if coalesce(cardinality(named_refs),0)=0 then return new; end if;

  foreach ref in array coalesce(new.reference_texts,array[]::text[]) loop
    fr_id := substring(ref from '(JORFTEXT[0-9]+|JORFARTI[0-9]+|LEGIARTI[0-9]+|LEGITEXT[0-9]+|CNILTEXT[0-9]+)');
    if fr_id is null then
      cleaned := array_append(cleaned,ref);
      continue;
    end if;

    select concat_ws(' ',c.title,c.source_text) into doc_text
    from public.legal_catalog_fr c where c.document_id=fr_id limit 1;

    keep_ref := false;
    if doc_text is not null then
      foreach eu_ref in array named_refs loop
        if public.myvor_text_mentions_eu_ref(doc_text,eu_ref) then keep_ref := true; exit; end if;
      end loop;
    end if;
    if keep_ref then cleaned := array_append(cleaned,ref); end if;
  end loop;

  new.reference_texts := cleaned;
  return new;
end;
$$;

drop trigger if exists trg_myvor_filter_named_eu_reference_texts on public.dossiers;
create trigger trg_myvor_filter_named_eu_reference_texts
before insert or update of reference_texts, title, watch_priority_phrases on public.dossiers
for each row execute function public.myvor_filter_named_eu_reference_texts();
