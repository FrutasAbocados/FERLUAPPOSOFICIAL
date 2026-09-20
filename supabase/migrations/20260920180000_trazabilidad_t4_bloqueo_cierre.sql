-- T4 · Sin trazabilidad no se cierra.
--
-- A6 ya exige ficha fiscal validada, lineas completas y total cuadrado al
-- centimo con Holded. Se anade la cuarta condicion: ninguna linea puede quedar
-- sin traza. Es lo que convierte "sin trazabilidad el sistema no es valido" en
-- "no se puede cerrar sin ser valido".
--
-- Criterio: bloquea 'sin_traza'. 'lote_sin_cantidad' SI deja cerrar, porque
-- identifica proveedor, factura y lote (que es lo que pide el Reglamento
-- 178/2002); lo que no puede es cuadrar cantidades, y eso es un control extra,
-- no un requisito legal.
--
-- Va como trigger sobre el evento de cierre y no dentro de
-- facturacion_cerrar_revision_sombra: asi el bloqueo se aplica venga por donde
-- venga el cierre, y la funcion de 250 lineas no se toca.
--
-- El conjunto de trazas queda congelado por el cierre sin trabajo extra: las
-- trazas son inmutables y, con la revision cerrada, el guard de T2 impide
-- insertar nuevas.

create or replace function public.facturacion_bloquear_cierre_sin_traza()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sin     integer;
  v_ejemplo text;
begin
  if new.accion is distinct from 'cerrado' then
    return new;
  end if;

  -- Las lineas sin cantidad no se pueden trazar y no deben bloquear para
  -- siempre. Hoy no existen; la condicion evita un punto muerto si aparecen.
  select count(*)::integer, min(e.descripcion)
  into v_sin, v_ejemplo
  from public.facturacion_linea_traza_estado e
  where e.borrador_id = new.borrador_id
    and e.estado_traza = 'sin_traza'
    and e.cantidad > 0;

  if coalesce(v_sin, 0) > 0 then
    raise exception
      'No se puede cerrar: % linea(s) sin trazabilidad (ej. %). Lanza la resolucion automatica o asigna el lote a mano',
      v_sin, v_ejemplo
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create or replace trigger facturacion_revision_sombra_00_guard_traza
  before insert on public.facturacion_revision_sombra_eventos
  for each row execute function public.facturacion_bloquear_cierre_sin_traza();

-- Resumen por borrador: lo que la bandeja necesita para avisar ANTES de que
-- alguien pulse cerrar y se coma una excepcion.
create or replace view public.facturacion_borrador_traza_resumen
with (security_invoker = on)
as
select
  e.borrador_id,
  count(*)::integer                                                   as lineas,
  count(*) filter (where e.estado_traza = 'completa')::integer        as completas,
  count(*) filter (where e.estado_traza = 'lote_sin_cantidad')::integer as solo_lote,
  count(*) filter (where e.estado_traza = 'parcial')::integer         as parciales,
  count(*) filter (where e.estado_traza = 'sin_traza' and e.cantidad > 0)::integer as sin_traza,
  (count(*) filter (where e.estado_traza = 'sin_traza' and e.cantidad > 0) = 0)    as puede_cerrar,
  -- Ojo: min() alfabetico daria 'alta' antes que 'baja'. Mismo fallo que en T2.
  case
    when count(*) filter (where e.confianza_peor = 'baja')  > 0 then 'baja'
    when count(*) filter (where e.confianza_peor = 'media') > 0 then 'media'
    when count(*) filter (where e.confianza_peor = 'alta')  > 0 then 'alta'
  end as confianza_peor
from public.facturacion_linea_traza_estado e
group by e.borrador_id;

alter view public.facturacion_borrador_traza_resumen owner to postgres;
revoke all on public.facturacion_borrador_traza_resumen from anon;
grant select on public.facturacion_borrador_traza_resumen to authenticated, service_role;
