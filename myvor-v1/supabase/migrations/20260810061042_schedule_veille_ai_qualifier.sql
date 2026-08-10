do $$
declare
  r record;
begin
  for r in
    select jobid
    from cron.job
    where jobname in ('myvor-veille-ai-qualifier-test','myvor-veille-ai-qualifier-every-5-minutes')
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$$;

select cron.schedule(
  'myvor-veille-ai-qualifier-every-5-minutes',
  '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
  $cron$
    select net.http_post(
      url := (
        select rtrim(decrypted_secret, '/')
        from vault.decrypted_secrets
        where name = 'myvor_project_url'
        limit 1
      ) || '/functions/v1/qualify-watch-ai',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-myvor-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'myvor_cron_secret'
          limit 1
        )
      ),
      body := jsonb_build_object(
        'source', 'supabase-ai-qualifier-cron',
        'requested_at', now()
      ),
      timeout_milliseconds := 60000
    ) as request_id;
  $cron$
);
