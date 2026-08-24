-- Evalua auth.uid() una sola vez por consulta y limita estas policies a
-- sesiones autenticadas. La expresion de autorizacion se mantiene equivalente.

alter policy "empleado_objetivos: empleado lee propio"
  on public.empleado_objetivos
  to authenticated
  using (
    exists (
      select 1
      from public.empleados e
      where e.id = empleado_objetivos.empleado_id
        and e.user_id = (select auth.uid())
    )
  );

alter policy "empleado_objetivo_mes: empleado lee propio"
  on public.empleado_objetivo_mes
  to authenticated
  using (
    exists (
      select 1
      from public.empleado_objetivos o
      join public.empleados e on e.id = o.empleado_id
      where o.id = empleado_objetivo_mes.objetivo_id
        and e.user_id = (select auth.uid())
    )
  );

alter policy "incidencias: equipo lee"
  on public.incidencias
  to authenticated
  using (
    public.is_admin()
    or public.es_responsable()
    or exists (
      select 1
      from public.empleados e
      where e.user_id = (select auth.uid())
    )
  );

alter policy "incidencias: empleado crea"
  on public.incidencias
  to authenticated
  with check (
    exists (
      select 1
      from public.empleados e
      where e.user_id = (select auth.uid())
        and e.id = incidencias.autor_empleado_id
    )
    or public.is_admin()
  );

alter policy "vacaciones_cupos: empleado lee propio"
  on public.trabajadores_vacaciones_cupos_anuales
  to authenticated
  using (
    exists (
      select 1
      from public.empleados e
      where e.id = trabajadores_vacaciones_cupos_anuales.empleado_id
        and e.user_id = (select auth.uid())
        and e.activo = true
    )
  );

alter policy "pedidos_tarde: raul insert"
  on public.trabajadores_pedidos_tarde_facturas
  to authenticated
  with check (
    public.es_raul_pedidos_tarde()
    and created_by = (select auth.uid())
  );

alter policy "pedidos_tarde: raul update"
  on public.trabajadores_pedidos_tarde_facturas
  to authenticated
  using (public.es_raul_pedidos_tarde())
  with check (
    public.es_raul_pedidos_tarde()
    and created_by = (select auth.uid())
  );

alter policy "pluses_extra: lectura autorizada"
  on public.trabajadores_pluses_extra
  to authenticated
  using (
    public.is_admin()
    or public.es_responsable()
    or exists (
      select 1
      from public.empleados e
      where e.id = trabajadores_pluses_extra.empleado_id
        and e.user_id = (select auth.uid())
        and e.activo = true
    )
  );
