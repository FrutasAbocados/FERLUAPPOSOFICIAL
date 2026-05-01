-- ============================================================================
-- Trabajadores RLS — responsable a SOLO LECTURA (revertir RW concedido en
-- 20260429150000) + crédito_facturas/lineas: añadir lectura propia para empleado
-- ============================================================================
-- Decisión 2026-05-01: el responsable (Raúl) sí debe ver Trabajadores pero NO
-- editar ni puntos/vacaciones/sábados/crédito de los empleados. Y el empleado
-- debe ver SUS facturas de crédito (hoy recibe 0 filas — falta policy).
--
-- Cambios:
--   1) Reduce las 5 policies "admin rw" a admin_full + admin_op (sin responsable).
--   2) Añade 5 policies nuevas "responsable read" con SELECT only.
--   3) Añade "credito facturas: empleado lee propio" + "credito lineas: ".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Reducir admin rw → solo admin_full + admin_op
-- ---------------------------------------------------------------------------
drop policy if exists "credito facturas: admin rw" on public.trabajadores_credito_facturas;
create policy "credito facturas: admin rw" on public.trabajadores_credito_facturas for all
  using (exists (select 1 from public.profiles
                 where id = auth.uid()
                   and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role])))
  with check (exists (select 1 from public.profiles
                      where id = auth.uid()
                        and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role])));

drop policy if exists "credito lineas: admin rw" on public.trabajadores_credito_lineas;
create policy "credito lineas: admin rw" on public.trabajadores_credito_lineas for all
  using (exists (select 1 from public.profiles
                 where id = auth.uid()
                   and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role])))
  with check (exists (select 1 from public.profiles
                      where id = auth.uid()
                        and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role])));

drop policy if exists "vacaciones: admin rw" on public.trabajadores_vacaciones;
create policy "vacaciones: admin rw" on public.trabajadores_vacaciones for all
  using (exists (select 1 from public.profiles
                 where id = auth.uid()
                   and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role])))
  with check (exists (select 1 from public.profiles
                      where id = auth.uid()
                        and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role])));

drop policy if exists "sabados: admin rw" on public.trabajadores_sabados_trabajados;
create policy "sabados: admin rw" on public.trabajadores_sabados_trabajados for all
  using (exists (select 1 from public.profiles
                 where id = auth.uid()
                   and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role])))
  with check (exists (select 1 from public.profiles
                      where id = auth.uid()
                        and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role])));

drop policy if exists "puntos: admin rw" on public.trabajadores_puntos_dias;
create policy "puntos: admin rw" on public.trabajadores_puntos_dias for all
  using (exists (select 1 from public.profiles
                 where id = auth.uid()
                   and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role])))
  with check (exists (select 1 from public.profiles
                      where id = auth.uid()
                        and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role])));


-- ---------------------------------------------------------------------------
-- 2) Responsable: SELECT only en las 5 tablas
-- ---------------------------------------------------------------------------
drop policy if exists "credito facturas: responsable read" on public.trabajadores_credito_facturas;
create policy "credito facturas: responsable read" on public.trabajadores_credito_facturas
  for select using (public.es_responsable());

drop policy if exists "credito lineas: responsable read" on public.trabajadores_credito_lineas;
create policy "credito lineas: responsable read" on public.trabajadores_credito_lineas
  for select using (public.es_responsable());

drop policy if exists "vacaciones: responsable read" on public.trabajadores_vacaciones;
create policy "vacaciones: responsable read" on public.trabajadores_vacaciones
  for select using (public.es_responsable());

drop policy if exists "sabados: responsable read" on public.trabajadores_sabados_trabajados;
create policy "sabados: responsable read" on public.trabajadores_sabados_trabajados
  for select using (public.es_responsable());

drop policy if exists "puntos: responsable read" on public.trabajadores_puntos_dias;
create policy "puntos: responsable read" on public.trabajadores_puntos_dias
  for select using (public.es_responsable());


-- ---------------------------------------------------------------------------
-- 3) Crédito: empleado lee propio (faltaba)
-- ---------------------------------------------------------------------------
drop policy if exists "credito facturas: empleado lee propio" on public.trabajadores_credito_facturas;
create policy "credito facturas: empleado lee propio" on public.trabajadores_credito_facturas
  for select using (
    exists (select 1 from public.empleados e
            where e.id = empleado_id and e.user_id = auth.uid())
  );

drop policy if exists "credito lineas: empleado lee propio" on public.trabajadores_credito_lineas;
create policy "credito lineas: empleado lee propio" on public.trabajadores_credito_lineas
  for select using (
    exists (select 1 from public.trabajadores_credito_facturas f
            join public.empleados e on e.id = f.empleado_id
            where f.id = factura_id and e.user_id = auth.uid())
  );
