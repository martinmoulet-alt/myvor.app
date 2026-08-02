alter table public.veille_settings
  alter column auto_link_threshold set default 0.75;

update public.veille_settings
set
  auto_link_threshold = 0.75,
  updated_at = now();
