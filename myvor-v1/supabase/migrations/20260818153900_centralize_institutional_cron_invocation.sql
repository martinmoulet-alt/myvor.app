select cron.alter_job(
  job_id := 13,
  command := $$select public.invoke_veille_worker_once('/functions/v1/sync-watch-institutional');$$
);
