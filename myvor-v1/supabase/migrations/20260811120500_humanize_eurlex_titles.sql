create or replace function public.eurlex_human_title(p_text text)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog','public','pg_temp'
as $$
declare
  s text := coalesce(p_text,'');
  ref_match text[];
  candidate text;
  marker text;
  p integer;
  cut_pos integer;
  lower_s text;
begin
  if length(s) < 12 then return null; end if;
  s := regexp_replace(s, '^[^[:space:]]+\.xml[[:space:]]+', '', 'i');
  s := regexp_replace(
    s,
    '^Journal officiel de l''Union européenne[[:space:]]+FR[[:space:]]+Série[[:space:]]+[CL][[:space:]]+(C/)?[0-9]{4}/[0-9]+[[:space:]]+[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{4}[[:space:]]+',
    '',
    'i'
  );
  s := btrim(regexp_replace(s, '[[:space:]]+', ' ', 'g'));
  if length(s) < 12 then return null; end if;

  ref_match := regexp_match(s, '\(C/[0-9]{4}/[0-9]+\)');
  if ref_match is not null then
    p := strpos(s, ref_match[1]);
    if p > 10 and p <= 900 then
      candidate := btrim(left(s, p + length(ref_match[1]) - 1));
      if candidate !~* '\.xml$' and length(candidate) >= 12 then return left(candidate,900); end if;
    end if;
  end if;

  lower_s := lower(s);
  cut_pos := least(length(s) + 1, 901);
  foreach marker in array array[
    ' la commission européenne,',
    ' le conseil de l’union européenne,',
    ' le conseil de l''union européenne,',
    ' le parlement européen et le conseil de l’union européenne,',
    ' le parlement européen et le conseil de l''union européenne,',
    ' la banque centrale européenne,',
    ' la cour de justice de l’union européenne,',
    ' la cour de justice de l''union européenne,',
    ' avant-propos '
  ] loop
    p := strpos(lower_s, marker);
    if p > 12 and p < cut_pos then cut_pos := p; end if;
  end loop;

  if lower_s like 'notification préalable d’une concentration%' or lower_s like 'notification préalable d''une concentration%' then
    p := strpos(lower_s, ' 1. ');
    if p > 12 and p < cut_pos then cut_pos := p; end if;
  end if;

  candidate := btrim(left(s, cut_pos - 1));
  if candidate ~* '\.xml$' or length(candidate) < 12 then return null; end if;
  return left(candidate, 900);
end;
$$;

create or replace function public.eurlex_nature_from_title(p_title text, p_current text)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog','public','pg_temp'
as $$
declare t text := lower(coalesce(p_title,''));
begin
  if t like 'notification préalable d’une concentration%' or t like 'notification préalable d''une concentration%' then return 'Concentration — notification'; end if;
  if t like 'rapport %' or t like 'rapport d’activité%' or t like 'rapport d''activité%' then return 'Rapport de l’Union européenne'; end if;
  if t like 'publication de la communication%' or t like 'communication %' then return 'Communication de l’Union européenne'; end if;
  if t like '%règlement%' or t like '%reglement%' then return 'Règlement de l’Union européenne'; end if;
  if t like '%directive%' then return 'Directive de l’Union européenne'; end if;
  if t like '%décision%' or t like '%decision%' then return 'Décision de l’Union européenne'; end if;
  if t like 'avis %' then return 'Avis de l’Union européenne'; end if;
  return coalesce(nullif(p_current,''),'Acte de l’Union européenne');
end;
$$;

create or replace function public.humanize_eurlex_watch_metadata()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','pg_temp'
as $$
declare human_title text;
begin
  human_title := public.eurlex_human_title(new.source_text);
  update public.watch_items w
  set title = case when w.title ~* '\.xml$' and human_title is not null then human_title else w.title end,
      nature = public.eurlex_nature_from_title(coalesce(human_title,w.title),w.nature)
  where w.id = new.watch_item_id
    and w.source_name = 'EUR-Lex / Cellar';
  return new;
end;
$$;

drop trigger if exists trg_humanize_eurlex_watch_metadata on public.watch_item_content;
create trigger trg_humanize_eurlex_watch_metadata
after insert or update of source_text on public.watch_item_content
for each row execute function public.humanize_eurlex_watch_metadata();

with fixed as (
  select w.id,
         public.eurlex_human_title(c.source_text) as human_title,
         w.nature as current_nature
  from public.watch_items w
  join public.watch_item_content c on c.watch_item_id=w.id
  where w.source_name='EUR-Lex / Cellar'
    and w.title ~* '\.xml$'
)
update public.watch_items w
set title=f.human_title,
    nature=public.eurlex_nature_from_title(f.human_title,f.current_nature)
from fixed f
where w.id=f.id
  and f.human_title is not null;
