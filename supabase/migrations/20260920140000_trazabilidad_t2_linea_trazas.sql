-- T2 · Vinculo real entre la linea de venta y la linea de compra.
--
-- Hasta ahora la trazabilidad era una cadena de texto calculada al resolver el
-- pedido ("L260826 · F263698"): no apunta a nada, no se puede auditar y no
-- sobrevive a que la compra se edite o se borre. Esta tabla la sustituye como
-- prueba; el texto queda solo como presentacion.
--
-- Tres decisiones que la hacen defendible ante una inspeccion:
--  1. Append-only. Una imputacion equivocada no se edita: se anula con una fila
--     nueva y motivada, y ambas quedan.
--  2. Snapshot congelado del lote, origen, proveedor y factura de compra. La
--     prueba no puede depender de que la compra siga existiendo igual.
--  3. Cantidad imputada explicita, para que el balance de masas sea posible:
--     no se puede trazar mas kg de los que se compraron.

create table if not exists public.facturacion_linea_trazas (
  id                 uuid primary key default gen_random_uuid(),
  borrador_linea_id  uuid not null references public.facturacion_borrador_lineas(id) on delete cascade,
  -- Desnormalizado a proposito: el guard de cierre A6 y las consultas de
  -- retirada necesitan el borrador sin volver a la linea.
  borrador_id        uuid not null references public.facturacion_borradores(id) on delete cascade,

  -- Origen de la compra. Las subidas por /pedidos-wa tienen linea propia; las
  -- que solo existen en Holded se referencian por su PK compuesta.
  fuente             text not null check (fuente in ('compra_wa', 'compra_holded')),
  compra_id          uuid references public.pedidos_wa_compras(id) on delete set null,
  compra_linea_id    uuid references public.pedidos_wa_compras_lineas(id) on delete set null,
  manager_factura_id text,
  manager_linea_id   text,

  cantidad_imputada  numeric(12,3) not null check (cantidad_imputada > 0),
  unidad             text not null,

  -- Snapshot: se copia, no se sigue por FK.
  lote               text,
  origen             text,
  proveedor_nombre   text not null,
  num_factura        text,
  fecha_compra       date not null,
  descripcion_compra text,

  metodo             text not null check (metodo in ('auto_fifo', 'manual')),
  confianza          text not null check (confianza in ('alta', 'media', 'baja')),

  -- Correccion append-only: esta fila anula a otra y exige motivo.
  anula_traza_id     uuid references public.facturacion_linea_trazas(id),
  motivo             text,

  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),

  constraint facturacion_linea_trazas_fuente_coherente check (
    (fuente = 'compra_wa'
      and compra_linea_id is not null
      and manager_factura_id is null and manager_linea_id is null)
    or
    (fuente = 'compra_holded'
      and manager_factura_id is not null and manager_linea_id is not null
      and compra_linea_id is null)
  ),
  constraint facturacion_linea_trazas_anulacion_motivada check (
    anula_traza_id is null or (motivo is not null and length(btrim(motivo)) > 0)
  )
);

-- Una traza se anula una sola vez.
create unique index if not exists idx_facturacion_linea_trazas_anula_unica
  on public.facturacion_linea_trazas (anula_traza_id)
  where anula_traza_id is not null;

create index if not exists idx_facturacion_linea_trazas_linea
  on public.facturacion_linea_trazas (borrador_linea_id);
create index if not exists idx_facturacion_linea_trazas_borrador
  on public.facturacion_linea_trazas (borrador_id);
create index if not exists idx_facturacion_linea_trazas_compra_linea
  on public.facturacion_linea_trazas (compra_linea_id)
  where compra_linea_id is not null;
create index if not exists idx_facturacion_linea_trazas_manager_linea
  on public.facturacion_linea_trazas (manager_factura_id, manager_linea_id)
  where manager_factura_id is not null;
-- La consulta de una retirada entra por lote.
create index if not exists idx_facturacion_linea_trazas_lote
  on public.facturacion_linea_trazas (lote)
  where lote is not null;

-- borrador_id no se acepta del cliente: se deriva de la linea para que no pueda
-- quedar apuntando a otro borrador.
create or replace function public.facturacion_linea_trazas_set_borrador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select l.borrador_id into new.borrador_id
  from public.facturacion_borrador_lineas l
  where l.id = new.borrador_linea_id;

  if new.borrador_id is null then
    raise exception 'La linea de borrador % no existe', new.borrador_linea_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create or replace trigger facturacion_linea_trazas_00_set_borrador
  before insert on public.facturacion_linea_trazas
  for each row execute function public.facturacion_linea_trazas_set_borrador();

-- Mismo guard que las lineas: con la revision cerrada no entran trazas nuevas.
create or replace trigger facturacion_linea_trazas_01_guard_cierre_sombra
  before insert on public.facturacion_linea_trazas
  for each row execute function public.facturacion_bloquear_linea_cerrada_sombra();

create or replace function public.facturacion_linea_trazas_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Las trazas son inmutables: anula la traza con una fila nueva y motivada'
    using errcode = '55000';
end;
$$;

create or replace trigger facturacion_linea_trazas_append_only
  before update or delete on public.facturacion_linea_trazas
  for each row execute function public.facturacion_linea_trazas_append_only();

alter table public.facturacion_linea_trazas enable row level security;

drop policy if exists "facturacion_linea_trazas: operativa read" on public.facturacion_linea_trazas;
create policy "facturacion_linea_trazas: operativa read"
  on public.facturacion_linea_trazas for select
  using (is_admin() or es_responsable());

drop policy if exists "facturacion_linea_trazas: admin insert" on public.facturacion_linea_trazas;
create policy "facturacion_linea_trazas: admin insert"
  on public.facturacion_linea_trazas for insert
  with check (is_admin());

-- Sin UPDATE ni DELETE, tambien a nivel de privilegio.
revoke all on public.facturacion_linea_trazas from anon, authenticated, service_role;
grant select, insert on public.facturacion_linea_trazas to authenticated, service_role;

-- Trazas que cuentan: ni anuladas ni anulaciones.
create or replace view public.facturacion_linea_trazas_vigentes
with (security_invoker = on)
as
select t.*
from public.facturacion_linea_trazas t
where t.anula_traza_id is null
  and not exists (
    select 1 from public.facturacion_linea_trazas a
    where a.anula_traza_id = t.id
  );

-- Estado por linea de venta: la tolerancia de 1 g evita que un redondeo deje
-- una linea eternamente "parcial".
create or replace view public.facturacion_linea_traza_estado
with (security_invoker = on)
as
select
  l.id                        as borrador_linea_id,
  l.borrador_id,
  l.descripcion,
  l.cantidad,
  l.unidad,
  coalesce(sum(t.cantidad_imputada), 0)::numeric(12,3) as cantidad_trazada,
  case
    when coalesce(sum(t.cantidad_imputada), 0) <= 0 then 'sin_traza'
    when coalesce(sum(t.cantidad_imputada), 0) + 0.001 >= l.cantidad then 'completa'
    else 'parcial'
  end as estado_traza,
  count(t.id)                 as n_trazas,
  min(t.confianza)            as confianza_min
from public.facturacion_borrador_lineas l
left join public.facturacion_linea_trazas_vigentes t
  on t.borrador_linea_id = l.id
 and t.unidad = l.unidad
group by l.id, l.borrador_id, l.descripcion, l.cantidad, l.unidad;

-- Saldo de cada linea de compra: lo que queda sin imputar. Es el limite del
-- balance de masas de T3.
create or replace view public.facturacion_compra_linea_saldo
with (security_invoker = on)
as
select
  cl.id                       as compra_linea_id,
  cl.compra_id,
  c.fecha                     as fecha_compra,
  c.proveedor_nombre,
  c.num_factura,
  cl.descripcion,
  cl.lote,
  cl.origen,
  cl.unidad,
  cl.cantidad,
  coalesce(sum(t.cantidad_imputada), 0)::numeric(12,3) as cantidad_imputada,
  (cl.cantidad - coalesce(sum(t.cantidad_imputada), 0))::numeric(12,3) as cantidad_disponible
from public.pedidos_wa_compras_lineas cl
join public.pedidos_wa_compras c on c.id = cl.compra_id
left join public.facturacion_linea_trazas_vigentes t
  on t.compra_linea_id = cl.id
 and t.unidad = cl.unidad
group by cl.id, cl.compra_id, c.fecha, c.proveedor_nombre, c.num_factura,
         cl.descripcion, cl.lote, cl.origen, cl.unidad, cl.cantidad;

alter view public.facturacion_linea_trazas_vigentes owner to postgres;
alter view public.facturacion_linea_traza_estado owner to postgres;
alter view public.facturacion_compra_linea_saldo owner to postgres;
revoke all on public.facturacion_linea_trazas_vigentes from anon;
revoke all on public.facturacion_linea_traza_estado from anon;
revoke all on public.facturacion_compra_linea_saldo from anon;
grant select on public.facturacion_linea_trazas_vigentes to authenticated, service_role;
grant select on public.facturacion_linea_traza_estado to authenticated, service_role;
grant select on public.facturacion_compra_linea_saldo to authenticated, service_role;
