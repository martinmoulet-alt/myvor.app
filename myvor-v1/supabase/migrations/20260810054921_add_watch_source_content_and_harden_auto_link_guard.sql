create table if not exists public.watch_item_content (
  watch_item_id uuid primary key references public.watch_items(id) on delete cascade,
  organization_id uuid not null,
  source_text text not null default '',
  source_text_chars integer not null default 0 check (source_text_chars >= 0),
  source_sha256 text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists watch_item_content_organization_id_idx
  on public.watch_item_content (organization_id);

alter table public.watch_item_content enable row level security;
revoke all on table public.watch_item_content from anon, authenticated;
grant select, insert, update, delete on table public.watch_item_content to service_role;

create or replace function public.guard_veille_auto_link_requires_explicit_keywords()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  dossier_keywords text[];
begin
  if new.dossier_id is not null
     and new.qualified_at is distinct from old.qualified_at
     and coalesce(new.qualification_reason,'') like 'Règles dossier v%—%'
  then
    select coalesce(d.watch_keywords, '{}'::text[])
      into dossier_keywords
      from public.dossiers d
     where d.id = new.dossier_id;

    if coalesce(cardinality(dossier_keywords),0) = 0 then
      new.suggested_dossier_id := new.dossier_id;
      new.dossier_id := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_veille_auto_link_requires_explicit_keywords on public.watch_items;
create trigger trg_guard_veille_auto_link_requires_explicit_keywords
before update on public.watch_items
for each row
execute function public.guard_veille_auto_link_requires_explicit_keywords();
