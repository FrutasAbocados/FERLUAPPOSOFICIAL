-- ==========================================================================
-- Borrar un Pedido WA que ya tiene borrador sombra A4
-- ==========================================================================
-- facturacion_borradores.pedido_wa_id es ON DELETE RESTRICT, asi que borrar
-- desde el cliente un pedido confirmado fallaba con la FK. Esta RPC borra el
-- borrador sombra solo si sigue intacto (sin trazas, cierre, simulacion ni
-- albaran); su borrado queda en facturacion_eventos_editables por el trigger
-- de auditoria. Si el borrador ya tiene historia, el pedido no se borra.
-- ==========================================================================

create or replace function public.pedidos_wa_eliminar(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borrador record;
begin
  if not (public.is_admin() or public.puede_operar_pedidos_wa() or public.es_responsable()) then
    raise exception 'Sin permiso para borrar pedidos' using errcode = '42501';
  end if;

  perform 1 from public.pedidos_wa where id = p_pedido_id for update;
  if not found then
    raise exception 'El pedido no existe' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.facturacion_albaranes where pedido_wa_id = p_pedido_id) then
    raise exception 'El pedido tiene un albaran propio en Facturacion; no se puede borrar'
      using errcode = '55000';
  end if;

  select b.id, b.estado into v_borrador
  from public.facturacion_borradores b
  where b.pedido_wa_id = p_pedido_id
  for update;

  if found then
    if v_borrador.estado = 'emitting'
      or exists (select 1 from public.facturacion_albaranes where borrador_id = v_borrador.id)
      or exists (select 1 from public.facturacion_revision_sombra_eventos where borrador_id = v_borrador.id)
      or exists (select 1 from public.facturacion_verifactu_simulaciones where borrador_id = v_borrador.id)
      or exists (select 1 from public.facturacion_linea_trazas where borrador_id = v_borrador.id)
    then
      raise exception 'El borrador de facturacion de este pedido ya tiene revision, trazas o simulacion; gestionalo en Facturacion antes de borrar el pedido'
        using errcode = '55000';
    end if;

    delete from public.facturacion_borradores where id = v_borrador.id;
  end if;

  delete from public.pedidos_wa where id = p_pedido_id;
end;
$$;

revoke all on function public.pedidos_wa_eliminar(uuid) from public, anon;
grant execute on function public.pedidos_wa_eliminar(uuid) to authenticated;

comment on function public.pedidos_wa_eliminar(uuid) is
  'Borra un Pedido WA y, si esta intacto, su borrador sombra A4 (auditado). Bloquea si el borrador tiene historia.';
