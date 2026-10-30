-- BD local desechable, después de la migración base.
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
\ir ../supabase/migrations/20261030133000_tesoreria_editar_sobres.sql
set local role authenticated;
set local app.test_admin = 'true';
insert into public.tesoreria_sobres(id,nombre) values ('00000000-0000-0000-0000-000000000001','IVA');
insert into public.tesoreria_movimientos(fecha,tipo,importe,sobre_id)
values ('2026-10-30','salida',440,'00000000-0000-0000-0000-000000000001');
select public.tesoreria_editar_sobre('00000000-0000-0000-0000-000000000001','IVA editado',500,440);
do $$ begin
  assert (select acumulado=500 and salidas_total=440 and neto_periodo=440 and nombre='IVA editado'
    from public.tesoreria_sobres_resumen('2026-10-01','2026-10-31')), 'Corrección manual independiente';
  assert (select count(*)=1 and sum(importe)=440 from public.tesoreria_movimientos), 'Caja intacta';
  begin
    perform public.tesoreria_editar_sobre('00000000-0000-0000-0000-000000000001','Edición obsoleta',600,440);
    raise exception 'Se aceptó una edición obsoleta';
  exception when raise_exception then
    if sqlerrm not like 'El acumulado ha cambiado%' then raise; end if;
  end;
end $$;
update public.tesoreria_movimientos set importe=450;
do $$ begin
  assert (select acumulado=510 from public.tesoreria_sobres_resumen('2026-10-01','2026-10-31')), 'Movimientos futuros recalculan';
end $$;
select public.tesoreria_editar_sobre('00000000-0000-0000-0000-000000000001','IVA',0,510);
do $$ begin
  assert (select acumulado=0 from public.tesoreria_sobres_resumen('2026-10-01','2026-10-31')), 'Se puede poner a cero';
end $$;
set local app.test_admin = 'false';
do $$ begin
  assert (select count(*)=0 from public.tesoreria_sobres_resumen('2026-10-01','2026-10-31')), 'RLS conserva privacidad';
  begin
    perform public.tesoreria_editar_sobre('00000000-0000-0000-0000-000000000001','Sin permiso',10,0);
    raise exception 'Se permitió editar sin permiso';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
