-- Copia de trabajadores_fichajes antes de retirar los fichajes del periodo de pruebas.
-- Sin acceso desde la API: RLS activo, sin políticas y sin privilegios para anon/authenticated.
create table if not exists public.trabajadores_fichajes_backup_20261108 as
  select * from public.trabajadores_fichajes;
alter table public.trabajadores_fichajes_backup_20261108 enable row level security;
revoke all on public.trabajadores_fichajes_backup_20261108 from anon, authenticated;
