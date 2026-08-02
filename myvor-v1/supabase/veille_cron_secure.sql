-- Myvor — planification sécurisée de la veille
-- Pré-requis dans Supabase Vault :
--   myvor_project_url       = https://<project-ref>.supabase.co
--   myvor_publishable_key   = clé publishable du projet
--   myvor_cron_secret       = secret aléatoire long, identique au secret Edge Function MYVOR_CRON_SECRET
--
-- Aucun secret réel ne doit être commité dans GitHub.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

do $$
declare
  missing text[] := array[]::text[];
begin
  if not exists(select 1 from vault.decrypted_secrets where name='myvor_project_url') then
    missing := array_append(missing,'myvor_project_url');
  end if;
  if not exists(select 1 from vault.decrypted_secrets where name='myvor_publishable_key') then
    missing := array_append(missing,'myvor_publishable_key');
  end if;
  if not exists(select 1 from vault.decrypted_secrets where name='myvor_cron_secret') then
    missing := array_append(missing,'myvor_cron_secret');
  end if;
  if cardinality(missing)>0 then
    raise exception 'Secrets Vault manquants : %', array_to_string(missing,', ');
  end if;
end $$;

-- Remplace proprement l'ancien job s'il existe.
do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='myvor-veille-every-15-minutes' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'myvor-veille-every-15-minutes',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := (
        select rtrim(decrypted_secret,'/')
        from vault.decrypted_secrets
        where name='myvor_project_url'
        limit 1
      ) || '/functions/v1/veille-sync',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey',(
          select decrypted_secret
          from vault.decrypted_secrets
          where name='myvor_publishable_key'
          limit 1
        ),
        'x-myvor-cron-secret',(
          select decrypted_secret
          from vault.decrypted_secrets
          where name='myvor_cron_secret'
          limit 1
        )
      ),
      body := jsonb_build_object(
        'source','supabase-cron',
        'requested_at',now()
      ),
      timeout_milliseconds := 120000
    ) as request_id;
  $cron$
);

-- Vérification :
-- select jobid, jobname, schedule, active from cron.job where jobname='myvor-veille-every-15-minutes';
-- select * from cron.job_run_details where jobid=(select jobid from cron.job where jobname='myvor-veille-every-15-minutes') order by start_time desc limit 10;
