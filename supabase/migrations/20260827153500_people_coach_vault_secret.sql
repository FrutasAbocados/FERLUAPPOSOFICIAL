-- La Edge Function recupera la clave desde Supabase Vault cuando no existe
-- como secreto de runtime. Solo service_role puede ejecutar esta función.

create or replace function public.people_coach_openai_key()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'people_openai_api_key'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.people_coach_openai_key() from public;
revoke all on function public.people_coach_openai_key() from anon;
revoke all on function public.people_coach_openai_key() from authenticated;
grant execute on function public.people_coach_openai_key() to service_role;
