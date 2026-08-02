alter table public.dossiers
  add column if not exists sector text,
  add column if not exists activity text,
  add column if not exists strategic_issues text[] not null default '{}'::text[],
  add column if not exists risks_to_avoid text[] not null default '{}'::text[],
  add column if not exists opportunities text[] not null default '{}'::text[],
  add column if not exists client_position text,
  add column if not exists key_actors text[] not null default '{}'::text[],
  add column if not exists watch_topics text[] not null default '{}'::text[],
  add column if not exists watch_subtopics text[] not null default '{}'::text[],
  add column if not exists reference_texts text[] not null default '{}'::text[],
  add column if not exists key_deadlines text[] not null default '{}'::text[],
  add column if not exists internal_notes text;

create index if not exists dossiers_watch_topics_gin
  on public.dossiers using gin (watch_topics);

create index if not exists dossiers_watch_subtopics_gin
  on public.dossiers using gin (watch_subtopics);
