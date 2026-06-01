-- ============================================================================
-- Trabajadores · premios de ruleta visibles y solicitables por empleado
-- ============================================================================

alter table public.trabajadores_ruleta_tiradas
  add column if not exists solicitado_at timestamptz,
  add column if not exists solicitado_por uuid references auth.users(id) on delete set null,
  add column if not exists canje_notas text;

create index if not exists trab_ruleta_tiradas_solicitados_idx
  on public.trabajadores_ruleta_tiradas (solicitado_at desc)
  where premio_id is not null and entregado = false;

comment on column public.trabajadores_ruleta_tiradas.solicitado_at is
  'Momento en el que el empleado pide canjear/recoger el premio ganado.';

drop function if exists public.ruleta_premios_self();
create or replace function public.ruleta_premios_self()
returns table (
  tirada_id uuid,
  empleado_id uuid,
  motivo text,
  otorgado_at timestamptz,
  tirada_at timestamptz,
  solicitado_at timestamptz,
  canje_notas text,
  entregado boolean,
  entregado_at timestamptz,
  premio_id uuid,
  premio_nombre text,
  premio_descripcion text,
  premio_tipo text,
  premio_valor numeric,
  premio_icono text,
  premio_color text
)
language sql security definer stable
set search_path = public
as $$
  select
    t.id,
    t.empleado_id,
    t.motivo,
    t.otorgado_at,
    t.tirada_at,
    t.solicitado_at,
    t.canje_notas,
    t.entregado,
    t.entregado_at,
    p.id,
    p.nombre,
    p.descripcion,
    p.tipo,
    p.valor,
    p.icono,
    p.color
  from public.trabajadores_ruleta_tiradas t
  join public.empleados e on e.id = t.empleado_id
  join public.trabajadores_ruleta_premios p on p.id = t.premio_id
  where e.user_id = auth.uid()
    and e.activo = true
  order by
    t.entregado asc,
    t.solicitado_at desc nulls last,
    t.tirada_at desc nulls last,
    t.otorgado_at desc;
$$;

revoke execute on function public.ruleta_premios_self() from public, anon;
grant execute on function public.ruleta_premios_self() to authenticated;

drop function if exists public.ruleta_solicitar_canje_self(uuid, text);
create or replace function public.ruleta_solicitar_canje_self(
  p_tirada uuid,
  p_nota text default null
)
returns table (
  tirada_id uuid,
  solicitado_at timestamptz
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_emp_id uuid;
  v_solicitado_at timestamptz;
begin
  select e.id into v_emp_id
  from public.empleados e
  where e.user_id = v_uid and e.activo = true
  limit 1;

  if v_emp_id is null then
    raise exception 'Tu cuenta no está vinculada a un empleado activo';
  end if;

  update public.trabajadores_ruleta_tiradas t
     set solicitado_at = coalesce(t.solicitado_at, now()),
         solicitado_por = v_uid,
         canje_notas = nullif(trim(coalesce(p_nota, '')), '')
   where t.id = p_tirada
     and t.empleado_id = v_emp_id
     and t.premio_id is not null
     and t.entregado = false
  returning t.solicitado_at into v_solicitado_at;

  if v_solicitado_at is null then
    raise exception 'Premio no disponible para canjear';
  end if;

  return query select p_tirada, v_solicitado_at;
end;
$$;

revoke execute on function public.ruleta_solicitar_canje_self(uuid, text) from public, anon;
grant execute on function public.ruleta_solicitar_canje_self(uuid, text) to authenticated;

drop function if exists public.ruleta_canjes_admin();
create or replace function public.ruleta_canjes_admin()
returns table (
  tirada_id uuid,
  empleado_id uuid,
  empleado_nombre text,
  motivo text,
  tirada_at timestamptz,
  solicitado_at timestamptz,
  canje_notas text,
  entregado boolean,
  entregado_at timestamptz,
  premio_id uuid,
  premio_nombre text,
  premio_tipo text,
  premio_valor numeric,
  premio_icono text
)
language sql security definer stable
set search_path = public
as $$
  select
    t.id,
    e.id,
    e.nombre,
    t.motivo,
    t.tirada_at,
    t.solicitado_at,
    t.canje_notas,
    t.entregado,
    t.entregado_at,
    p.id,
    p.nombre,
    p.tipo,
    p.valor,
    p.icono
  from public.trabajadores_ruleta_tiradas t
  join public.empleados e on e.id = t.empleado_id
  join public.trabajadores_ruleta_premios p on p.id = t.premio_id
  where public.is_admin()
  order by
    t.entregado asc,
    (t.solicitado_at is null) asc,
    coalesce(t.solicitado_at, t.tirada_at, t.otorgado_at) desc;
$$;

revoke execute on function public.ruleta_canjes_admin() from public, anon;
grant execute on function public.ruleta_canjes_admin() to authenticated;

create or replace function public.ruleta_marcar_entregado(
  p_tirada uuid,
  p_entregado boolean default true
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_empleado_id uuid;
  v_premio_tipo text;
  v_premio_valor numeric;
  v_premio_nom text;
  v_ya_entregado boolean;
begin
  if not is_admin() then
    raise exception 'Solo admin puede marcar entregas';
  end if;

  select t.empleado_id, t.entregado, p.tipo, p.valor, p.nombre
    into v_empleado_id, v_ya_entregado, v_premio_tipo, v_premio_valor, v_premio_nom
  from public.trabajadores_ruleta_tiradas t
  left join public.trabajadores_ruleta_premios p on p.id = t.premio_id
  where t.id = p_tirada;

  if v_empleado_id is null then
    raise exception 'Tirada no encontrada';
  end if;

  update public.trabajadores_ruleta_tiradas
     set entregado = p_entregado,
         entregado_at = case when p_entregado then now() else null end,
         entregado_por = case when p_entregado then auth.uid() else null end,
         solicitado_at = case when p_entregado then coalesce(solicitado_at, now()) else solicitado_at end
   where id = p_tirada;

  if p_entregado = true
     and v_ya_entregado = false
     and v_premio_tipo = 'puntos'
     and v_premio_valor <> 0 then
    insert into public.trabajadores_puntos_ajustes (empleado_id, fecha, delta_pts, motivo, creado_por)
    values (
      v_empleado_id,
      (now() at time zone 'Europe/Madrid')::date,
      v_premio_valor::smallint,
      'Ruleta: ' || v_premio_nom,
      auth.uid()
    );
  end if;

  if p_entregado = false
     and v_ya_entregado = true
     and v_premio_tipo = 'puntos'
     and v_premio_valor <> 0 then
    delete from public.trabajadores_puntos_ajustes
     where empleado_id = v_empleado_id
       and motivo = 'Ruleta: ' || v_premio_nom
       and delta_pts = v_premio_valor::smallint
       and id = (
         select id from public.trabajadores_puntos_ajustes
          where empleado_id = v_empleado_id
            and motivo = 'Ruleta: ' || v_premio_nom
            and delta_pts = v_premio_valor::smallint
          order by created_at desc
          limit 1
       );
  end if;
end;
$$;

revoke execute on function public.ruleta_marcar_entregado(uuid, boolean) from public, anon;
grant execute on function public.ruleta_marcar_entregado(uuid, boolean) to authenticated;
