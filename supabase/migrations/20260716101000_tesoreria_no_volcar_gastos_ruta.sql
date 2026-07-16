-- Tesorería — dejar de restar los gastos de ruta del cierre del repartidor.
--
-- Álvaro lleva las salidas de tesorería a mano. El cierre del repartidor volcaba
-- cada gasto de ruta como SALIDA automática en tesoreria_movimientos
-- (fuente='cierre_repartidor', categoria='gasto_ruta'), descuadrando el saldo.
--
-- Fix: volcar_gastos sigue registrando los gastos en gastos_variables (módulo
-- Gastos) pero ya NO inserta en tesoreria_movimientos. Se limpian los ya volcados.

create or replace function public.repartos_jornada_volcar_gastos(p_jornada_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_fecha       date;
  v_empleado_id uuid;
  v_nombre      text;
  v_admin       uuid := auth.uid();
  g             record;
  v_cat         uuid;
  v_gv_id       uuid;
begin
  select fecha, empleado_id into v_fecha, v_empleado_id
  from public.repartos_jornada where id = p_jornada_id;
  if not found then return; end if;

  select nombre into v_nombre
  from public.empleados_equipo where id = v_empleado_id;

  delete from public.gastos_variables
   where id in (
     select gasto_variable_id from public.repartos_jornada_gastos
      where jornada_id = p_jornada_id and gasto_variable_id is not null
   );
  -- Limpieza defensiva de volcados históricos a tesorería (ya no se crean).
  delete from public.tesoreria_movimientos
   where jornada_id = p_jornada_id and fuente = 'cierre_repartidor';

  for g in
    select id, tipo, concepto, importe
      from public.repartos_jornada_gastos
     where jornada_id = p_jornada_id and coalesce(importe, 0) > 0
     order by orden
  loop
    v_cat := case g.tipo
      when 'gasolina' then '284b8dac-2e9e-4442-b3b4-981f8808fe1e'::uuid  -- Combustible
      else                 '0a9b7f6c-b062-4b8c-bceb-8d7456a624e1'::uuid  -- Otros
    end;

    -- total es columna generada en gastos_variables → no insertar
    insert into public.gastos_variables
      (fecha, categoria_id, subtotal, iva_pct, descripcion, metodo_pago, created_by)
    values
      (v_fecha, v_cat, g.importe, 0,
       'Ruta ' || coalesce(v_nombre, 'repartidor') || ' ' || to_char(v_fecha, 'DD/MM')
         || case when coalesce(g.concepto, '') <> '' then ' · ' || g.concepto else '' end,
       'efectivo', v_admin)
    returning id into v_gv_id;

    update public.repartos_jornada_gastos
       set gasto_variable_id = v_gv_id
     where id = g.id;

    -- NOTA: los gastos de ruta ya NO se vuelcan a tesoreria_movimientos.
    -- Álvaro registra las salidas de tesorería manualmente.
  end loop;
end;
$function$;

-- Limpieza única: retirar de tesorería los gastos de ruta ya volcados.
delete from public.tesoreria_movimientos
 where fuente = 'cierre_repartidor' and categoria = 'gasto_ruta';
