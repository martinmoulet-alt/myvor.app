-- Myvor P1 — action lifecycle, duplicate preservation and generation idempotency.

alter table public.actions add column if not exists completed_at timestamptz;
alter table public.actions add column if not exists completed_by uuid;
alter table public.actions add column if not exists superseded_by uuid references public.actions(id) on delete set null;
alter table public.actions add column if not exists superseded_at timestamptz;

create index if not exists actions_superseded_by_idx on public.actions(superseded_by);
create index if not exists actions_completed_at_idx on public.actions(completed_at desc) where completed_at is not null;

-- Preserve historical duplicate rows, but keep only the newest row canonical.
with ranked as (
  select
    id,
    row_number() over (
      partition by dossier_id,
        lower(regexp_replace(btrim(type),'\s+',' ','g')),
        lower(regexp_replace(btrim(title),'\s+',' ','g'))
      order by created_at desc,id desc
    ) as rn,
    first_value(id) over (
      partition by dossier_id,
        lower(regexp_replace(btrim(type),'\s+',' ','g')),
        lower(regexp_replace(btrim(title),'\s+',' ','g'))
      order by created_at desc,id desc
      rows between unbounded preceding and unbounded following
    ) as keep_id
  from public.actions
  where superseded_by is null
)
update public.actions a
set superseded_by=r.keep_id,
    superseded_at=clock_timestamp(),
    status='termine',
    completed_at=null,
    completed_by=null,
    updated_at=clock_timestamp()
from ranked r
where r.rn>1 and a.id=r.id;

-- One canonical action identity per dossier. A completed action is reopened, not recreated.
create unique index if not exists actions_canonical_identity_uidx
on public.actions (
  (coalesce(dossier_id::text,'')),
  (lower(regexp_replace(btrim(type),'\s+',' ','g'))),
  (lower(regexp_replace(btrim(title),'\s+',' ','g')))
)
where superseded_by is null;

create or replace function private.actions_prevent_duplicate_insert()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog','public','private','pg_temp'
as $function$
begin
  if exists (
    select 1
    from public.actions a
    where a.superseded_by is null
      and a.dossier_id is not distinct from new.dossier_id
      and lower(regexp_replace(btrim(a.type),'\s+',' ','g')) = lower(regexp_replace(btrim(new.type),'\s+',' ','g'))
      and lower(regexp_replace(btrim(a.title),'\s+',' ','g')) = lower(regexp_replace(btrim(new.title),'\s+',' ','g'))
  ) then
    return null;
  end if;
  return new;
end;
$function$;

drop trigger if exists actions_prevent_duplicate_insert on public.actions;
create trigger actions_prevent_duplicate_insert
before insert on public.actions
for each row execute function private.actions_prevent_duplicate_insert();

create or replace function private.actions_stamp_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path to 'pg_catalog','public','private','auth','pg_temp'
as $function$
begin
  if old.superseded_by is not null and new.status='a_faire' then
    raise exception 'Une action archivée comme doublon ne peut pas être réouverte.';
  end if;

  if new.superseded_by is distinct from old.superseded_by and new.superseded_by is not null then
    new.superseded_at := coalesce(new.superseded_at,clock_timestamp());
    new.status := 'termine';
    new.completed_at := null;
    new.completed_by := null;
  elsif new.superseded_by is null and new.status='termine' and old.status is distinct from 'termine' then
    new.completed_at := clock_timestamp();
    new.completed_by := auth.uid();
  elsif new.superseded_by is null and new.status='a_faire' and old.status is distinct from 'a_faire' then
    new.completed_at := null;
    new.completed_by := null;
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$function$;

drop trigger if exists actions_stamp_lifecycle on public.actions;
create trigger actions_stamp_lifecycle
before update of status,superseded_by on public.actions
for each row execute function private.actions_stamp_lifecycle();
