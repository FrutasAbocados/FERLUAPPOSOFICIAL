-- owner_margenes cabía en el límite de 3 s de anon solo como administrador. Ahora
-- recorre el coste resuelto una vez (no dos), filtra las facturas por fecha desde el
-- principio y ejecuta con la fecha ya puesta (plan concreto para ese día).
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

  v_fecha := case when exists (select 1 from public.manager_facturas where tipo = 'VENTA' and fecha = v_today + 1) then v_today + 1 else v_today end;

  execute format($q$
    with l as (
      select r.nombre, r.units, r.subtotal, r.subtotal_con_coste, r.cogs_linea, r.margen_linea, r.coste_fuente,
        coalesce(a.alias_to, e.contact_name) as contact_name_canon
      from public.manager_lineas_coste_resuelto r
      join public.manager_ventas_efectivas e on e.id = r.factura_id and e.fecha = %1$L::date
      left join public.manager_clientes_alias a on a.alias_from = e.contact_name
      where r.fecha = %1$L::date and r.tipo = 'VENTA'
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
      'fecha', %1$L::date,
      'es_manana', %1$L::date > %3$L::date,
      'umbral', %2$s,
      'generado', now(),
      'resumen', jsonb_build_object(
        'ventas', round(coalesce(sum(ventas), 0), 2),
        'coste', round(coalesce(sum(coste), 0), 2),
        'margen_pct', case when sum(ventas) > 0 then round(100 * sum(margen) / sum(ventas), 1) end,
        'referencias', count(*) filter (where ventas > 0),
        'bajo_umbral', count(*) filter (where ventas > 0 and 100 * margen / ventas < %2$s),
        'sin_coste_eur', round(coalesce(sum(sin_coste), 0), 2)
      ),
      'refs', coalesce((
        select jsonb_agg(jsonb_build_object(
          'nombre', nombre, 'unidades', round(unidades, 2), 'ventas', round(ventas, 2), 'coste', round(coste, 2),
          'margen_pct', round(100 * margen / ventas, 1),
          'precio_ud', case when unidades <> 0 then round(ventas / unidades, 2) end,
          'coste_ud', case when unidades <> 0 then round(coste / unidades, 2) end,
          'fuente', fuente, 'clientes', to_jsonb(clientes), 'n_clientes', n_clientes
        ) order by margen / ventas)
        from g where ventas > 0 and 100 * margen / ventas < %2$s
      ), '[]'::jsonb)
    ) from g
  $q$, v_fecha, v_umbral, v_today) into v_out;

  return v_out;
end;
$$;

revoke all on function public.owner_margenes(text, numeric) from public, authenticated;
grant execute on function public.owner_margenes(text, numeric) to anon, service_role;
