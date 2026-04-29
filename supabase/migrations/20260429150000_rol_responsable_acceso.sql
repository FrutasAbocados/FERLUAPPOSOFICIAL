-- ============================================================================
-- Rol "responsable" — añadir acceso a Manager + Cobros + Trabajadores + Agente
-- ============================================================================
-- Raúl (responsable) necesita: vista trabajador + control deuda (cobros) +
-- manager + agente IA. Es un nivel intermedio entre admin_op y empleado.
--
-- Estrategia: políticas aditivas — sin tocar las existentes, añadir nuevas
-- que conceden acceso al rol 'responsable'. Para Cobros (que ya tenía array)
-- ampliamos el array a 3 roles.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Helper común
-- ---------------------------------------------------------------------------
create or replace function public.es_responsable() returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'responsable'::public.app_role
  );
$$;


-- ---------------------------------------------------------------------------
-- 2) Manager — políticas aditivas para responsable (lectura)
-- ---------------------------------------------------------------------------
drop policy if exists "manager: responsable read facturas"     on public.manager_facturas;
create policy "manager: responsable read facturas" on public.manager_facturas
  for select using (public.es_responsable());

drop policy if exists "manager: responsable read lineas"       on public.manager_lineas;
create policy "manager: responsable read lineas" on public.manager_lineas
  for select using (public.es_responsable());

drop policy if exists "manager: responsable read contactos"    on public.manager_contactos;
create policy "manager: responsable read contactos" on public.manager_contactos
  for select using (public.es_responsable());

drop policy if exists "manager: responsable read holded_sync"  on public.manager_holded_sync;
create policy "manager: responsable read holded_sync" on public.manager_holded_sync
  for select using (public.es_responsable());

drop policy if exists "manager: responsable read ventas_abuelo" on public.manager_ventas_abuelo;
create policy "manager: responsable read ventas_abuelo" on public.manager_ventas_abuelo
  for select using (public.es_responsable());

drop policy if exists "manager: responsable read lineas_abuelo" on public.manager_lineas_abuelo;
create policy "manager: responsable read lineas_abuelo" on public.manager_lineas_abuelo
  for select using (public.es_responsable());

drop policy if exists "manager: responsable read alias"        on public.manager_clientes_alias;
create policy "manager: responsable read alias" on public.manager_clientes_alias
  for select using (public.es_responsable());

drop policy if exists "manager: responsable read costes"       on public.manager_costes_manuales;
create policy "manager: responsable read costes" on public.manager_costes_manuales
  for select using (public.es_responsable());


-- ---------------------------------------------------------------------------
-- 3) Cobros — extender array de roles a 3 (admin_full, admin_op, responsable)
-- ---------------------------------------------------------------------------
drop policy if exists "cobros_clientes_admin_all" on public.cobros_clientes;
create policy "cobros_clientes_admin_all" on public.cobros_clientes for all
  using (
    exists (select 1 from public.profiles
            where id = auth.uid()
              and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role]))
  )
  with check (
    exists (select 1 from public.profiles
            where id = auth.uid()
              and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role]))
  );

drop policy if exists "cobros_movimientos_admin_all" on public.cobros_movimientos;
create policy "cobros_movimientos_admin_all" on public.cobros_movimientos for all
  using (
    exists (select 1 from public.profiles
            where id = auth.uid()
              and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role]))
  )
  with check (
    exists (select 1 from public.profiles
            where id = auth.uid()
              and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role]))
  );


-- ---------------------------------------------------------------------------
-- 4) Trabajadores (puntos / vacaciones / sábados / crédito) — extender a responsable
-- ---------------------------------------------------------------------------
-- Las policies actuales chequean role IN ('admin_full', 'admin_op'). Drop+recreate.

-- Crédito facturas
drop policy if exists "credito facturas: admin rw" on public.trabajadores_credito_facturas;
create policy "credito facturas: admin rw" on public.trabajadores_credito_facturas for all
  using (exists (select 1 from public.profiles
                 where id = auth.uid()
                   and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role])))
  with check (exists (select 1 from public.profiles
                      where id = auth.uid()
                        and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role])));

-- Crédito lineas
drop policy if exists "credito lineas: admin rw" on public.trabajadores_credito_lineas;
create policy "credito lineas: admin rw" on public.trabajadores_credito_lineas for all
  using (exists (select 1 from public.profiles
                 where id = auth.uid()
                   and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role])))
  with check (exists (select 1 from public.profiles
                      where id = auth.uid()
                        and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role])));

-- Vacaciones
drop policy if exists "vacaciones: admin rw" on public.trabajadores_vacaciones;
create policy "vacaciones: admin rw" on public.trabajadores_vacaciones for all
  using (exists (select 1 from public.profiles
                 where id = auth.uid()
                   and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role])))
  with check (exists (select 1 from public.profiles
                      where id = auth.uid()
                        and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role])));

-- Sábados
drop policy if exists "sabados: admin rw" on public.trabajadores_sabados_trabajados;
create policy "sabados: admin rw" on public.trabajadores_sabados_trabajados for all
  using (exists (select 1 from public.profiles
                 where id = auth.uid()
                   and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role])))
  with check (exists (select 1 from public.profiles
                      where id = auth.uid()
                        and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role])));

-- Puntos
drop policy if exists "puntos: admin rw" on public.trabajadores_puntos_dias;
create policy "puntos: admin rw" on public.trabajadores_puntos_dias for all
  using (exists (select 1 from public.profiles
                 where id = auth.uid()
                   and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role])))
  with check (exists (select 1 from public.profiles
                      where id = auth.uid()
                        and role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role])));


-- ---------------------------------------------------------------------------
-- 5) Empleados — extender lectura/escritura a responsable
-- ---------------------------------------------------------------------------
drop policy if exists "empleados: admin read" on public.empleados;
create policy "empleados: admin read" on public.empleados for select
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role]))
    or user_id = auth.uid()
  );

drop policy if exists "empleados: admin write" on public.empleados;
create policy "empleados: admin write" on public.empleados for all
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role]))
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid()
              and p.role = any (array['admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role]))
  );
