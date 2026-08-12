create or replace function public.ensure_watch_link_justification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_dossier_id uuid;
  d_title text;
  d_objective text;
  evidence jsonb := '[]'::jsonb;
  link_status text;
begin
  if new.link_justification is not null then
    return new;
  end if;

  if new.dossier_id is not null then
    target_dossier_id := new.dossier_id;
    link_status := 'confirmed';
  elsif new.suggested_dossier_id is not null then
    target_dossier_id := new.suggested_dossier_id;
    link_status := 'suggested';
  else
    return new;
  end if;

  select title, objective
    into d_title, d_objective
  from public.dossiers
  where id = target_dossier_id;

  if nullif(trim(coalesce(new.qualification_reason,'')),'') is not null then
    evidence := jsonb_build_array(left(trim(regexp_replace(new.qualification_reason,'\s*Validation IA en attente\.\s*$','','i')),260));
  end if;

  new.link_justification := jsonb_build_object(
    'summary', case when link_status='confirmed'
      then 'Ce texte a été associé à ce dossier à partir des critères de veille ou d’une validation utilisateur.'
      else 'Myvor propose ce dossier car le préfiltre a détecté une correspondance suffisamment forte pour demander une validation.'
    end,
    'objective_link', case
      when nullif(trim(coalesce(d_objective,'')),'') is not null then left('Objectif suivi : ' || trim(d_objective),320)
      when nullif(trim(coalesce(d_title,'')),'') is not null then left('Dossier suivi : ' || trim(d_title),320)
      else 'Correspondance avec le dossier proposé.'
    end,
    'evidence', evidence,
    'consequence', case when link_status='confirmed'
      then 'Le texte est désormais pris en compte dans le suivi opérationnel du dossier.'
      else 'Le rattachement reste en revue jusqu’à validation du filtre IA strict ou de l’utilisateur.'
    end,
    'status', link_status
  );
  new.link_justification_engine := coalesce(new.link_justification_engine,case when link_status='confirmed' then 'fallback-link-trigger-v1' else 'prefilter-suggestion-v1' end);
  new.link_justified_at := coalesce(new.link_justified_at,now());
  return new;
end;
$$;

drop trigger if exists trg_watch_link_justification on public.watch_items;
create trigger trg_watch_link_justification
before insert or update of dossier_id, suggested_dossier_id on public.watch_items
for each row execute function public.ensure_watch_link_justification();

update public.watch_items
set suggested_dossier_id=suggested_dossier_id
where dossier_id is null and suggested_dossier_id is not null and link_justification is null;
