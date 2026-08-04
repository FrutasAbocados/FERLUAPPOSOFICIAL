-- Objetivo "BBDD de clientes al día": trazabilidad de autoría + progreso medible.
--
-- Problema: clientes_preferencias.updated_by y clientes_notas_internas.autor se
-- quedaban siempre a NULL (la app nunca los enviaba), asi que no habia forma de
-- saber quien rellena la BBDD y el plus de 200 EUR/mes no era verificable.
-- Ademas el trabajador no veia su avance (cuantos clientes le faltan).

-- 1) Autoria automatica en BD (no depende de que el cliente la mande) ─────────

create or replace function public.clientes_prefs_set_autor()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists clientes_preferencias_set_autor on public.clientes_preferencias;
create trigger clientes_preferencias_set_autor
  before insert or update on public.clientes_preferencias
  for each row execute function public.clientes_prefs_set_autor();

create or replace function public.clientes_notas_set_autor()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.autor := coalesce(new.autor, auth.uid());
  return new;
end;
$$;

drop trigger if exists clientes_notas_internas_set_autor on public.clientes_notas_internas;
create trigger clientes_notas_internas_set_autor
  before insert on public.clientes_notas_internas
  for each row execute function public.clientes_notas_set_autor();

-- 2) Metrica asociada al objetivo (permite enchufar un progreso real) ────────

alter table public.empleado_objetivos
  add column if not exists metrica text;

comment on column public.empleado_objetivos.metrica is
  'Metrica de progreso ligada al objetivo. null = solo binario cumplido/no. Valores: bbdd_clientes.';

update public.empleado_objetivos o
set metrica = 'bbdd_clientes'
from public.empleados e
where e.id = o.empleado_id
  and o.activo
  and o.metrica is null
  and o.titulo ilike '%BBDD de clientes%';

-- 3) Progreso real: clientes con ficha rellenada / clientes con actividad ────
--    Universo = clientes con ventas efectivas en los ultimos p_dias dias
--    (mismo canon que manager_clientes_lista), excluyendo '(sin contacto)'.
--    Ficha rellenada = tiene hora, dia, notas o tags.

create or replace function public.objetivo_bbdd_clientes_progreso(
  p_dias int default 90,
  p_mes date default date_trunc('month', current_date)::date
)
returns table (
  total int,
  con_ficha int,
  pct numeric,
  fichas_mes int,
  ultima_actualizacion timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.puede_ver_clientes() then
    raise exception 'sin permiso para consultar clientes' using errcode = '42501';
  end if;

  return query
  with universo as (
    select distinct coalesce(v.contact_name_canon, '(sin contacto)') as canon
    from public.manager_ventas_efectivas_canon v
    where v.fecha >= current_date - greatest(p_dias, 1)
      and coalesce(v.contact_name_canon, '(sin contacto)') <> '(sin contacto)'
  ),
  fichas as (
    select p.contact_name_canon, p.updated_at
    from public.clientes_preferencias p
    where p.hora_preferida is not null
       or p.dia_preferido is not null
       or p.notas is not null
       or coalesce(array_length(p.tags, 1), 0) > 0
  )
  select
    count(*)::int,
    count(f.contact_name_canon)::int,
    case when count(*) > 0
         then round((count(f.contact_name_canon)::numeric / count(*)) * 100, 1)
         else 0 end,
    count(*) filter (
      where f.updated_at >= p_mes
        and f.updated_at < (p_mes + interval '1 month')
    )::int,
    max(f.updated_at)
  from universo u
  left join fichas f on f.contact_name_canon = u.canon;
end;
$$;

revoke all on function public.objetivo_bbdd_clientes_progreso(int, date) from public;
grant execute on function public.objetivo_bbdd_clientes_progreso(int, date) to authenticated;
