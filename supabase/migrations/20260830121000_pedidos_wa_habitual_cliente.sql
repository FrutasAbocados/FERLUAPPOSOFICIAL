-- E2 · Pedido habitual del cliente, derivado del histórico real.
-- Aplicada en Supabase Ferlu el 2026-08-30.
--
-- Por qué no se lee de pedidos_wa_recurrentes: esa tabla está VACÍA (0 filas)
-- desde siempre. El histórico sí es denso (46 de 57 clientes activos con >=8
-- pedidos en 90 días) y además se adapta solo a la temporada sin mantenimiento.
--
-- Esta RPC NO calcula precios a propósito. El precio debe salir siempre de
-- pedidos_wa_resolver_completo(pedido_id) para que lo que ve el cliente en el
-- Flow y lo que se le factura no puedan divergir nunca.
--
-- Perf: el trabajo se acota primero a los N últimos pedidos del cliente (CTE
-- `ult`, que usa pedidos_wa_cliente_fecha_idx) antes de tocar líneas. Es la
-- lección del incidente 14-jul-2026 (57014 statement timeout: 90.245 buffers
-- para resolver 9 líneas por calcular sobre todo el catálogo y descartarlo).

create or replace function public.pedidos_wa_habitual_cliente(
  p_cliente_id uuid,
  p_ventana integer default 12,
  p_umbral numeric default 0.4
)
returns table (
  producto_normalizado text,
  cantidad numeric,
  unidad text,
  subseccion text,
  veces integer,
  pedidos_analizados integer,
  frecuencia numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
    or puede_operar_pedidos_wa()
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'p_cliente_id es obligatorio' using errcode = '22004';
  end if;

  return query
  with ult as (
    select pw.id
    from pedidos_wa pw
    where pw.cliente_id = p_cliente_id
      and pw.estado in ('confirmado', 'preparado', 'entregado')
    order by pw.fecha desc
    limit greatest(coalesce(p_ventana, 12), 1)
  ),
  total as (
    select count(*)::integer as n from ult
  ),
  lin as (
    -- es_gratis fuera: un regalo es una decisión comercial de Abocados,
    -- no algo que el cliente pida. Colarlo en el habitual lo regalaría solo.
    select l.producto_normalizado, l.pedido_id, l.cantidad, l.unidad, l.subseccion
    from pedidos_wa_lineas l
    join ult on ult.id = l.pedido_id
    where coalesce(l.es_gratis, false) = false
      and nullif(btrim(l.producto_normalizado), '') is not null
      and coalesce(l.cantidad, 0) > 0
  ),
  agg as (
    select
      l.producto_normalizado as prod,
      count(distinct l.pedido_id)::integer as veces,
      percentile_cont(0.5) within group (order by l.cantidad::double precision) as cant_mediana,
      mode() within group (order by l.unidad) as unidad,
      mode() within group (order by l.subseccion) as subseccion
    from lin l
    group by l.producto_normalizado
  )
  select
    a.prod,
    round(a.cant_mediana::numeric, 2),
    a.unidad,
    a.subseccion,
    a.veces,
    t.n,
    round(a.veces::numeric / nullif(t.n, 0), 2)
  from agg a
  cross join total t
  where t.n > 0
    and a.veces::numeric / t.n >= coalesce(p_umbral, 0.4)
  order by a.veces desc, a.prod;
end;
$$;

revoke all on function public.pedidos_wa_habitual_cliente(uuid, integer, numeric) from public;
revoke all on function public.pedidos_wa_habitual_cliente(uuid, integer, numeric) from anon;
grant execute on function public.pedidos_wa_habitual_cliente(uuid, integer, numeric) to authenticated, service_role;

comment on function public.pedidos_wa_habitual_cliente(uuid, integer, numeric) is
  'Pedido habitual derivado del histórico: productos presentes en >= p_umbral de los últimos p_ventana pedidos, con cantidad mediana. Sin precios a propósito (usar pedidos_wa_resolver_completo).';

-- Verificado tras aplicar:
--   * 33/33 clientes mapeados devuelven habitual; media 10,2 líneas, máx 21.
--   * Determinista: 3 ejecuciones seguidas dan hash idéntico.
--   * EXPLAIN ANALYZE 5,24 ms / 1.275 buffers (criterio era < 300 ms).
--   * Guard verificado: rol anon -> 42501 No autorizado.
