-- Consolidate permissive authenticated policies without changing authorization.
-- PostgreSQL combines permissive policies with OR. Each expression below is the
-- exact OR of the policies that previously applied to the same table/action.

-- empleado_objetivo_mes
drop policy "empleado_objetivo_mes: admin rw" on public."empleado_objetivo_mes";
drop policy "empleado_objetivo_mes: empleado lee propio" on public."empleado_objetivo_mes";
drop policy "empleado_objetivo_mes: responsable read" on public."empleado_objetivo_mes";

create policy "abocadosos_select_consolidated"
  on public."empleado_objetivo_mes"
  for select
  to authenticated
  using (
    (is_admin())
    or
    ((EXISTS ( SELECT 1
       FROM (empleado_objetivos o
         JOIN empleados e ON ((e.id = o.empleado_id)))
      WHERE ((o.id = empleado_objetivo_mes.objetivo_id) AND (e.user_id = ( SELECT auth.uid() AS uid))))))
    or
    (es_responsable())
  );

create policy "abocadosos_insert_consolidated"
  on public."empleado_objetivo_mes"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."empleado_objetivo_mes"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."empleado_objetivo_mes"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- empleado_objetivos
drop policy "empleado_objetivos: admin rw" on public."empleado_objetivos";
drop policy "empleado_objetivos: empleado lee propio" on public."empleado_objetivos";
drop policy "empleado_objetivos: responsable read" on public."empleado_objetivos";

create policy "abocadosos_select_consolidated"
  on public."empleado_objetivos"
  for select
  to authenticated
  using (
    (is_admin())
    or
    ((EXISTS ( SELECT 1
       FROM empleados e
      WHERE ((e.id = empleado_objetivos.empleado_id) AND (e.user_id = ( SELECT auth.uid() AS uid))))))
    or
    (es_responsable())
  );

create policy "abocadosos_insert_consolidated"
  on public."empleado_objetivos"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."empleado_objetivos"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."empleado_objetivos"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- manager_compra_alias
drop policy "manager_compra_alias: admin rw" on public."manager_compra_alias";
drop policy "manager_compra_alias: manager read" on public."manager_compra_alias";

create policy "abocadosos_select_consolidated"
  on public."manager_compra_alias"
  for select
  to authenticated
  using (
    (is_admin())
    or
    (puede_ver_manager())
  );

create policy "abocadosos_insert_consolidated"
  on public."manager_compra_alias"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."manager_compra_alias"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."manager_compra_alias"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- manager_costes_manuales_nombre
drop policy "mcmn_select_manager" on public."manager_costes_manuales_nombre";
drop policy "mcmn_write_manager" on public."manager_costes_manuales_nombre";

create policy "abocadosos_select_consolidated"
  on public."manager_costes_manuales_nombre"
  for select
  to authenticated
  using (
    (puede_ver_manager())
  );

create policy "abocadosos_insert_consolidated"
  on public."manager_costes_manuales_nombre"
  for insert
  to authenticated
  with check (
    (puede_ver_manager())
  );

create policy "abocadosos_update_consolidated"
  on public."manager_costes_manuales_nombre"
  for update
  to authenticated
  using (
    (puede_ver_manager())
  )
  with check (
    (puede_ver_manager())
  );

create policy "abocadosos_delete_consolidated"
  on public."manager_costes_manuales_nombre"
  for delete
  to authenticated
  using (
    (puede_ver_manager())
  );

-- pedidos_wa_cliente_telefonos
drop policy "pedidos_wa_cliente_telefonos: admin rw" on public."pedidos_wa_cliente_telefonos";
drop policy "pedidos_wa_cliente_telefonos: responsable read" on public."pedidos_wa_cliente_telefonos";

create policy "abocadosos_select_consolidated"
  on public."pedidos_wa_cliente_telefonos"
  for select
  to authenticated
  using (
    (is_admin())
    or
    (es_responsable())
  );

create policy "abocadosos_insert_consolidated"
  on public."pedidos_wa_cliente_telefonos"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."pedidos_wa_cliente_telefonos"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."pedidos_wa_cliente_telefonos"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- pedidos_wa_clientes
drop policy "pedidos_wa_clientes: admin all" on public."pedidos_wa_clientes";
drop policy "pedidos_wa_clientes: empleado read" on public."pedidos_wa_clientes";
drop policy "pedidos_wa_clientes: gestor_cobros insert" on public."pedidos_wa_clientes";
drop policy "pedidos_wa_clientes: operaciones read" on public."pedidos_wa_clientes";
drop policy "pedidos_wa_clientes: responsable read" on public."pedidos_wa_clientes";

create policy "abocadosos_select_consolidated"
  on public."pedidos_wa_clientes"
  for select
  to authenticated
  using (
    (is_admin())
    or
    (puede_operar_pedidos_wa())
    or
    (es_operaciones())
    or
    (es_responsable())
  );

create policy "abocadosos_insert_consolidated"
  on public."pedidos_wa_clientes"
  for insert
  to authenticated
  with check (
    (is_admin())
    or
    (es_gestor_cobros())
  );

create policy "abocadosos_update_consolidated"
  on public."pedidos_wa_clientes"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."pedidos_wa_clientes"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- pedidos_wa_compras
drop policy "compras: empleado read" on public."pedidos_wa_compras";
drop policy "pedidos_wa_compras: admin rw" on public."pedidos_wa_compras";
drop policy "pedidos_wa_compras: responsable read" on public."pedidos_wa_compras";

create policy "abocadosos_select_consolidated"
  on public."pedidos_wa_compras"
  for select
  to authenticated
  using (
    (puede_operar_pedidos_wa())
    or
    (is_admin())
    or
    (es_responsable())
  );

create policy "abocadosos_insert_consolidated"
  on public."pedidos_wa_compras"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."pedidos_wa_compras"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."pedidos_wa_compras"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- pedidos_wa_compras_lineas
drop policy "compras_lineas: empleado read" on public."pedidos_wa_compras_lineas";
drop policy "pedidos_wa_compras_lineas: admin rw" on public."pedidos_wa_compras_lineas";
drop policy "pedidos_wa_compras_lineas: responsable read" on public."pedidos_wa_compras_lineas";

create policy "abocadosos_select_consolidated"
  on public."pedidos_wa_compras_lineas"
  for select
  to authenticated
  using (
    (puede_operar_pedidos_wa())
    or
    (is_admin())
    or
    (es_responsable())
  );

create policy "abocadosos_insert_consolidated"
  on public."pedidos_wa_compras_lineas"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."pedidos_wa_compras_lineas"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."pedidos_wa_compras_lineas"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- pedidos_wa_formatos_compra
drop policy "pedidos_wa_formatos_compra: admin rw" on public."pedidos_wa_formatos_compra";
drop policy "pedidos_wa_formatos_compra: operaciones read" on public."pedidos_wa_formatos_compra";

create policy "abocadosos_select_consolidated"
  on public."pedidos_wa_formatos_compra"
  for select
  to authenticated
  using (
    (is_admin())
    or
    ((puede_operar_pedidos_wa() OR es_responsable()))
  );

create policy "abocadosos_insert_consolidated"
  on public."pedidos_wa_formatos_compra"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."pedidos_wa_formatos_compra"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."pedidos_wa_formatos_compra"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- pedidos_wa_margen_minimo
drop policy "margen minimo: admin write" on public."pedidos_wa_margen_minimo";
drop policy "margen minimo: equipo read" on public."pedidos_wa_margen_minimo";

create policy "abocadosos_select_consolidated"
  on public."pedidos_wa_margen_minimo"
  for select
  to authenticated
  using (
    (is_admin())
    or
    (puede_operar_pedidos_wa())
  );

create policy "abocadosos_insert_consolidated"
  on public."pedidos_wa_margen_minimo"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."pedidos_wa_margen_minimo"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."pedidos_wa_margen_minimo"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- pedidos_wa_producto_proveedor
drop policy "pedidos_wa_producto_proveedor: admin rw" on public."pedidos_wa_producto_proveedor";
drop policy "pedidos_wa_producto_proveedor: operaciones read" on public."pedidos_wa_producto_proveedor";

create policy "abocadosos_select_consolidated"
  on public."pedidos_wa_producto_proveedor"
  for select
  to authenticated
  using (
    (is_admin())
    or
    ((puede_operar_pedidos_wa() OR es_responsable()))
  );

create policy "abocadosos_insert_consolidated"
  on public."pedidos_wa_producto_proveedor"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."pedidos_wa_producto_proveedor"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."pedidos_wa_producto_proveedor"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- pedidos_wa_proveedor_alias
drop policy "pedidos_wa_proveedor_alias: admin rw" on public."pedidos_wa_proveedor_alias";
drop policy "pedidos_wa_proveedor_alias: empleado read" on public."pedidos_wa_proveedor_alias";

create policy "abocadosos_select_consolidated"
  on public."pedidos_wa_proveedor_alias"
  for select
  to authenticated
  using (
    (is_admin())
    or
    (puede_operar_pedidos_wa())
  );

create policy "abocadosos_insert_consolidated"
  on public."pedidos_wa_proveedor_alias"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."pedidos_wa_proveedor_alias"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."pedidos_wa_proveedor_alias"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- pedidos_wa_ruta_config
drop policy "pedidos_wa_ruta_config: admin rw" on public."pedidos_wa_ruta_config";
drop policy "pedidos_wa_ruta_config: operaciones read" on public."pedidos_wa_ruta_config";

create policy "abocadosos_select_consolidated"
  on public."pedidos_wa_ruta_config"
  for select
  to authenticated
  using (
    (is_admin())
    or
    ((puede_operar_pedidos_wa() OR es_responsable()))
  );

create policy "abocadosos_insert_consolidated"
  on public."pedidos_wa_ruta_config"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."pedidos_wa_ruta_config"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."pedidos_wa_ruta_config"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- pedidos_wa_ruta_extras
drop policy "pedidos_wa_ruta_extras: admin rw" on public."pedidos_wa_ruta_extras";
drop policy "pedidos_wa_ruta_extras: operaciones read" on public."pedidos_wa_ruta_extras";

create policy "abocadosos_select_consolidated"
  on public."pedidos_wa_ruta_extras"
  for select
  to authenticated
  using (
    (is_admin())
    or
    ((puede_operar_pedidos_wa() OR es_responsable()))
  );

create policy "abocadosos_insert_consolidated"
  on public."pedidos_wa_ruta_extras"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."pedidos_wa_ruta_extras"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."pedidos_wa_ruta_extras"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- pedidos_wa_whatsapp_filas
drop policy "pedidos_wa_whatsapp_filas: admin rw" on public."pedidos_wa_whatsapp_filas";
drop policy "pedidos_wa_whatsapp_filas: responsable read" on public."pedidos_wa_whatsapp_filas";

create policy "abocadosos_select_consolidated"
  on public."pedidos_wa_whatsapp_filas"
  for select
  to authenticated
  using (
    (is_admin())
    or
    (es_responsable())
  );

create policy "abocadosos_insert_consolidated"
  on public."pedidos_wa_whatsapp_filas"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."pedidos_wa_whatsapp_filas"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."pedidos_wa_whatsapp_filas"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- pedidos_wa_whatsapp_mensajes
drop policy "pedidos_wa_whatsapp_mensajes: admin rw" on public."pedidos_wa_whatsapp_mensajes";
drop policy "pedidos_wa_whatsapp_mensajes: responsable read" on public."pedidos_wa_whatsapp_mensajes";

create policy "abocadosos_select_consolidated"
  on public."pedidos_wa_whatsapp_mensajes"
  for select
  to authenticated
  using (
    (is_admin())
    or
    (es_responsable())
  );

create policy "abocadosos_insert_consolidated"
  on public."pedidos_wa_whatsapp_mensajes"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."pedidos_wa_whatsapp_mensajes"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."pedidos_wa_whatsapp_mensajes"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- repartos_jornada
drop policy "repartos_jornada: admin all" on public."repartos_jornada";
drop policy "repartos_jornada: empleado lee propio" on public."repartos_jornada";
drop policy "repartos_jornada: responsable read" on public."repartos_jornada";

create policy "abocadosos_select_consolidated"
  on public."repartos_jornada"
  for select
  to authenticated
  using (
    ((EXISTS ( SELECT 1
       FROM profiles p
      WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin_full'::app_role, 'admin_op'::app_role]))))))
    or
    ((EXISTS ( SELECT 1
       FROM empleados_equipo e
      WHERE ((e.id = repartos_jornada.empleado_id) AND (e.user_id = ( SELECT auth.uid() AS uid))))))
    or
    (es_responsable())
  );

create policy "abocadosos_insert_consolidated"
  on public."repartos_jornada"
  for insert
  to authenticated
  with check (
    ((EXISTS ( SELECT 1
       FROM profiles p
      WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin_full'::app_role, 'admin_op'::app_role]))))))
  );

create policy "abocadosos_update_consolidated"
  on public."repartos_jornada"
  for update
  to authenticated
  using (
    ((EXISTS ( SELECT 1
       FROM profiles p
      WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin_full'::app_role, 'admin_op'::app_role]))))))
  )
  with check (
    ((EXISTS ( SELECT 1
       FROM profiles p
      WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin_full'::app_role, 'admin_op'::app_role]))))))
  );

create policy "abocadosos_delete_consolidated"
  on public."repartos_jornada"
  for delete
  to authenticated
  using (
    ((EXISTS ( SELECT 1
       FROM profiles p
      WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin_full'::app_role, 'admin_op'::app_role]))))))
  );

-- repartos_jornada_gastos
drop policy "repartos_jornada_gastos: admin all" on public."repartos_jornada_gastos";
drop policy "repartos_jornada_gastos: empleado lee propio" on public."repartos_jornada_gastos";
drop policy "repartos_jornada_gastos: responsable read" on public."repartos_jornada_gastos";

create policy "abocadosos_select_consolidated"
  on public."repartos_jornada_gastos"
  for select
  to authenticated
  using (
    (is_admin())
    or
    ((EXISTS ( SELECT 1
       FROM (repartos_jornada j
         JOIN empleados_equipo e ON ((e.id = j.empleado_id)))
      WHERE ((j.id = repartos_jornada_gastos.jornada_id) AND (e.user_id = ( SELECT auth.uid() AS uid))))))
    or
    (es_responsable())
  );

create policy "abocadosos_insert_consolidated"
  on public."repartos_jornada_gastos"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."repartos_jornada_gastos"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."repartos_jornada_gastos"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- repartos_jornada_lineas
drop policy "repartos_jornada_lineas: admin all" on public."repartos_jornada_lineas";
drop policy "repartos_jornada_lineas: empleado lee propio" on public."repartos_jornada_lineas";

create policy "abocadosos_select_consolidated"
  on public."repartos_jornada_lineas"
  for select
  to authenticated
  using (
    ((EXISTS ( SELECT 1
       FROM profiles p
      WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin_full'::app_role, 'admin_op'::app_role]))))))
    or
    ((EXISTS ( SELECT 1
       FROM (repartos_jornada j
         JOIN empleados_equipo e ON ((e.id = j.empleado_id)))
      WHERE ((j.id = repartos_jornada_lineas.jornada_id) AND (e.user_id = ( SELECT auth.uid() AS uid))))))
  );

create policy "abocadosos_insert_consolidated"
  on public."repartos_jornada_lineas"
  for insert
  to authenticated
  with check (
    ((EXISTS ( SELECT 1
       FROM profiles p
      WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin_full'::app_role, 'admin_op'::app_role]))))))
  );

create policy "abocadosos_update_consolidated"
  on public."repartos_jornada_lineas"
  for update
  to authenticated
  using (
    ((EXISTS ( SELECT 1
       FROM profiles p
      WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin_full'::app_role, 'admin_op'::app_role]))))))
  )
  with check (
    ((EXISTS ( SELECT 1
       FROM profiles p
      WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin_full'::app_role, 'admin_op'::app_role]))))))
  );

create policy "abocadosos_delete_consolidated"
  on public."repartos_jornada_lineas"
  for delete
  to authenticated
  using (
    ((EXISTS ( SELECT 1
       FROM profiles p
      WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = ANY (ARRAY['admin_full'::app_role, 'admin_op'::app_role]))))))
  );

-- trabajadores_nominas
drop policy "trabajadores_nominas: admin rw" on public."trabajadores_nominas";
drop policy "trabajadores_nominas: empleado lee propio" on public."trabajadores_nominas";
drop policy "trabajadores_nominas: responsable read" on public."trabajadores_nominas";

create policy "abocadosos_select_consolidated"
  on public."trabajadores_nominas"
  for select
  to authenticated
  using (
    (is_admin())
    or
    ((empleado_id IN ( SELECT e.id
       FROM empleados e
      WHERE (e.user_id = ( SELECT auth.uid() AS uid)))))
    or
    (es_responsable())
  );

create policy "abocadosos_insert_consolidated"
  on public."trabajadores_nominas"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."trabajadores_nominas"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."trabajadores_nominas"
  for delete
  to authenticated
  using (
    (is_admin())
  );

-- trabajadores_vacaciones_cupos_anuales
drop policy "vacaciones_cupos: admin rw" on public."trabajadores_vacaciones_cupos_anuales";
drop policy "vacaciones_cupos: empleado lee propio" on public."trabajadores_vacaciones_cupos_anuales";
drop policy "vacaciones_cupos: responsable read" on public."trabajadores_vacaciones_cupos_anuales";

create policy "abocadosos_select_consolidated"
  on public."trabajadores_vacaciones_cupos_anuales"
  for select
  to authenticated
  using (
    (is_admin())
    or
    ((EXISTS ( SELECT 1
       FROM empleados e
      WHERE ((e.id = trabajadores_vacaciones_cupos_anuales.empleado_id) AND (e.user_id = ( SELECT auth.uid() AS uid)) AND (e.activo = true)))))
    or
    (es_responsable())
  );

create policy "abocadosos_insert_consolidated"
  on public."trabajadores_vacaciones_cupos_anuales"
  for insert
  to authenticated
  with check (
    (is_admin())
  );

create policy "abocadosos_update_consolidated"
  on public."trabajadores_vacaciones_cupos_anuales"
  for update
  to authenticated
  using (
    (is_admin())
  )
  with check (
    (is_admin())
  );

create policy "abocadosos_delete_consolidated"
  on public."trabajadores_vacaciones_cupos_anuales"
  for delete
  to authenticated
  using (
    (is_admin())
  );
