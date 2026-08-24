-- Scope internal application policies to signed-in users.
-- These policies depend on auth.uid()/authenticated-only authorization helpers;
-- applying them to PUBLIC only creates redundant evaluations for unrelated roles.

alter policy "empleado_objetivo_mes: admin rw"
  on public.empleado_objetivo_mes to authenticated;
alter policy "empleado_objetivo_mes: responsable read"
  on public.empleado_objetivo_mes to authenticated;

alter policy "empleado_objetivos: admin rw"
  on public.empleado_objetivos to authenticated;
alter policy "empleado_objetivos: responsable read"
  on public.empleado_objetivos to authenticated;

alter policy "manager_compra_alias: admin rw"
  on public.manager_compra_alias to authenticated;
alter policy "manager_compra_alias: manager read"
  on public.manager_compra_alias to authenticated;

alter policy "pedidos_wa_cliente_telefonos: admin rw"
  on public.pedidos_wa_cliente_telefonos to authenticated;
alter policy "pedidos_wa_cliente_telefonos: responsable read"
  on public.pedidos_wa_cliente_telefonos to authenticated;

alter policy "pedidos_wa_clientes: admin all"
  on public.pedidos_wa_clientes to authenticated;
alter policy "pedidos_wa_clientes: empleado read"
  on public.pedidos_wa_clientes to authenticated;
alter policy "pedidos_wa_clientes: operaciones read"
  on public.pedidos_wa_clientes to authenticated;
alter policy "pedidos_wa_clientes: responsable read"
  on public.pedidos_wa_clientes to authenticated;

alter policy "compras: empleado read"
  on public.pedidos_wa_compras to authenticated;
alter policy "compras_lineas: empleado read"
  on public.pedidos_wa_compras_lineas to authenticated;

alter policy "pedidos_wa_formatos_compra: admin rw"
  on public.pedidos_wa_formatos_compra to authenticated;
alter policy "pedidos_wa_formatos_compra: operaciones read"
  on public.pedidos_wa_formatos_compra to authenticated;

alter policy "margen minimo: admin write"
  on public.pedidos_wa_margen_minimo to authenticated;
alter policy "margen minimo: equipo read"
  on public.pedidos_wa_margen_minimo to authenticated;

alter policy "pedidos_wa_producto_proveedor: admin rw"
  on public.pedidos_wa_producto_proveedor to authenticated;
alter policy "pedidos_wa_producto_proveedor: operaciones read"
  on public.pedidos_wa_producto_proveedor to authenticated;

alter policy "pedidos_wa_proveedor_alias: admin rw"
  on public.pedidos_wa_proveedor_alias to authenticated;
alter policy "pedidos_wa_proveedor_alias: empleado read"
  on public.pedidos_wa_proveedor_alias to authenticated;

alter policy "pedidos_wa_ruta_config: admin rw"
  on public.pedidos_wa_ruta_config to authenticated;
alter policy "pedidos_wa_ruta_config: operaciones read"
  on public.pedidos_wa_ruta_config to authenticated;

alter policy "pedidos_wa_ruta_extras: admin rw"
  on public.pedidos_wa_ruta_extras to authenticated;
alter policy "pedidos_wa_ruta_extras: operaciones read"
  on public.pedidos_wa_ruta_extras to authenticated;

alter policy "pedidos_wa_whatsapp_filas: admin rw"
  on public.pedidos_wa_whatsapp_filas to authenticated;
alter policy "pedidos_wa_whatsapp_filas: responsable read"
  on public.pedidos_wa_whatsapp_filas to authenticated;

alter policy "pedidos_wa_whatsapp_mensajes: admin rw"
  on public.pedidos_wa_whatsapp_mensajes to authenticated;
alter policy "pedidos_wa_whatsapp_mensajes: responsable read"
  on public.pedidos_wa_whatsapp_mensajes to authenticated;

alter policy "repartos_jornada: admin all"
  on public.repartos_jornada to authenticated;
alter policy "repartos_jornada: empleado lee propio"
  on public.repartos_jornada to authenticated;
alter policy "repartos_jornada: responsable read"
  on public.repartos_jornada to authenticated;

alter policy "repartos_jornada_gastos: admin all"
  on public.repartos_jornada_gastos to authenticated;
alter policy "repartos_jornada_gastos: empleado lee propio"
  on public.repartos_jornada_gastos to authenticated;
alter policy "repartos_jornada_gastos: responsable read"
  on public.repartos_jornada_gastos to authenticated;

alter policy "repartos_jornada_lineas: admin all"
  on public.repartos_jornada_lineas to authenticated;
alter policy "repartos_jornada_lineas: empleado lee propio"
  on public.repartos_jornada_lineas to authenticated;

alter policy "trabajadores_nominas: admin rw"
  on public.trabajadores_nominas to authenticated;
alter policy "trabajadores_nominas: empleado lee propio"
  on public.trabajadores_nominas to authenticated;
alter policy "trabajadores_nominas: responsable read"
  on public.trabajadores_nominas to authenticated;

alter policy "vacaciones_cupos: admin rw"
  on public.trabajadores_vacaciones_cupos_anuales to authenticated;
alter policy "vacaciones_cupos: responsable read"
  on public.trabajadores_vacaciones_cupos_anuales to authenticated;
