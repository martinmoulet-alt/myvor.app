revoke all on function public.invoke_dossier_intelligence_once(uuid) from public,anon,authenticated;
grant execute on function public.invoke_dossier_intelligence_once(uuid) to service_role;

revoke all on function public.refresh_dossier_intelligence(uuid) from public,anon,authenticated;
grant execute on function public.refresh_dossier_intelligence(uuid) to service_role;
