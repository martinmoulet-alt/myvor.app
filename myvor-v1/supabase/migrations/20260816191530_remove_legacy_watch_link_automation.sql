-- Retire only obsolete watch-link orchestration.
-- Decision Engine, ingestion, security and tenant-integrity functions remain untouched.

drop trigger if exists "00_guard_canonical_corpus" on public.watch_item_dossier_links;
drop trigger if exists "00_guard_canonical_corpus" on public.watch_items;
drop trigger if exists watch_items_bridge_legacy_dossier on public.watch_items;
drop trigger if exists trg_sync_legacy_watch_link_to_m2m on public.watch_items;
drop trigger if exists trg_watch_link_justification on public.watch_items;
drop trigger if exists "01_promote_ai_direct_to_ra" on public.watch_items;
drop trigger if exists trg_guard_veille_auto_link_requires_explicit_keywords on public.watch_items;
drop trigger if exists watch_items_enforce_suggestion_threshold on public.watch_items;
drop trigger if exists trg_myvor_guard_named_eu_auto_link on public.watch_item_dossier_links;

drop function if exists private.guard_m2m_against_canonical_corpus();
drop function if exists private.guard_watch_against_canonical_corpus();
drop function if exists private.bridge_legacy_watch_dossier_to_m2m();
drop function if exists public.sync_legacy_watch_link_to_m2m();
drop function if exists public.ensure_watch_link_justification();
drop function if exists public.promote_ai_direct_watch_to_ra();
drop function if exists public.guard_veille_auto_link_requires_explicit_keywords();
drop function if exists public.enforce_watch_suggestion_threshold();
drop function if exists public.myvor_guard_named_eu_auto_link();
