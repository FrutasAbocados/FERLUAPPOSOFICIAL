-- ============================================================================
-- Pedidos WhatsApp — alinear RLS con MODULE_ACCESS
-- ============================================================================
-- MODULE_ACCESS.pedidos_wa = ['admin_full','admin_op','responsable']
-- Antes: admin all (CRUD) + responsable read (SELECT). Faltaba INSERT/UPDATE/
-- DELETE para `responsable` en pedidos_wa y pedidos_wa_lineas — bloqueaba al
-- guardar pedido desde la UI con error 42501.
--
-- pedidos_wa_clientes y pedidos_wa_abreviaturas se quedan como están: solo
-- admin puede crear/editar (decisión estratégica, no operativa diaria).
-- ============================================================================

-- pedidos_wa: responsable INSERT/UPDATE/DELETE
drop policy if exists "pedidos_wa: responsable insert" on public.pedidos_wa;
create policy "pedidos_wa: responsable insert"
  on public.pedidos_wa for insert
  with check (public.es_responsable());

drop policy if exists "pedidos_wa: responsable update" on public.pedidos_wa;
create policy "pedidos_wa: responsable update"
  on public.pedidos_wa for update
  using (public.es_responsable())
  with check (public.es_responsable());

drop policy if exists "pedidos_wa: responsable delete" on public.pedidos_wa;
create policy "pedidos_wa: responsable delete"
  on public.pedidos_wa for delete
  using (public.es_responsable());

-- pedidos_wa_lineas: responsable INSERT/UPDATE/DELETE
drop policy if exists "pedidos_wa_lineas: responsable insert" on public.pedidos_wa_lineas;
create policy "pedidos_wa_lineas: responsable insert"
  on public.pedidos_wa_lineas for insert
  with check (public.es_responsable());

drop policy if exists "pedidos_wa_lineas: responsable update" on public.pedidos_wa_lineas;
create policy "pedidos_wa_lineas: responsable update"
  on public.pedidos_wa_lineas for update
  using (public.es_responsable())
  with check (public.es_responsable());

drop policy if exists "pedidos_wa_lineas: responsable delete" on public.pedidos_wa_lineas;
create policy "pedidos_wa_lineas: responsable delete"
  on public.pedidos_wa_lineas for delete
  using (public.es_responsable());
