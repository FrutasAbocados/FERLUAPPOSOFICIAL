-- Corrección independiente de la caja; el acumulado sigue calculándose.
alter table public.tesoreria_sobres add column ajuste_manual numeric(14,2) not null default 0;

create or replace function public.tesoreria_sobres_resumen(p_desde date, p_hasta date)
returns table(id uuid, nombre text, salidas_total numeric, devoluciones_total numeric,
  acumulado numeric, neto_periodo numeric, movimientos bigint)
language sql security invoker stable set search_path = public
as $$
  with inicio as (
    select max(created_at) as corte from public.tesoreria_movimientos
    where concepto = 'Ajuste de apertura · Inicio 14/07/2026' and ajuste = true
  ), operativos as (
    select m.* from public.tesoreria_movimientos m cross join inicio i
    where i.corte is null or m.created_at > i.corte
  )
  select s.id, s.nombre,
    coalesce(sum(m.importe) filter (where m.tipo = 'salida'), 0),
    coalesce(sum(m.importe) filter (where m.tipo = 'entrada'), 0),
    coalesce(sum(case when m.tipo = 'salida' then m.importe else -m.importe end), 0) + s.ajuste_manual,
    coalesce(sum(case when m.tipo = 'salida' then m.importe else -m.importe end)
      filter (where m.fecha between p_desde and p_hasta), 0),
    count(m.id)
  from public.tesoreria_sobres s left join operativos m on m.sobre_id = s.id
  group by s.id, s.nombre order by lower(s.nombre), s.id;
$$;

create function public.tesoreria_editar_sobre(
  p_id uuid, p_nombre text, p_acumulado numeric, p_acumulado_original numeric
) returns void language plpgsql security invoker set search_path = public
as $$
declare v_actual numeric;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'No tienes permiso para editar sobres' using errcode = '42501';
  end if;
  if p_acumulado is null or p_acumulado_original is null
    or p_acumulado::text in ('NaN','Infinity','-Infinity')
    or p_acumulado <> round(p_acumulado,2) then
    raise exception 'Introduce un importe válido con un máximo de dos decimales';
  end if;
  perform 1 from public.tesoreria_sobres where id = p_id for update;
  if not found then raise exception 'El sobre ya no existe'; end if;
  select r.acumulado into v_actual
  from public.tesoreria_sobres_resumen(current_date,current_date) r where r.id = p_id;
  if v_actual is distinct from p_acumulado_original then
    raise exception 'El acumulado ha cambiado. Cancela la edición, recarga y vuelve a intentarlo.';
  end if;
  update public.tesoreria_sobres
  set nombre = btrim(p_nombre), ajuste_manual = ajuste_manual + p_acumulado - v_actual
  where id = p_id;
end;
$$;
revoke all on function public.tesoreria_editar_sobre(uuid,text,numeric,numeric) from public, anon;
grant execute on function public.tesoreria_editar_sobre(uuid,text,numeric,numeric) to authenticated;
