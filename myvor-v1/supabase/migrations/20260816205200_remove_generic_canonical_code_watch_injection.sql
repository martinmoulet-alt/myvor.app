-- Static canonical codes belong to the dossier corpus, not to the live watch feed.
-- Remove the two automatic mechanisms that injected broad code roots from keywords
-- and then turned those roots into linked watch items.

drop trigger if exists dossiers_enrich_canonical_codes on public.dossiers;
drop trigger if exists dossiers_link_canonical_codes_after on public.dossiers;

drop function if exists private.enrich_dossier_canonical_codes();
drop function if exists private.link_dossier_canonical_codes_after();

-- Clean direct dossier links to static canonical Code entries already created.
delete from public.watch_item_dossier_links l
using public.watch_items w
where w.id=l.watch_item_id
  and lower(coalesce(w.nature,''))='code'
  and coalesce(w.source_name,'') ilike 'Légifrance — Corpus canonique%';
