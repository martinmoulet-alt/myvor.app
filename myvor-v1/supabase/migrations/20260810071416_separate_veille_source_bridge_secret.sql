do $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name='myvor_source_bridge_secret' limit 1;
  if v_id is null then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'myvor_source_bridge_secret',
      'Dedicated read-only token for Myvor source bridge'
    );
  end if;
end $$;

create or replace function public.get_veille_source_bridge_token()
returns text
language sql
security definer
set search_path=pg_catalog,vault,pg_temp
as $$
  select decrypted_secret from vault.decrypted_secrets where name='myvor_source_bridge_secret' limit 1
$$;
revoke all on function public.get_veille_source_bridge_token() from public,anon,authenticated;
grant execute on function public.get_veille_source_bridge_token() to service_role;
