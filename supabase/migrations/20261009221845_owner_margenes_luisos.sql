-- Comparador de márgenes para LuisOS (solo lectura). Toma los documentos de venta de
-- mañana si ya existen (Holded los trae con fecha del día siguiente); si no, los de hoy.
-- Coste por línea = manager_lineas_coste_resuelto (el mismo de los informes BI): manual,
-- última compra hasta esa fecha o medias. Devuelve las referencias bajo el umbral.
create or replace function public.owner_margenes(p_key text, p_umbral numeric default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_fecha date;
  v_umbral numeric := least(greatest(coalesce(p_umbral, 30), 0), 90);
  v_out jsonb;
begin
  if not public.owner_digest_key_ok(p_key) then
    raise exception 'owner_margenes: clave no válida' using errcode = '42501';
  end if;

  v_fecha := case when exists (select 1 from public.manager_ventas_efectivas where fecha = v_today + 1) then v_today + 1 else v_today end;

  with l as (
    select e.nombre, e.units, e.subtotal, e.subtotal_con_coste, e.cogs_linea, e.margen_linea, e.contact_name_canon, r.coste_fuente
    from public.manager_lineas_efectivas e
    join public.manager_lineas_coste_resuelto r on r.id = e.id
    where e.fecha = v_fecha and e.tipo = 'VENTA'
  ), g as (
    select public.manager_norm_nombre(coalesce(nullif(trim(nombre), ''), '(sin nombre)')) as k,
      mode() within group (order by coalesce(nullif(trim(nombre), ''), '(sin nombre)')) as nombre,
      coalesce(sum(units), 0) as unidades,
      coalesce(sum(subtotal_con_coste), 0) as ventas,
      coalesce(sum(case when subtotal_con_coste > 0 then cogs_linea else 0 end), 0) as coste,
      coalesce(sum(case when subtotal_con_coste > 0 then margen_linea else 0 end), 0) as margen,
      coalesce(sum(subtotal) filter (where subtotal_con_coste = 0), 0) as sin_coste,
      mode() within group (order by coste_fuente) as fuente,
      (array_agg(distinct contact_name_canon))[1:4] as clientes,
      count(distinct contact_name_canon) as n_clientes
    from l group by 1
  )
  select jsonb_build_object(
    'fecha', v_fecha,
    'es_manana', v_fecha > v_today,
    'umbral', v_umbral,
    'generado', now(),
    'resumen', jsonb_build_object(
      'ventas', round(coalesce(sum(ventas), 0), 2),
      'coste', round(coalesce(sum(coste), 0), 2),
      'margen_pct', case when sum(ventas) > 0 then round(100 * sum(margen) / sum(ventas), 1) end,
      'referencias', count(*) filter (where ventas > 0),
      'bajo_umbral', count(*) filter (where ventas > 0 and 100 * margen / ventas < v_umbral),
      'sin_coste_eur', round(coalesce(sum(sin_coste), 0), 2)
    ),
    'refs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', nombre,
        'unidades', round(unidades, 2),
        'ventas', round(ventas, 2),
        'coste', round(coste, 2),
        'margen_pct', round(100 * margen / ventas, 1),
        'precio_ud', case when unidades <> 0 then round(ventas / unidades, 2) end,
        'coste_ud', case when unidades <> 0 then round(coste / unidades, 2) end,
        'fuente', fuente,
        'clientes', to_jsonb(clientes),
        'n_clientes', n_clientes
      ) order by margen / ventas)
      from g where ventas > 0 and 100 * margen / ventas < v_umbral
    ), '[]'::jsonb)
  ) into v_out from g;

  return v_out;
end;
$$;

revoke all on function public.owner_margenes(text, numeric) from public, authenticated;
grant execute on function public.owner_margenes(text, numeric) to anon, service_role;
comment on function public.owner_margenes(text, numeric) is 'LuisOS: referencias bajo el umbral de margen del día (mañana si ya hay documentos). Solo lectura, clave owner_digest.';
