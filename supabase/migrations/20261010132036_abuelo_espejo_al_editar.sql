-- Abuelo: al editar una factura (fecha, número o importes) el espejo en
-- manager_facturas / manager_lineas no se enteraba: solo había trigger al
-- borrar. La 02-319 se pasó del 9 al 10-oct y Ventas de hoy (y todas las RPC
-- que leen manager_facturas) la seguían contando el día 9.

create or replace function public.manager_abuelo_espejo_actualizar()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  update public.manager_facturas
     set fecha = new.fecha,
         fecha_vencimiento = new.fecha,
         doc_number = nullif(new.numero_factura, ''),
         subtotal = new.subtotal,
         impuestos = new.total - new.subtotal,
         total = new.total,
         payments_total = new.total,
         updated_at = now()
   where id = new.id::text and subtipo = 'abuelo';

  if new.fecha is distinct from old.fecha then
    update public.manager_lineas
       set fecha = new.fecha
     where factura_id = new.id::text and subtipo = 'abuelo';
  end if;
  return new;
end;
$$;

revoke all on function public.manager_abuelo_espejo_actualizar() from public, anon, authenticated;

drop trigger if exists trg_abuelo_espejo_actualizar on public.manager_ventas_abuelo;
create trigger trg_abuelo_espejo_actualizar
  after update of fecha, numero_factura, subtotal, total on public.manager_ventas_abuelo
  for each row
  when (old.fecha is distinct from new.fecha
        or old.numero_factura is distinct from new.numero_factura
        or old.subtotal is distinct from new.subtotal
        or old.total is distinct from new.total)
  execute function public.manager_abuelo_espejo_actualizar();

-- Lo que ya se quedó desfasado (a día de hoy, solo la 02-319).
update public.manager_facturas f
   set fecha = v.fecha,
       fecha_vencimiento = v.fecha,
       doc_number = nullif(v.numero_factura, ''),
       subtotal = v.subtotal,
       impuestos = v.total - v.subtotal,
       total = v.total,
       payments_total = v.total,
       updated_at = now()
  from public.manager_ventas_abuelo v
 where f.id = v.id::text and f.subtipo = 'abuelo'
   and (f.fecha is distinct from v.fecha or f.total is distinct from v.total
        or f.subtotal is distinct from v.subtotal or f.doc_number is distinct from nullif(v.numero_factura, ''));

update public.manager_lineas l
   set fecha = v.fecha
  from public.manager_ventas_abuelo v
 where l.factura_id = v.id::text and l.subtipo = 'abuelo' and l.fecha is distinct from v.fecha;
