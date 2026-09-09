-- ==========================================================================
-- Facturacion propia A2: maestro fiscal de clientes
-- ==========================================================================
-- La identidad fiscal no vive en manager_contactos: esa tabla sigue siendo un
-- cache mutable de Holded. Varios clientes operativos/locales pueden compartir
-- una misma identidad fiscal (caso real ALMA 2 + alma paseo).
-- ==========================================================================

create table public.facturacion_clientes (
  id                    uuid primary key default gen_random_uuid(),
  holded_contact_id     text unique,
  nombre_fiscal         text not null check (btrim(nombre_fiscal) <> ''),
  nombre_comercial      text,
  tipo_identificacion   text not null default 'NIF'
    check (tipo_identificacion in ('NIF', 'NIE', 'VAT_UE', 'PASAPORTE', 'OTRO')),
  numero_identificacion text,
  direccion             text,
  codigo_postal         text,
  poblacion             text,
  provincia             text,
  pais_codigo           text not null default 'ES'
    check (pais_codigo ~ '^[A-Z]{2}$'),
  email_facturacion     text,
  canal_entrega         text not null default 'pendiente'
    check (canal_entrega in ('pendiente', 'email', 'descarga', 'whatsapp', 'otro')),
  modalidad_habitual    text not null default 'factura_inmediata'
    check (modalidad_habitual in ('factura_inmediata', 'albaran', 'mixta', 'sin_factura')),
  activo                boolean not null default true,
  origen                text not null default 'manual'
    check (origen in ('holded', 'manual', 'importacion')),
  revisado_at           timestamptz,
  revisado_por          uuid references auth.users(id) on delete set null,
  estado_validacion     text generated always as (
    case
      when not activo then 'inactivo'
      when btrim(coalesce(nombre_fiscal, '')) = ''
        or btrim(coalesce(numero_identificacion, '')) = ''
        or btrim(coalesce(direccion, '')) = ''
        or btrim(coalesce(codigo_postal, '')) = ''
        or btrim(coalesce(poblacion, '')) = ''
        or (pais_codigo = 'ES' and btrim(coalesce(provincia, '')) = '')
        then 'incompleto'
      when revisado_at is null then 'pendiente_revision'
      else 'validado'
    end
  ) stored,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.facturacion_clientes is
  'Maestro fiscal propio. No se reconstruye desde Holded al emitir una factura.';
comment on column public.facturacion_clientes.estado_validacion is
  'incompleto, pendiente_revision, validado o inactivo; calculado desde la ficha y su revision.';

create index facturacion_clientes_estado_idx
  on public.facturacion_clientes (estado_validacion, nombre_fiscal);
create index facturacion_clientes_nif_idx
  on public.facturacion_clientes (numero_identificacion)
  where numero_identificacion is not null;

create table public.facturacion_cliente_operativo (
  pedido_wa_cliente_id    uuid primary key
    references public.pedidos_wa_clientes(id) on delete cascade,
  facturacion_cliente_id  uuid not null
    references public.facturacion_clientes(id) on delete restrict,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.facturacion_cliente_operativo is
  'Relacion muchos-a-uno entre locales/clientes de Pedidos WA e identidad fiscal.';

create index facturacion_cliente_operativo_fiscal_idx
  on public.facturacion_cliente_operativo (facturacion_cliente_id);

create or replace function public.facturacion_clientes_touch_updated()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();

  if row(
    new.nombre_fiscal,
    new.tipo_identificacion,
    new.numero_identificacion,
    new.direccion,
    new.codigo_postal,
    new.poblacion,
    new.provincia,
    new.pais_codigo,
    new.activo
  ) is distinct from row(
    old.nombre_fiscal,
    old.tipo_identificacion,
    old.numero_identificacion,
    old.direccion,
    old.codigo_postal,
    old.poblacion,
    old.provincia,
    old.pais_codigo,
    old.activo
  ) then
    new.revisado_at := null;
    new.revisado_por := null;
  end if;

  return new;
end;
$$;

drop trigger if exists facturacion_clientes_touch on public.facturacion_clientes;
create trigger facturacion_clientes_touch
  before update on public.facturacion_clientes
  for each row execute function public.facturacion_clientes_touch_updated();

create or replace function public.facturacion_cliente_operativo_touch_updated()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists facturacion_cliente_operativo_touch on public.facturacion_cliente_operativo;
create trigger facturacion_cliente_operativo_touch
  before update on public.facturacion_cliente_operativo
  for each row execute function public.facturacion_cliente_operativo_touch_updated();

-- Semilla: contactos que ya aparecen en ventas o están vinculados a Pedidos WA.
-- Nada se marca como revisado automáticamente: importar no equivale a validar.
with candidatos as (
  select distinct f.contact_id as holded_contact_id
  from public.manager_facturas f
  where f.tipo = 'VENTA' and f.contact_id is not null
  union
  select distinct p.holded_contact_id
  from public.pedidos_wa_clientes p
  where p.holded_contact_id is not null
),
ventas as (
  select
    f.contact_id,
    (array_agg(f.contact_name order by f.fecha desc nulls last, f.updated_at desc))[1] as ultimo_nombre
  from public.manager_facturas f
  where f.tipo = 'VENTA' and f.contact_id is not null
  group by f.contact_id
),
operativa as (
  select
    p.holded_contact_id,
    (array_agg(p.nombre order by p.activo desc, p.nombre))[1] as nombre_comercial,
    bool_or(p.activo) as activo,
    bool_or(p.holded_doc_type = 'waybill') as usa_albaran,
    bool_or(coalesce(p.holded_doc_type, 'invoice') = 'invoice' or p.tipo_factura = 'DRIVE') as usa_factura,
    bool_and(p.tipo_factura = 'NINGUNA') as sin_factura
  from public.pedidos_wa_clientes p
  where p.holded_contact_id is not null
  group by p.holded_contact_id
)
insert into public.facturacion_clientes (
  holded_contact_id,
  nombre_fiscal,
  nombre_comercial,
  numero_identificacion,
  direccion,
  codigo_postal,
  poblacion,
  provincia,
  pais_codigo,
  modalidad_habitual,
  activo,
  origen
)
select
  ca.holded_contact_id,
  coalesce(nullif(btrim(c.nombre), ''), nullif(btrim(v.ultimo_nombre), ''), o.nombre_comercial, 'Cliente sin nombre'),
  o.nombre_comercial,
  nullif(btrim(c.nif), ''),
  nullif(btrim(c.direccion), ''),
  nullif(btrim(c.cp), ''),
  nullif(btrim(c.poblacion), ''),
  nullif(btrim(c.provincia), ''),
  case
    when lower(btrim(coalesce(c.pais, ''))) in ('es', 'espana', 'españa', 'spain') then 'ES'
    else 'ES'
  end,
  case
    when o.sin_factura then 'sin_factura'
    when o.usa_albaran and o.usa_factura then 'mixta'
    when o.usa_albaran then 'albaran'
    else 'factura_inmediata'
  end,
  coalesce(o.activo, true),
  'holded'
from candidatos ca
left join public.manager_contactos c on c.id = ca.holded_contact_id
left join ventas v on v.contact_id = ca.holded_contact_id
left join operativa o on o.holded_contact_id = ca.holded_contact_id;

insert into public.facturacion_cliente_operativo (
  pedido_wa_cliente_id,
  facturacion_cliente_id
)
select p.id, fc.id
from public.pedidos_wa_clientes p
join public.facturacion_clientes fc
  on fc.holded_contact_id = p.holded_contact_id
where p.holded_contact_id is not null;

-- Una validacion es una accion separada del guardado. La funcion impide marcar
-- como revisada una ficha estructuralmente incompleta y registra al actor real.
create or replace function public.facturacion_validar_cliente(p_cliente_id uuid)
returns public.facturacion_clientes
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cliente public.facturacion_clientes;
begin
  if not public.is_admin() then
    raise exception 'Solo administracion puede validar datos fiscales' using errcode = '42501';
  end if;

  select * into v_cliente
  from public.facturacion_clientes
  where id = p_cliente_id
  for update;

  if not found then
    raise exception 'Cliente fiscal no encontrado' using errcode = 'P0002';
  end if;

  if v_cliente.estado_validacion = 'incompleto' then
    raise exception 'La ficha fiscal esta incompleta' using errcode = '23514';
  end if;

  update public.facturacion_clientes
  set revisado_at = now(), revisado_por = auth.uid()
  where id = p_cliente_id
  returning * into v_cliente;

  return v_cliente;
end;
$$;

alter table public.facturacion_clientes enable row level security;
alter table public.facturacion_cliente_operativo enable row level security;

create policy "facturacion_clientes: clientes read"
  on public.facturacion_clientes for select
  using (public.puede_ver_clientes());

create policy "facturacion_clientes: admin rw"
  on public.facturacion_clientes for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "facturacion_cliente_operativo: clientes read"
  on public.facturacion_cliente_operativo for select
  using (public.puede_ver_clientes());

create policy "facturacion_cliente_operativo: admin rw"
  on public.facturacion_cliente_operativo for all
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.facturacion_clientes from anon;
revoke all on public.facturacion_cliente_operativo from anon;
grant select on public.facturacion_clientes to authenticated;
grant insert, update, delete on public.facturacion_clientes to authenticated;
grant select on public.facturacion_cliente_operativo to authenticated;
grant insert, update, delete on public.facturacion_cliente_operativo to authenticated;

revoke all on function public.facturacion_validar_cliente(uuid) from public, anon;
grant execute on function public.facturacion_validar_cliente(uuid) to authenticated, service_role;
