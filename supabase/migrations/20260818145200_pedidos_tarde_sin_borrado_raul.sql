-- Una factura incorporada a Pedidos Tarde queda protegida: Raúl puede leerla,
-- registrar cobro/liquidación y corregir el método, pero no borrarla ni alterar
-- sus importes congelados. Una corrección excepcional queda para administración.

drop policy if exists "pedidos_tarde: raul rw" on public.trabajadores_pedidos_tarde_facturas;
drop policy if exists "pedidos_tarde: raul read" on public.trabajadores_pedidos_tarde_facturas;
drop policy if exists "pedidos_tarde: raul insert" on public.trabajadores_pedidos_tarde_facturas;
drop policy if exists "pedidos_tarde: raul update" on public.trabajadores_pedidos_tarde_facturas;

create policy "pedidos_tarde: raul read"
  on public.trabajadores_pedidos_tarde_facturas for select
  to authenticated
  using (public.es_raul_pedidos_tarde());

create policy "pedidos_tarde: raul insert"
  on public.trabajadores_pedidos_tarde_facturas for insert
  to authenticated
  with check (
    public.es_raul_pedidos_tarde()
    and created_by = auth.uid()
  );

create policy "pedidos_tarde: raul update"
  on public.trabajadores_pedidos_tarde_facturas for update
  to authenticated
  using (public.es_raul_pedidos_tarde())
  with check (
    public.es_raul_pedidos_tarde()
    and created_by = auth.uid()
  );

create or replace function public.trabajadores_pedidos_tarde_proteger_factura()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if row(
    new.manager_factura_id,
    new.numero_factura,
    new.cliente,
    new.fecha,
    new.subtotal,
    new.importe_total,
    new.coste,
    new.beneficio,
    new.created_by,
    new.created_at
  ) is distinct from row(
    old.manager_factura_id,
    old.numero_factura,
    old.cliente,
    old.fecha,
    old.subtotal,
    old.importe_total,
    old.coste,
    old.beneficio,
    old.created_by,
    old.created_at
  ) then
    raise exception 'La factura confirmada es inmutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trabajadores_pedidos_tarde_proteger_factura
  on public.trabajadores_pedidos_tarde_facturas;
create trigger trabajadores_pedidos_tarde_proteger_factura
  before update on public.trabajadores_pedidos_tarde_facturas
  for each row execute function public.trabajadores_pedidos_tarde_proteger_factura();

revoke delete on public.trabajadores_pedidos_tarde_facturas from authenticated;
grant select, insert, update on public.trabajadores_pedidos_tarde_facturas to authenticated;
