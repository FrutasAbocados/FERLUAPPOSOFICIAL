-- Gastos fijos v2: reactiva /gastos (pestaña Fijos) sobre las tablas existentes.
--
--  · `importe` es lo que se paga por periodo, IVA incluido (iva_pct = 0 en las
--    líneas nuevas para que las RPC antiguas no vuelvan a sumar IVA).
--  · Equivalente mensual = (importe + comision) / meses del periodo. Se calcula
--    en la vista `gastos_fijos_mensual` y en el cliente; nunca se almacena.
--  · `estado_dato` distingue confirmado / pendiente / estimación / sin importe.
--  · `naturaleza` fijo|variable (comisiones bancarias). La pestaña Variables
--    seguirá usando `gastos_variables`, que ya alimenta el cierre de Caja.
--  · Sustituye los 4 fijos antiguos (confirmado por Luis 2026-09-23).

-- ── Categorías ───────────────────────────────────────────────────────────────
alter table public.gastos_categorias
  add column if not exists grupo_resumen text not null default 'otros';

alter table public.gastos_categorias
  drop constraint if exists gastos_categorias_grupo_resumen_check;
alter table public.gastos_categorias
  add constraint gastos_categorias_grupo_resumen_check
  check (grupo_resumen in ('nominas', 'socios', 'prestamos', 'vehiculos', 'seguros', 'software', 'otros'));

update public.gastos_categorias set nombre = 'Nóminas trabajadores' where nombre = 'Nóminas';
update public.gastos_categorias set nombre = 'Seguridad Social'     where nombre = 'Seguros Sociales';
update public.gastos_categorias set nombre = 'Gestoría'             where nombre = 'Asesoría/Gestoría';
update public.gastos_categorias set nombre = 'Comisiones bancarias' where nombre = 'Bancos / Comisiones';

insert into public.gastos_categorias (nombre, color, orden)
select v.nombre, v.color, v.orden
from (values
  ('Préstamos',              '#f59e0b', 105),
  ('Fondo / Otros fijos',    '#64748b', 125),
  ('Colaboradores',          '#14b8a6', 115),
  ('Retribuciones socios',   '#a855f7', 102)
) as v(nombre, color, orden)
where not exists (select 1 from public.gastos_categorias c where c.nombre = v.nombre);

update public.gastos_categorias set grupo_resumen = case nombre
  when 'Nóminas trabajadores' then 'nominas'
  when 'Seguridad Social'     then 'nominas'
  when 'Retribuciones socios' then 'socios'
  when 'Préstamos'            then 'prestamos'
  when 'Vehículos'            then 'vehiculos'
  when 'Combustible'          then 'vehiculos'
  when 'Seguros'              then 'seguros'
  when 'Software'             then 'software'
  else 'otros'
end;

-- ── Gastos fijos ─────────────────────────────────────────────────────────────
alter table public.gastos_fijos
  add column if not exists periodicidad text not null default 'mensual',
  add column if not exists comision     numeric(12,2) not null default 0,
  add column if not exists persona      text,
  add column if not exists estado_dato  text not null default 'confirmado',
  add column if not exists naturaleza   text not null default 'fijo',
  add column if not exists fecha_inicio date,
  add column if not exists fecha_fin    date,
  add column if not exists empleado_id  uuid references public.empleados(id) on delete set null,
  add column if not exists vehiculo_ref text,
  add column if not exists orden        int not null default 0;

alter table public.gastos_fijos alter column importe   drop not null;
alter table public.gastos_fijos alter column dia_cargo drop not null;

alter table public.gastos_fijos
  drop constraint if exists gastos_fijos_periodicidad_check,
  drop constraint if exists gastos_fijos_comision_check,
  drop constraint if exists gastos_fijos_estado_dato_check,
  drop constraint if exists gastos_fijos_naturaleza_check,
  drop constraint if exists gastos_fijos_fechas_check;

alter table public.gastos_fijos
  add constraint gastos_fijos_periodicidad_check check (periodicidad in ('mensual', 'trimestral', 'semestral', 'anual')),
  add constraint gastos_fijos_comision_check     check (comision >= 0),
  add constraint gastos_fijos_estado_dato_check  check (estado_dato in ('confirmado', 'pendiente_confirmar', 'estimacion', 'pendiente_introducir')),
  add constraint gastos_fijos_naturaleza_check   check (naturaleza in ('fijo', 'variable')),
  add constraint gastos_fijos_fechas_check       check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio);

comment on column public.gastos_fijos.importe is 'Importe por periodo con IVA incluido. NULL = pendiente de introducir.';
comment on column public.gastos_fijos.comision is 'Comisión por periodo (préstamos). Suma al total.';

-- Contiene nóminas, retribuciones de socios y préstamos: solo admin_full.
drop policy if exists "gastos_fijos: admin rw" on public.gastos_fijos;
drop policy if exists "gastos_fijos: admin_full rw" on public.gastos_fijos;
create policy "gastos_fijos: admin_full rw" on public.gastos_fijos
  for all using ((select public.is_admin_full())) with check ((select public.is_admin_full()));

-- ── Vista de equivalente mensual (para Manager, informes, export futuros) ────
create or replace view public.gastos_fijos_mensual
with (security_invoker = true) as
select
  f.*,
  c.nombre        as categoria_nombre,
  c.grupo_resumen,
  (coalesce(f.importe, 0) + f.comision) as total_periodo,
  round((coalesce(f.importe, 0) + f.comision) / case f.periodicidad
    when 'trimestral' then 3
    when 'semestral'  then 6
    when 'anual'      then 12
    else 1
  end, 2) as importe_mensual,
  (f.activo
    and (f.fecha_inicio is null or f.fecha_inicio <= current_date)
    and (f.fecha_fin    is null or f.fecha_fin    >= current_date)) as computa
from public.gastos_fijos f
left join public.gastos_categorias c on c.id = f.categoria_id;

-- ── Sustituir los fijos antiguos por la carga buena ──────────────────────────
delete from public.gastos_fijos
where nombre in ('Seguros Sociales', 'Gestoría Gedofu', 'Nominas Trabajadores', 'Alquiler Mercedes')
  and created_at < '2026-09-23';

insert into public.gastos_fijos
  (nombre, persona, importe, comision, iva_pct, periodicidad, estado_dato, naturaleza, categoria_id, orden, notas)
select v.nombre, v.persona, v.importe, v.comision, 0, v.periodicidad, v.estado_dato, v.naturaleza, c.id, v.orden, v.notas
from (values
  ('Gasolina',               null,                     1500::numeric, 0::numeric,  'mensual',    'confirmado',           'fijo',     'Combustible',          10, null),
  ('Torres',                 'Adrián Torres',           250,           50,          'mensual',    'confirmado',           'fijo',     'Préstamos',            10, null),
  ('Germán',                 null,                      460,           0,           'mensual',    'confirmado',           'fijo',     'Préstamos',            20, null),
  ('Isa',                    null,                      410,           0,           'mensual',    'confirmado',           'fijo',     'Préstamos',            30, null),
  ('Gómez',                  'Álvaro Gómez',            500,           50,          'mensual',    'confirmado',           'fijo',     'Préstamos',            40, null),
  ('Cristian',               null,                      500,           50,          'mensual',    'confirmado',           'fijo',     'Préstamos',            50, null),
  ('Ingrid',                 null,                      430,           90,          'mensual',    'confirmado',           'fijo',     'Préstamos',            60, null),
  ('Historia',               null,                      400,           0,           'mensual',    'confirmado',           'fijo',     'Préstamos',            70, null),
  ('Gestoría',               null,                      400,           0,           'mensual',    'confirmado',           'fijo',     'Gestoría',             10, null),
  ('Fondo',                  null,                      300,           0,           'mensual',    'confirmado',           'fijo',     'Fondo / Otros fijos',  10, null),
  ('Holded',                 'Holded',                  300,           0,           'mensual',    'confirmado',           'fijo',     'Software',             10, null),
  ('Seguro / banco',         null,                      120,           0,           'mensual',    'confirmado',           'fijo',     'Seguros',              10, null),
  ('Otro seguro',            null,                      130,           0,           'mensual',    'confirmado',           'fijo',     'Seguros',              20, null),
  ('Otro seguro',            null,                      116,           0,           'trimestral', 'confirmado',           'fijo',     'Seguros',              30, null),
  ('Furgonetas',             null,                      1300,          0,           'mensual',    'confirmado',           'fijo',     'Vehículos',            10, 'Separar más adelante: furgoneta 1/2, renting, seguro, mantenimiento, ITV, impuestos.'),
  ('Seguridad Social trabajadores', null,               2500,          0,           'mensual',    'pendiente_confirmar',  'fijo',     'Seguridad Social',     10, null),
  ('Raúl',                   'Raúl Pedros',             1600,          0,           'mensual',    'confirmado',           'fijo',     'Nóminas trabajadores', 10, null),
  ('Torres / Álvaro Gómez',  'Adrián Torres · Álvaro Gómez', 1500,     0,           'mensual',    'confirmado',           'fijo',     'Nóminas trabajadores', 20, null),
  ('Alex Power',             null,                      750,           0,           'mensual',    'confirmado',           'fijo',     'Nóminas trabajadores', 30, null),
  ('Colaboradores / comerciales', null,                 500,           0,           'mensual',    'estimacion',           'fijo',     'Colaboradores',        10, 'Cobran por conseguir clientes.'),
  ('Socio 1',                null,                      2000,          0,           'mensual',    'confirmado',           'fijo',     'Retribuciones socios', 10, null),
  ('Socio 2',                null,                      2000,          0,           'mensual',    'confirmado',           'fijo',     'Retribuciones socios', 20, null),
  ('Tarjeta / gastos asociados', null,                  900,           0,           'mensual',    'confirmado',           'fijo',     'Retribuciones socios', 30, 'Pendiente de decidir clasificación contable.'),
  ('Teléfonos',              null,                      null,          0,           'mensual',    'pendiente_introducir', 'fijo',     'Telefonía / Internet', 10, null),
  ('Internet / Wi-Fi',       null,                      null,          0,           'mensual',    'pendiente_introducir', 'fijo',     'Telefonía / Internet', 20, null),
  ('Líneas móviles',         null,                      null,          0,           'mensual',    'pendiente_introducir', 'fijo',     'Telefonía / Internet', 30, null),
  ('Comisiones bancarias',   null,                      null,          0,           'mensual',    'pendiente_introducir', 'variable', 'Comisiones bancarias', 10, null)
) as v(nombre, persona, importe, comision, periodicidad, estado_dato, naturaleza, categoria, orden, notas)
join public.gastos_categorias c on c.nombre = v.categoria
where not exists (select 1 from public.gastos_fijos f where f.created_at >= '2026-09-23');
