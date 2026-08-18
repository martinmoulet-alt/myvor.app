create or replace function public.enqueue_next_dossier_intelligence()
returns bigint
language plpgsql
security definer
set search_path to 'pg_catalog','public','pg_temp'
as $function$
declare
  v_id uuid;
begin
  update public.dossier_intelligence_state
  set last_finished_at = clock_timestamp(),
      last_status = 'error',
      last_error = coalesce(nullif(last_error,''),'Traitement interrompu avant finalisation.'),
      updated_at = clock_timestamp()
  where last_status in ('discovering_fr_eu','validating')
    and last_started_at < clock_timestamp() - interval '10 minutes'
    and (last_finished_at is null or last_finished_at < last_started_at);

  select d.id into v_id
  from public.dossiers d
  left join public.dossier_intelligence_state s on s.dossier_id=d.id
  where coalesce(d.status,'') <> 'Archivé'
    and (s.last_started_at is null or s.last_started_at < clock_timestamp()-interval '30 minutes')
  order by coalesce(s.last_started_at,'1970-01-01'::timestamptz),d.created_at desc
  limit 1;

  if v_id is null then return null; end if;
  return public.invoke_dossier_intelligence_once(v_id);
end;
$function$;

revoke all on function public.enqueue_next_dossier_intelligence() from public, anon, authenticated;
grant execute on function public.enqueue_next_dossier_intelligence() to service_role;
