-- Roles Abocados OS — matriz operativa 2026-05-15
-- Luis: admin_full
-- Alvaro Fersa: admin_op
-- Raul: responsable / gestor
-- Reparto y apoyo: empleado con acceso a Pedidos + Clientes

create or replace function public.puede_ver_clientes()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role, 'empleado'::public.app_role)
  );
$$;

create or replace function public.puede_operar_pedidos_wa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin_full'::public.app_role, 'admin_op'::public.app_role, 'responsable'::public.app_role, 'empleado'::public.app_role)
  );
$$;

-- Perfiles existentes. Alvaro Gomez queda pendiente porque no hay cuenta auth/profile.
update public.profiles
set role = case email
  when 'frutasabocados@gmail.com' then 'admin_full'::public.app_role
  when 'alvarofersa96@gmail.com' then 'admin_op'::public.app_role
  when 'raulpedper@gmail.com' then 'responsable'::public.app_role
  when 'adriantorrespino@gmail.com' then 'empleado'::public.app_role
  when 'alexpowerplay@gmail.com' then 'empleado'::public.app_role
  else role
end
where email in (
  'frutasabocados@gmail.com',
  'alvarofersa96@gmail.com',
  'raulpedper@gmail.com',
  'adriantorrespino@gmail.com',
  'alexpowerplay@gmail.com'
);

-- Clientes: lista principal protegida por helper nuevo.
drop function if exists public.manager_clientes_lista(date, date);

create function public.manager_clientes_lista(p_from date, p_to date)
returns table(
  contact_name_canon  text,
  contact_ids         text[],
  docs                bigint,
  ventas              numeric,
  ventas_subtotal     numeric,
  cogs                numeric,
  margen              numeric,
  margen_pct          numeric,
  pendiente_cobro     numeric,
  ultima_compra       date,
  num_aliases         int
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.puede_ver_clientes() then
    raise exception 'sin permiso para consultar clientes' using errcode = '42501';
  end if;

  return query
  with cab as (
    select
      coalesce(e.contact_name_canon, '(sin contacto)') as contact_name_canon,
      array_agg(distinct e.contact_id) filter (where e.contact_id is not null) as contact_ids,
      count(distinct e.id)                                                       as docs,
      coalesce(sum(e.total), 0)                                                  as ventas,
      coalesce(sum(case when e.subtipo = 'waybill' then e.total else 0 end), 0) as pendiente,
      max(e.fecha)                                                               as ultima_compra,
      count(distinct e.contact_name)                                             as num_alias
    from public.manager_ventas_efectivas_canon e
    where e.fecha between p_from and p_to
    group by 1
  ),
  lin as (
    select
      coalesce(l.contact_name_canon, '(sin contacto)') as contact_name_canon,
      coalesce(sum(l.subtotal), 0)     as ventas_subtotal,
      coalesce(sum(l.cogs_linea), 0)   as cogs,
      coalesce(sum(l.margen_linea), 0) as margen
    from public.manager_lineas_efectivas l
    where l.fecha between p_from and p_to
    group by 1
  )
  select
    cab.contact_name_canon,
    cab.contact_ids,
    cab.docs,
    cab.ventas,
    coalesce(lin.ventas_subtotal, 0) as ventas_subtotal,
    coalesce(lin.cogs, 0)            as cogs,
    coalesce(lin.margen, 0)          as margen,
    case when coalesce(lin.ventas_subtotal, 0) > 0
         then round((lin.margen / lin.ventas_subtotal) * 100, 1)
         else null end               as margen_pct,
    cab.pendiente                    as pendiente_cobro,
    cab.ultima_compra,
    cab.num_alias::int               as num_aliases
  from cab
  left join lin using (contact_name_canon)
  order by cab.ventas desc nulls last;
end;
$$;

grant execute on function public.manager_clientes_lista(date, date) to authenticated;
grant execute on function public.puede_ver_clientes() to authenticated;
grant execute on function public.puede_operar_pedidos_wa() to authenticated;

-- Clientes: lectura de datos base y edición operativa del seguimiento.
drop policy if exists "manager_facturas: empleado clientes read" on public.manager_facturas;
create policy "manager_facturas: empleado clientes read"
  on public.manager_facturas for select
  using (public.puede_ver_clientes());

drop policy if exists "manager_lineas: empleado clientes read" on public.manager_lineas;
create policy "manager_lineas: empleado clientes read"
  on public.manager_lineas for select
  using (public.puede_ver_clientes());

drop policy if exists "manager_contactos: empleado clientes read" on public.manager_contactos;
create policy "manager_contactos: empleado clientes read"
  on public.manager_contactos for select
  using (public.puede_ver_clientes());

drop policy if exists "manager_alias: empleado clientes read" on public.manager_clientes_alias;
create policy "manager_alias: empleado clientes read"
  on public.manager_clientes_alias for select
  using (public.puede_ver_clientes());

drop policy if exists "clientes_preferencias: equipo rw" on public.clientes_preferencias;
create policy "clientes_preferencias: equipo rw"
  on public.clientes_preferencias for all
  using (public.puede_ver_clientes())
  with check (public.puede_ver_clientes());

drop policy if exists "clientes_notas: equipo rw" on public.clientes_notas_internas;
create policy "clientes_notas: equipo rw"
  on public.clientes_notas_internas for all
  using (public.puede_ver_clientes())
  with check (public.puede_ver_clientes());

drop policy if exists "clientes_programa: equipo rw" on public.clientes_programa;
create policy "clientes_programa: equipo rw"
  on public.clientes_programa for all
  using (public.puede_ver_clientes())
  with check (public.puede_ver_clientes());

-- Pedidos WA: empleados pueden operar pedidos y líneas; tablas auxiliares solo lectura.
drop policy if exists "pedidos_wa_clientes: empleado read" on public.pedidos_wa_clientes;
create policy "pedidos_wa_clientes: empleado read"
  on public.pedidos_wa_clientes for select
  using (public.puede_operar_pedidos_wa());

drop policy if exists "pedidos_wa: empleado rw" on public.pedidos_wa;
create policy "pedidos_wa: empleado rw"
  on public.pedidos_wa for all
  using (public.puede_operar_pedidos_wa())
  with check (public.puede_operar_pedidos_wa());

drop policy if exists "pedidos_wa_lineas: empleado rw" on public.pedidos_wa_lineas;
create policy "pedidos_wa_lineas: empleado rw"
  on public.pedidos_wa_lineas for all
  using (public.puede_operar_pedidos_wa())
  with check (public.puede_operar_pedidos_wa());

drop policy if exists "abreviaturas: empleado read" on public.pedidos_wa_abreviaturas;
create policy "abreviaturas: empleado read"
  on public.pedidos_wa_abreviaturas for select
  using (public.puede_operar_pedidos_wa());

drop policy if exists "productos_holded: empleado read" on public.pedidos_wa_productos_holded;
create policy "productos_holded: empleado read"
  on public.pedidos_wa_productos_holded for select
  using (public.puede_operar_pedidos_wa());

drop policy if exists "holded_log: empleado read" on public.pedidos_wa_holded_log;
create policy "holded_log: empleado read"
  on public.pedidos_wa_holded_log for select
  using (public.puede_operar_pedidos_wa());

drop policy if exists "inventario: empleado read" on public.pedidos_wa_inventario;
create policy "inventario: empleado read"
  on public.pedidos_wa_inventario for select
  using (public.puede_operar_pedidos_wa());

drop policy if exists "inventario_lineas: empleado read" on public.pedidos_wa_inventario_lineas;
create policy "inventario_lineas: empleado read"
  on public.pedidos_wa_inventario_lineas for select
  using (public.puede_operar_pedidos_wa());

drop policy if exists "kg_por_caja: empleado read" on public.pedidos_wa_kg_por_caja;
create policy "kg_por_caja: empleado read"
  on public.pedidos_wa_kg_por_caja for select
  using (public.puede_operar_pedidos_wa());

drop policy if exists "compras: empleado read" on public.pedidos_wa_compras;
create policy "compras: empleado read"
  on public.pedidos_wa_compras for select
  using (public.puede_operar_pedidos_wa());

drop policy if exists "compras_lineas: empleado read" on public.pedidos_wa_compras_lineas;
create policy "compras_lineas: empleado read"
  on public.pedidos_wa_compras_lineas for select
  using (public.puede_operar_pedidos_wa());

drop policy if exists "recurrentes: empleado read" on public.pedidos_wa_recurrentes;
create policy "recurrentes: empleado read"
  on public.pedidos_wa_recurrentes for select
  using (public.puede_operar_pedidos_wa());

drop policy if exists "recurrentes_lineas: empleado read" on public.pedidos_wa_recurrentes_lineas;
create policy "recurrentes_lineas: empleado read"
  on public.pedidos_wa_recurrentes_lineas for select
  using (public.puede_operar_pedidos_wa());
