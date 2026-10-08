-- Una tanda puede terminar sin que el worker la cierre: si se cortó a mitad de
-- una factura, `pedidos_wa_compras_cola_reclamar` la marca al recuperarla y
-- nadie llama a `cerrar_lote`. El worker barre al final de cada vuelta las
-- tandas recientes ya terminadas y sin aviso. Las canceladas enteras no avisan.
create or replace function public.pedidos_wa_compras_cola_cerrar_pendientes()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_lote uuid; v_n int := 0;
begin
  for v_lote in
    select l.id from public.pedidos_wa_compras_cola_lotes l
     where l.notificado_at is null
       and l.created_at > now() - interval '3 days'
       and exists (select 1 from public.pedidos_wa_compras_cola c
                    where c.lote_id = l.id and c.estado <> 'cancelado')
  loop
    if public.pedidos_wa_compras_cola_cerrar_lote(v_lote) then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.pedidos_wa_compras_cola_cerrar_pendientes() from public, anon, authenticated;
grant execute on function public.pedidos_wa_compras_cola_cerrar_pendientes() to service_role;
