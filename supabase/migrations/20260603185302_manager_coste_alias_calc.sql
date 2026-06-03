-- Coste actual por producto derivado de compras recientes MAPEADAS (manager_compra_alias).
-- Patrón precomputado (lección perf: nunca subconsultas correlacionadas en la vista caliente).
create table if not exists manager_coste_alias_calc(
  product_id text primary key,
  coste_eur  numeric(12,4) not null,
  n_compras  int,
  updated_at timestamptz not null default now()
);

alter table manager_coste_alias_calc enable row level security;
create policy "cac_sel" on manager_coste_alias_calc for select using (puede_ver_manager());

create or replace function manager_refresh_coste_alias()
returns void language plpgsql security definer set search_path = public as $$
begin
  truncate manager_coste_alias_calc;
  insert into manager_coste_alias_calc(product_id, coste_eur, n_compras)
  with ac as (
    select a.holded_product_id pid,
           a.coste_fijo,
           (l.subtotal / nullif(l.units,0)) / nullif(a.factor_unidad,0) as coste_kg
    from manager_compra_alias a
    join manager_lineas l
      on lower(trim(l.nombre)) = a.nombre_compra_norm and l.product_id is null
    join manager_facturas f on f.id = l.factura_id
    where a.activo and f.tipo = 'COMPRA' and f.fecha >= current_date - 45
  )
  select pid,
         coalesce(max(coste_fijo),
                  percentile_cont(0.5) within group (order by coste_kg))::numeric(12,4),
         count(*)
  from ac
  where pid is not null
  group by pid;
end; $$;

grant execute on function manager_refresh_coste_alias() to authenticated, service_role;
