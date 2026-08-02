-- Myvor — protection des appels IA par utilisateur.
-- À exécuter une fois dans Supabase > SQL Editor avant de déployer les gardes côté application.

create table if not exists public.ai_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  window_start timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature)
);

alter table public.ai_rate_limits enable row level security;

-- Cette table est interne : aucun accès direct depuis le navigateur.
revoke all on table public.ai_rate_limits from anon;
revoke all on table public.ai_rate_limits from authenticated;

-- Le quota est fixé côté base pour qu'un client ne puisse pas augmenter lui-même sa limite.
create or replace function public.consume_ai_quota(p_feature text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_window interval;
  v_count integer;
begin
  if v_user_id is null then
    return false;
  end if;

  case p_feature
    when 'dossier-profile' then v_limit := 8;  v_window := interval '5 minutes';
    when 'impact'          then v_limit := 10; v_window := interval '5 minutes';
    when 'radar'           then v_limit := 6;  v_window := interval '5 minutes';
    when 'note-builder'    then v_limit := 10; v_window := interval '5 minutes';
    else
      return false;
  end case;

  insert into public.ai_rate_limits as rl (
    user_id,
    feature,
    window_start,
    request_count,
    updated_at
  )
  values (
    v_user_id,
    p_feature,
    now(),
    1,
    now()
  )
  on conflict (user_id, feature) do update
  set
    window_start = case
      when rl.window_start <= now() - v_window then now()
      else rl.window_start
    end,
    request_count = case
      when rl.window_start <= now() - v_window then 1
      else rl.request_count + 1
    end,
    updated_at = now()
  returning request_count into v_count;

  return v_count <= v_limit;
end;
$$;

revoke all on function public.consume_ai_quota(text) from public;
revoke all on function public.consume_ai_quota(text) from anon;
grant execute on function public.consume_ai_quota(text) to authenticated;

-- Vérification de configuration uniquement.
select
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'consume_ai_quota';
