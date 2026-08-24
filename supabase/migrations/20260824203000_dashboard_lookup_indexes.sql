-- Acelera las resoluciones por alias/nombre que alimentan las alertas del
-- dashboard. Sin estos indices, cada linea repite busquedas laterales y las
-- tres RPC concurrentes pueden agotar el statement_timeout de PostgREST.

create index if not exists idx_manager_compra_alias_nombre_normalizado
  on public.manager_compra_alias (
    public.manager_norm_nombre(nombre_compra_norm)
  );

-- manager_lineas_producto_resueltas compara con lower(trim(...)).
create index if not exists idx_productos_holded_nombre_trim_lower
  on public.pedidos_wa_productos_holded (
    lower(trim(holded_product_name))
  );

-- manager_lineas_coste_resuelto conserva la comparacion historica sin trim.
create index if not exists idx_productos_holded_nombre_lower
  on public.pedidos_wa_productos_holded (
    lower(holded_product_name)
  );

-- Las tarjetas de coste/PVP resuelven el nombre canonico por product_id.
create index if not exists idx_productos_holded_id_updated
  on public.pedidos_wa_productos_holded (
    holded_product_id,
    updated_at desc
  );
