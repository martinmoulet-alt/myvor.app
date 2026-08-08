-- Myvor AI governance guardrails
-- Applied to the production Supabase project on 2026-08-08.

create or replace function public.myvor_enforce_ai_governance()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  payload jsonb := coalesce(new.content, '{}'::jsonb);
  previous_trace jsonb := coalesce(payload->'ai_trace', '{}'::jsonb);
  validated_at text := nullif(coalesce(payload#>>'{audit,validated_at}', payload#>>'{note,quality,validated_at}', payload#>>'{review,validated_at}', previous_trace->>'validated_at', ''), '');
  validated_by text := nullif(coalesce(payload#>>'{audit,validated_by}', payload#>>'{note,quality,validated_by}', payload#>>'{review,validated_by}', previous_trace->>'validated_by', ''), '');
  review_status text := nullif(coalesce(payload#>>'{review,status}', previous_trace->>'human_review_status', ''), '');
  actors jsonb;
  cleaned_actors jsonb := '[]'::jsonb;
  actor jsonb;
  evidence_verified boolean;
begin
  if new.type in ('impact','radar','builder','warzone') then
    payload := jsonb_set(
      payload,
      '{ai_trace}',
      jsonb_build_object(
        'assisted_by_ai', true,
        'system', 'Myvor',
        'generated_at', coalesce(nullif(previous_trace->>'generated_at',''), to_char(coalesce(new.created_at, now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
        'engine', nullif(coalesce(payload->>'engine', payload->>'detail_engine', payload#>>'{context_used,engine}', previous_trace->>'engine', ''), ''),
        'model', nullif(coalesce(payload->>'model', payload->>'detail_model', payload#>>'{context_used,model}', previous_trace->>'model', ''), ''),
        'human_review_status', case when validated_at is not null or review_status = 'validated' then 'validated' when review_status = 'reviewed' then 'reviewed' else 'generated' end,
        'validated_at', validated_at,
        'validated_by', validated_by,
        'notice', 'Analyse assistée par IA — vérification humaine requise avant usage externe.'
      ),
      true
    );
  end if;

  if new.type in ('radar','warzone') then
    actors := payload->'actors';
    if jsonb_typeof(actors) = 'array' then
      for actor in select value from jsonb_array_elements(actors)
      loop
        evidence_verified := lower(coalesce(actor#>>'{evidence,verified}','false')) = 'true'
          and nullif(coalesce(actor#>>'{evidence,source_url}',''),'') is not null
          and nullif(coalesce(actor#>>'{evidence,source_title}',''),'') is not null;
        if coalesce(actor->>'position','inconnue') <> 'inconnue' and not evidence_verified then
          actor := jsonb_set(actor, '{position}', '"inconnue"'::jsonb, true);
          actor := jsonb_set(actor, '{position_reason}', to_jsonb('Position non attribuée : aucune source publique vérifiée ne l’établit.'::text), true);
          actor := jsonb_set(actor, '{certainty}', '"a_confirmer"'::jsonb, true);
        end if;
        cleaned_actors := cleaned_actors || jsonb_build_array(actor);
      end loop;
      payload := jsonb_set(payload, '{actors}', cleaned_actors, true);
    end if;
  end if;

  new.content := payload;
  return new;
end;
$$;

revoke all on function public.myvor_enforce_ai_governance() from public, anon, authenticated;

drop trigger if exists productions_ai_governance_guardrails on public.productions;
create trigger productions_ai_governance_guardrails
before insert or update of content, type on public.productions
for each row execute function public.myvor_enforce_ai_governance();
