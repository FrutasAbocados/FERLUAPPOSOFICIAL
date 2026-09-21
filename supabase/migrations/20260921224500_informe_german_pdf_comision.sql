-- Comisión del 5% sobre la facturación sin IVA de los cinco clientes indicados.
-- Se amplía la vista previa a cualquier día; el envío automático sigue en domingo.
create or replace function public.informe_german_semanal(p_fecha date)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  inicio date := date_trunc('week', p_fecha)::date;
begin
  if p_fecha is null or p_fecha > (now() at time zone 'Europe/Madrid')::date then
    raise exception 'Fecha no válida o futura';
  end if;
  return (
    with clientes(orden, nombre, contact_id) as (values
      (1, 'Alma 1', '697683e40a5693afe8094e01'),
      (2, 'Alma 2', '6a4eb2b2c72843bfec0502b6'),
      (3, 'Family', '69c6b636212e4af57a03eee3'),
      (4, 'La Ranita', '68cfce1655a246421200dfee'),
      (5, 'Bar Betis', '69d694779b2ff2ab940a7b0b')
    ), documentos as (
      select c.orden, c.nombre, v.id, v.fecha, v.doc_number, v.subtipo, v.subtotal
      from clientes c join public.manager_ventas_efectivas v on v.contact_id=c.contact_id
      where v.fecha >= least(inicio - 7, date_trunc('month', p_fecha)::date)
        and v.fecha <= p_fecha
    ), ventas as (
      select c.orden, c.nombre,
        round(coalesce(sum(v.subtotal) filter(where v.fecha >= inicio),0),2) as semana,
        round(coalesce(sum(v.subtotal) filter(where v.fecha between inicio-7 and p_fecha-7),0),2) as anterior,
        round(coalesce(sum(v.subtotal) filter(where v.fecha >= date_trunc('month',p_fecha)::date),0),2) as mes,
        count(v.id) filter(where v.fecha >= inicio) as documentos,
        max(v.fecha) as ultima_venta
      from clientes c left join documentos v on v.orden=c.orden
      group by c.orden,c.nombre
    )
    select jsonb_build_object(
      'fecha',p_fecha,'inicio',inicio,'mes_inicio',date_trunc('month',p_fecha)::date,
      'generado_at',now(),'comision_pct',5,
      'clientes',jsonb_agg(jsonb_build_object('nombre',nombre,'semana',semana,'anterior',anterior,
        'mes',mes,'documentos',documentos,'ultima_venta',ultima_venta,
        'comision_semana',round(semana*0.05,2),'comision_mes',round(mes*0.05,2)) order by orden),
      'total_semana',sum(semana),'total_anterior',sum(anterior),'total_mes',sum(mes),
      'comision_semana',round(sum(semana)*0.05,2),'comision_mes',round(sum(mes)*0.05,2),
      'documentos',(select coalesce(jsonb_agg(jsonb_build_object('cliente',nombre,'fecha',fecha,
        'numero',coalesce(nullif(doc_number,''),id),'tipo',subtipo,'subtotal',round(subtotal,2),
        'comision',round(subtotal*0.05,2)) order by orden,fecha,doc_number),'[]'::jsonb)
        from documentos where fecha >= inicio),
      'ultima_sync',(select max(s.finished_at) from public.manager_holded_sync s
        where s.ok is true and s.range_start <= inicio-7 and s.range_end >= p_fecha)
    ) from ventas
  );
end;
$$;
revoke all on function public.informe_german_semanal(date) from public,anon,authenticated;
grant execute on function public.informe_german_semanal(date) to service_role;

alter table public.informe_german_envios add column if not exists storage_path text;
