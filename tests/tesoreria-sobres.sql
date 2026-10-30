-- Ejecutar en una BD local desechable, nunca en producción:
-- psql -v ON_ERROR_STOP=1 -f tests/tesoreria-sobres.sql
begin;
create role authenticated;
create role anon;
create function public.is_admin() returns boolean language sql stable as
  $$ select coalesce(current_setting('app.test_admin',true),'false') = 'true' $$;
create table public.tesoreria_movimientos (
  id uuid primary key default gen_random_uuid(), fecha date not null,
  tipo text not null, importe numeric not null, concepto text not null default '',
  ajuste boolean not null default false, created_at timestamptz not null default now()
);
alter table public.tesoreria_movimientos enable row level security;
create policy admin on public.tesoreria_movimientos for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select,insert,update,delete on public.tesoreria_movimientos to authenticated;
\ir ../supabase/migrations/20261030120000_tesoreria_sobres.sql
set local role authenticated;
set local app.test_admin = 'true';
insert into public.tesoreria_sobres(id,nombre) values
  ('00000000-0000-0000-0000-000000000001','GF'),
  ('00000000-0000-0000-0000-000000000002','Vacío');
insert into public.tesoreria_movimientos(fecha,tipo,importe,sobre_id) values
  ('2026-09-30','salida',500,'00000000-0000-0000-0000-000000000001'),
  ('2026-10-01','salida',200,'00000000-0000-0000-0000-000000000001'),
  ('2026-10-02','entrada',50,'00000000-0000-0000-0000-000000000001'),
  ('2026-10-02','salida',999,null);
do $$
declare r record;
begin
  select * into r from public.tesoreria_sobres_resumen('2026-10-01','2026-10-31') where nombre='GF';
  assert r.acumulado = 650 and r.neto_periodo = 150 and r.salidas_total = 700
    and r.devoluciones_total = 50 and r.movimientos = 3, 'Total, devoluciones y mes';
  select * into r from public.tesoreria_sobres_resumen('2026-10-01','2026-10-31') where nombre='Vacío';
  assert r.acumulado = 0 and r.movimientos = 0, 'Sobre vacío visible sin importes ficticios';
  begin
    insert into public.tesoreria_sobres(nombre) values (' gf ');
    raise exception 'Nombre duplicado aceptado';
  exception when unique_violation then null;
  end;
  begin
    delete from public.tesoreria_sobres where nombre='GF';
    raise exception 'Se permitió borrar un sobre con movimientos';
  exception when foreign_key_violation then null;
  end;
end $$;
update public.tesoreria_movimientos set importe=300 where importe=200;
do $$ begin
  assert (select acumulado from public.tesoreria_sobres_resumen('2026-10-01','2026-10-31') where nombre='GF') = 750, 'Edición recalcula';
end $$;
update public.tesoreria_movimientos set sobre_id='00000000-0000-0000-0000-000000000002' where importe=300;
delete from public.tesoreria_movimientos where tipo='entrada';
do $$ begin
  assert (select acumulado from public.tesoreria_sobres_resumen('2026-10-01','2026-10-31') where nombre='GF') = 500, 'Reasignación y borrado recalculan';
  assert (select sum(case when tipo='salida' then -importe else importe end) from public.tesoreria_movimientos) = -1799, 'Asignar sobres no duplica salidas de caja';
end $$;
insert into public.tesoreria_movimientos(fecha,tipo,importe,sobre_id)
select '2026-10-04','salida',0.01,'00000000-0000-0000-0000-000000000001'::uuid
from generate_series(1,1501);
do $$ begin
  assert (select acumulado from public.tesoreria_sobres_resumen('2026-10-01','2026-10-31') where nombre='GF') = 515.01, 'Más de 1000 movimientos y céntimos exactos';
end $$;
-- El mismo corte operativo que los KPIs de Caja.
insert into public.tesoreria_movimientos(fecha,tipo,importe,concepto,ajuste,created_at)
values ('2026-10-03','salida',1,'Ajuste de apertura · Inicio 14/07/2026',true,now()+interval '1 second');
do $$ begin
  assert (select sum(acumulado) from public.tesoreria_sobres_resumen('2026-10-01','2026-10-31')) = 0, 'Corte de apertura respetado';
end $$;
set local app.test_admin = 'false';
do $$ begin
  assert (select count(*) from public.tesoreria_sobres_resumen('2026-10-01','2026-10-31')) = 0, 'RLS oculta sobres';
  begin
    insert into public.tesoreria_sobres(nombre) values ('No autorizado');
    raise exception 'RLS permitió crear sobre';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
