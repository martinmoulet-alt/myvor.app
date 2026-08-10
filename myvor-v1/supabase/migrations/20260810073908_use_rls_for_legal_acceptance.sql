create or replace function public.accept_myvor_legal_terms(p_version text)
returns boolean
language plpgsql
security invoker
set search_path to 'pg_catalog','public','pg_temp'
as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_version is null or p_version <> '2026-08-10' then raise exception 'Unsupported legal version'; end if;
  perform set_config('myvor.legal_acceptance','1',true);
  update public.user_profiles
     set terms_accepted_at=coalesce(terms_accepted_at,clock_timestamp()),
         privacy_accepted_at=coalesce(privacy_accepted_at,clock_timestamp()),
         legal_version=p_version,
         updated_at=clock_timestamp()
   where user_id=uid;
  if not found then raise exception 'User profile unavailable'; end if;
  return true;
end
$$;
revoke all on function public.accept_myvor_legal_terms(text) from public,anon;
grant execute on function public.accept_myvor_legal_terms(text) to authenticated;
