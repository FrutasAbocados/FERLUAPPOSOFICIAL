-- Disciplina: partes leves/graves por trabajador.
--
-- Reglas de negocio (confirmadas por Luis 2026-08-31):
--   * Ventana de cómputo = MES NATURAL. El contador arranca de cero cada día 1.
--   * 3 leves equivalen a 1 grave.
--   * Cada 3 graves (directos + derivados de leves) = 1 falta = 100 € menos ese mes.
--   * Los graves que generan falta se consumen: el resto vuelve a contar desde 0
--     (implícito en la división entera; con reset mensual además nunca arrastra).
--
-- No confundir con la tabla `incidencias`, que es el tablero de incidencias de
-- CLIENTES (reclamaciones/faltas de mercancía/abonos) y no tiene relación con esto.

create table if not exists public.trabajadores_disciplina (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  fecha date not null default current_date,
  gravedad text not null check (gravedad in ('leve', 'grave')),
  motivo text not null check (length(trim(motivo)) > 0),
  nota text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.trabajadores_disciplina is
  'Partes disciplinarios por trabajador. 3 leves = 1 grave; 3 graves = 1 falta de 100 €. Cómputo por mes natural.';

create index if not exists trabajadores_disciplina_empleado_fecha_idx
  on public.trabajadores_disciplina (empleado_id, fecha desc);

create index if not exists trabajadores_disciplina_fecha_idx
  on public.trabajadores_disciplina (fecha desc);

drop trigger if exists trabajadores_disciplina_touch on public.trabajadores_disciplina;
create trigger trabajadores_disciplina_touch
  before update on public.trabajadores_disciplina
  for each row execute function public.touch_updated_at();

alter table public.trabajadores_disciplina enable row level security;

-- Lectura: admin (Luis y Álvaro) ve todo; el trabajador activo ve solo lo suyo.
drop policy if exists "disciplina: lectura autorizada" on public.trabajadores_disciplina;
create policy "disciplina: lectura autorizada"
  on public.trabajadores_disciplina for select
  to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.empleados e
      where e.id = trabajadores_disciplina.empleado_id
        and e.user_id = (select auth.uid())
        and e.activo = true
    )
  );

-- Escritura: solo admin_full / admin_op.
drop policy if exists "disciplina: admin insert" on public.trabajadores_disciplina;
create policy "disciplina: admin insert"
  on public.trabajadores_disciplina for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "disciplina: admin update" on public.trabajadores_disciplina;
create policy "disciplina: admin update"
  on public.trabajadores_disciplina for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "disciplina: admin delete" on public.trabajadores_disciplina;
create policy "disciplina: admin delete"
  on public.trabajadores_disciplina for delete
  to authenticated
  using ((select public.is_admin()));

revoke all on public.trabajadores_disciplina from anon;
grant select, insert, update, delete on public.trabajadores_disciplina to authenticated;

-- Contadores del mes. UNA sola RPC para admin y para la vista del trabajador:
-- el alcance lo decide el rol, la fórmula es idéntica en ambos casos.
create or replace function public.trabajadores_disciplina_resumen_mes(
  p_mes date default current_date
)
returns table (
  empleado_id uuid,
  nombre text,
  leves int,
  graves_directos int,
  graves_por_leves int,
  graves_totales int,
  leves_sueltos int,
  graves_pendientes int,
  leves_para_grave int,
  graves_para_falta int,
  faltas int,
  importe_falta numeric,
  descuento numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with rng as (
    select date_trunc('month', p_mes)::date as inicio,
           (date_trunc('month', p_mes) + interval '1 month')::date as fin
  ),
  partes as (
    select
      d.empleado_id,
      count(*) filter (where d.gravedad = 'leve')::int  as leves,
      count(*) filter (where d.gravedad = 'grave')::int as graves_directos
    from public.trabajadores_disciplina d
    cross join rng
    where d.fecha >= rng.inicio and d.fecha < rng.fin
    group by d.empleado_id
  ),
  base as (
    select
      e.id,
      e.nombre,
      coalesce(p.leves, 0) as leves,
      coalesce(p.graves_directos, 0) as graves_directos
    from public.empleados e
    left join partes p on p.empleado_id = e.id
    where e.activo = true
      and (
        (select public.is_admin())
        or e.user_id = (select auth.uid())
      )
  ),
  calc as (
    select
      b.*,
      (b.leves / 3) as graves_por_leves,
      (b.leves % 3) as leves_sueltos
    from base b
  ),
  tot as (
    select
      c.*,
      (c.graves_directos + c.graves_por_leves) as graves_totales
    from calc c
  )
  select
    t.id,
    t.nombre,
    t.leves,
    t.graves_directos,
    t.graves_por_leves,
    t.graves_totales,
    t.leves_sueltos,
    (t.graves_totales % 3) as graves_pendientes,
    (3 - t.leves_sueltos) as leves_para_grave,
    (3 - (t.graves_totales % 3)) as graves_para_falta,
    (t.graves_totales / 3) as faltas,
    100::numeric as importe_falta,
    ((t.graves_totales / 3) * 100)::numeric as descuento
  from tot t
  order by (t.graves_totales / 3) desc, t.graves_totales desc, t.nombre asc;
$$;

comment on function public.trabajadores_disciplina_resumen_mes(date) is
  'Contadores disciplinarios del mes. Admin ve toda la plantilla activa; el trabajador solo su propia fila.';

revoke all on function public.trabajadores_disciplina_resumen_mes(date) from public, anon;
grant execute on function public.trabajadores_disciplina_resumen_mes(date) to authenticated;
