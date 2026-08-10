update public.veille_runs
set status='error',finished_at=coalesce(finished_at,now()),message=coalesce(message,'Run expiré automatiquement par le garde-fou de concurrence.')
where status='running' and started_at<now()-interval '10 minutes';

create unique index if not exists veille_runs_one_running_per_user_uidx
on public.veille_runs(user_id) where status='running';

create table if not exists private.veille_worker_leases (
  worker text primary key,
  holder uuid not null,
  lease_until timestamptz not null,
  acquired_at timestamptz not null default now(),
  constraint veille_worker_leases_worker_check check(worker in ('catalog','qualifier'))
);
revoke all on table private.veille_worker_leases from public,anon,authenticated;

create or replace function public.acquire_veille_worker_lease(p_worker text,p_holder uuid,p_seconds integer default 90)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $$
declare v_count integer;
begin
  if p_worker not in ('catalog','qualifier') or p_holder is null then return false; end if;
  p_seconds:=greatest(15,least(coalesce(p_seconds,90),180));
  insert into private.veille_worker_leases(worker,holder,lease_until,acquired_at)
  values(p_worker,p_holder,clock_timestamp()+make_interval(secs=>p_seconds),clock_timestamp())
  on conflict(worker) do update
    set holder=excluded.holder,lease_until=excluded.lease_until,acquired_at=excluded.acquired_at
    where private.veille_worker_leases.lease_until<clock_timestamp();
  get diagnostics v_count=row_count;
  return v_count=1;
end $$;
revoke all on function public.acquire_veille_worker_lease(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.acquire_veille_worker_lease(text,uuid,integer) to service_role;

create or replace function public.release_veille_worker_lease(p_worker text,p_holder uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $$
declare v_count integer;
begin
  delete from private.veille_worker_leases where worker=p_worker and holder=p_holder;
  get diagnostics v_count=row_count;
  return v_count=1;
end $$;
revoke all on function public.release_veille_worker_lease(text,uuid) from public,anon,authenticated;
grant execute on function public.release_veille_worker_lease(text,uuid) to service_role;
