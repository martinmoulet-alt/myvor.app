create or replace function public.ensure_watch_link_justification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d_title text;
  d_objective text;
  evidence jsonb := '[]'::jsonb;
begin
  if new.dossier_id is null or new.link_justification is not null then
    return new;
  end if;

  select title, objective
    into d_title, d_objective
  from public.dossiers
  where id = new.dossier_id;

  if nullif(trim(coalesce(new.qualification_reason,'')),'') is not null then
    evidence := jsonb_build_array(left(trim(new.qualification_reason),260));
  end if;

  new.link_justification := jsonb_build_object(
    'summary', 'Ce texte a été associé à ce dossier à partir des critères de veille ou d’une validation utilisateur.',
    'objective_link', case
      when nullif(trim(coalesce(d_objective,'')),'') is not null then left('Objectif suivi : ' || trim(d_objective),320)
      when nullif(trim(coalesce(d_title,'')),'') is not null then left('Dossier suivi : ' || trim(d_title),320)
      else 'Rattachement au dossier sélectionné.'
    end,
    'evidence', evidence,
    'consequence', 'Le texte est désormais pris en compte dans le suivi opérationnel du dossier.',
    'status', 'confirmed'
  );
  new.link_justification_engine := coalesce(new.link_justification_engine,'fallback-link-trigger-v1');
  new.link_justified_at := coalesce(new.link_justified_at,now());
  return new;
end;
$$;

drop trigger if exists trg_watch_link_justification on public.watch_items;
create trigger trg_watch_link_justification
before insert or update of dossier_id on public.watch_items
for each row execute function public.ensure_watch_link_justification();
