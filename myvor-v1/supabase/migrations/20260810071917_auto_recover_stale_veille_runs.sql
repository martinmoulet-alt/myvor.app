create or replace function private.recover_stale_veille_run()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $$
begin
  if new.status='running' then
    update public.veille_runs
    set status='error',
        finished_at=coalesce(finished_at,clock_timestamp()),
        message=coalesce(message,'Run expiré automatiquement après interruption du worker.')
    where user_id=new.user_id
      and status='running'
      and started_at<clock_timestamp()-interval '10 minutes';
  end if;
  return new;
end;
$$;
revoke all on function private.recover_stale_veille_run() from public,anon,authenticated;

drop trigger if exists veille_runs_recover_stale on public.veille_runs;
create trigger veille_runs_recover_stale
before insert on public.veille_runs
for each row execute function private.recover_stale_veille_run();
