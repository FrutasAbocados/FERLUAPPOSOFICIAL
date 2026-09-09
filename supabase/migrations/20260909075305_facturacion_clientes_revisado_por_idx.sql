create index facturacion_clientes_revisado_por_idx
  on public.facturacion_clientes (revisado_por)
  where revisado_por is not null;
