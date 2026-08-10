do $$
declare r record;
begin
  for r in select jobid from cron.job where jobname in ('myvor-veille-every-15-minutes','myvor-veille-catalog-every-15-minutes','myvor-veille-ai-qualifier-every-5-minutes') loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule('myvor-veille-every-15-minutes','*/15 * * * *',$cron$
with req as (
  select '/functions/v1/sync-watch'::text path,floor(extract(epoch from clock_timestamp()))::bigint ts,gen_random_uuid() nonce,
    (select decrypted_secret from vault.decrypted_secrets where name='myvor_cron_secret' limit 1) secret,
    (select rtrim(decrypted_secret,'/') from vault.decrypted_secrets where name='myvor_project_url' limit 1) base_url
)
select net.http_post(
  url:=base_url||path,
  headers:=jsonb_build_object('Content-Type','application/json','x-myvor-timestamp',ts::text,'x-myvor-nonce',nonce::text,'x-myvor-signature',encode(extensions.hmac(path||E'\n'||ts::text||E'\n'||nonce::text,secret,'sha256'),'hex')),
  body:=jsonb_build_object('source','supabase-cron','requested_at',clock_timestamp()),timeout_milliseconds:=60000
) from req;
$cron$);

select cron.schedule('myvor-veille-catalog-every-15-minutes','7,22,37,52 * * * *',$cron$
with req as (
  select '/functions/v1/sync-watch-catalog'::text path,floor(extract(epoch from clock_timestamp()))::bigint ts,gen_random_uuid() nonce,
    (select decrypted_secret from vault.decrypted_secrets where name='myvor_cron_secret' limit 1) secret,
    (select rtrim(decrypted_secret,'/') from vault.decrypted_secrets where name='myvor_project_url' limit 1) base_url
)
select net.http_post(
  url:=base_url||path,
  headers:=jsonb_build_object('Content-Type','application/json','x-myvor-timestamp',ts::text,'x-myvor-nonce',nonce::text,'x-myvor-signature',encode(extensions.hmac(path||E'\n'||ts::text||E'\n'||nonce::text,secret,'sha256'),'hex')),
  body:=jsonb_build_object('source','supabase-catalog-cron','requested_at',clock_timestamp()),timeout_milliseconds:=120000
) from req;
$cron$);

select cron.schedule('myvor-veille-ai-qualifier-every-5-minutes','3,8,13,18,23,28,33,38,43,48,53,58 * * * *',$cron$
with req as (
  select '/functions/v1/qualify-watch-ai'::text path,floor(extract(epoch from clock_timestamp()))::bigint ts,gen_random_uuid() nonce,
    (select decrypted_secret from vault.decrypted_secrets where name='myvor_cron_secret' limit 1) secret,
    (select rtrim(decrypted_secret,'/') from vault.decrypted_secrets where name='myvor_project_url' limit 1) base_url
)
select net.http_post(
  url:=base_url||path,
  headers:=jsonb_build_object('Content-Type','application/json','x-myvor-timestamp',ts::text,'x-myvor-nonce',nonce::text,'x-myvor-signature',encode(extensions.hmac(path||E'\n'||ts::text||E'\n'||nonce::text,secret,'sha256'),'hex')),
  body:=jsonb_build_object('source','supabase-ai-qualifier-cron','requested_at',clock_timestamp()),timeout_milliseconds:=60000
) from req;
$cron$);
