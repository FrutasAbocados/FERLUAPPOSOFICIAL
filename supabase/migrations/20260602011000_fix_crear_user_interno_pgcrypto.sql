-- crear_user_interno usa pgcrypto, instalado en schema extensions.
-- Mantener referencias explícitas porque la función limita search_path a public.

create or replace function public.crear_user_interno(
  p_email text,
  p_password text,
  p_role public.app_role
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    v_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    'authenticated', 'authenticated',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
    'email',
    now(), now(), now()
  );

  if p_role <> 'empleado' then
    update public.profiles set role = p_role where id = v_id;
  end if;

  return v_id;
end;
$function$;

revoke execute on function public.crear_user_interno(text, text, public.app_role) from public, anon, authenticated;
grant execute on function public.crear_user_interno(text, text, public.app_role) to service_role;
