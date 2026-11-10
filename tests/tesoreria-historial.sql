-- Solo BD local desechable. El rollback conserva vacía la BD de pruebas.
\set ON_ERROR_STOP on
begin;
create role authenticated;
create role anon;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid',true),'')::uuid $$;
create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('app.test_admin',true),'false')='true' $$;
create table public.profiles(id uuid primary key,display_name text);
create table public.tesoreria_movimientos (
 id uuid primary key default gen_random_uuid(),fecha date not null,tipo text not null,
 concepto text not null,importe numeric not null check(importe>0),notas text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.tesoreria_movimientos enable row level security;
create policy admin on public.tesoreria_movimientos for all to authenticated using ((select is_admin())) with check ((select is_admin()));
grant usage on schema auth to authenticated;
grant select,insert,update,delete on public.tesoreria_movimientos to authenticated;
insert into profiles values ('11111111-1111-1111-1111-111111111111','Administrador de prueba');
insert into tesoreria_movimientos(fecha,tipo,concepto,importe) values(current_date,'entrada','Estado anterior',815);
\ir ../supabase/migrations/20261110171558_tesoreria_historial_recuperable.sql
set local role authenticated;
set local app.test_admin='true';
set local app.test_uid='11111111-1111-1111-1111-111111111111';
do $$ begin
 assert (select count(*)=1 and sum(importe)=815 from tesoreria_movimientos),'La activación no cambia el saldo';
 assert (select count(*)=1 from tesoreria_historial where accion='inicio'),'Foto inicial';
end $$;
insert into tesoreria_movimientos(id,fecha,tipo,concepto,importe,notas)
values ('22222222-2222-2222-2222-222222222222',current_date,'salida','Prueba retirada',150,'Nota original');
update tesoreria_movimientos set importe=175,concepto='Retirada corregida' where id='22222222-2222-2222-2222-222222222222';
delete from tesoreria_movimientos where id='22222222-2222-2222-2222-222222222222';
do $$ declare v_id bigint; begin
 assert (select count(*)=3 from tesoreria_historial where movimiento_id='22222222-2222-2222-2222-222222222222'),'Alta, edición y borrado capturados';
 assert (select antes->>'importe'='150' and despues->>'importe'='175' and actor_nombre='Administrador de prueba' from tesoreria_historial where accion='edicion'),'Importes y actor antes/después';
 select id into v_id from tesoreria_historial where accion='borrado';
 perform tesoreria_restaurar_movimiento(v_id,'Borrado por error');
 assert (select importe=175 and concepto='Retirada corregida' and notas like 'Nota original%' from tesoreria_movimientos where id='22222222-2222-2222-2222-222222222222'),'Restauración completa';
 assert (select count(*)=4 from tesoreria_historial where movimiento_id='22222222-2222-2222-2222-222222222222'),'Restauración también auditada';
 begin
  perform tesoreria_restaurar_movimiento(v_id,'Segundo intento');
  raise exception 'Se permitió restaurar dos veces';
 exception when raise_exception then
  if sqlerrm not like 'Este movimiento ya se restauró%' then raise; end if;
 end;
 begin
  insert into tesoreria_historial(movimiento_id,accion,actor_nombre) values(gen_random_uuid(),'alta','Falso');
  raise exception 'Se permitió falsificar el historial';
 exception when insufficient_privilege then null; end;
 begin
  delete from tesoreria_historial;
  raise exception 'Se permitió borrar historial';
 exception when insufficient_privilege then null; end;
end $$;
set local app.test_admin='false';
do $$ begin
 assert (select count(*)=0 from tesoreria_historial),'Sin acceso al historial sin admin';
 begin
  perform tesoreria_restaurar_movimiento(1,'Intento sin permisos');
  raise exception 'Se permitió restaurar sin permisos';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 begin
  update tesoreria_historial set actor_nombre='Alterado';
  raise exception 'Se permitió alterar la auditoría como propietario';
 exception when raise_exception then
  if sqlerrm not like 'El historial de tesorería es permanente%' then raise; end if;
 end;
 begin
  truncate tesoreria_movimientos;
  raise exception 'Se permitió vaciar movimientos sin auditoría';
 exception when raise_exception then
  if sqlerrm not like 'El historial de tesorería es permanente%' then raise; end if;
 end;
end $$;
rollback;
