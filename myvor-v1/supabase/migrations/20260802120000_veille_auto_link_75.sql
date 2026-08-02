-- Harmonise le seuil de rattachement automatique de la veille à 75 %.

alter table public.veille_settings
  alter column auto_link_threshold set default 0.750;

update public.veille_settings
set auto_link_threshold = 0.750,
    updated_at = now()
where auto_link_threshold = 0.900;
