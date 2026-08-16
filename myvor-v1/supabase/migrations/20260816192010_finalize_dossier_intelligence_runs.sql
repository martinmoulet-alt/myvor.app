-- Make each successful dossier-intelligence run authoritative for its dossier corpus.
-- Parliamentary dossiers/reports remain useful corpus context but are not Veille events.

create or replace function private.finalize_dossier_intelligence_run()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','pg_temp'
as $function$
begin
  if new.last_status <> 'ok' or new.last_finished_at is null then
    return new;
  end if;

  delete from public.dossier_corpus dc
  where dc.dossier_id = new.dossier_id
    and new.last_started_at is not null
    and dc.updated_at < new.last_started_at;

  delete from public.watch_item_dossier_links l
  using public.watch_items w
  where l.dossier_id = new.dossier_id
    and l.watch_item_id = w.id
    and coalesce(l.engine,'') like 'dossier-intelligence-%'
    and (
      lower(coalesce(w.source_url,'')) like '%senat.fr%'
      or lower(coalesce(w.source_url,'')) like '%assemblee-nationale.fr%'
    )
    and lower(coalesce(w.title,'')) ~ '(dossier|rapport|proposition|parcours législatif|parcours legislatif)';

  return new;
end;
$function$;

drop trigger if exists dossier_intelligence_finalize_run on public.dossier_intelligence_state;
create trigger dossier_intelligence_finalize_run
after insert or update of last_status,last_finished_at
on public.dossier_intelligence_state
for each row
when (new.last_status = 'ok')
execute function private.finalize_dossier_intelligence_run();
