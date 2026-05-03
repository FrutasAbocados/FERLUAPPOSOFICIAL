-- ============================================================================
-- Notificaciones — añadir a supabase_realtime para suscripción tiempo real
-- ============================================================================
-- Antes el frontend hacía polling cada 30s (con N empleados conectados, N
-- refetch sobre la misma tabla). Ahora un único canal Realtime invalida la
-- query cuando cambia algo. RLS sigue aplicando — cada cliente sólo recibe
-- eventos de filas que puede SELECT.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notificaciones'
  ) then
    execute 'alter publication supabase_realtime add table public.notificaciones';
  end if;
end $$;
