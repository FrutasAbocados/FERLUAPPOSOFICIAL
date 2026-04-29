-- ============================================================================
-- Manager — dar acceso a admin_op (Álvaro)
-- ============================================================================
-- Antes admin_op estaba excluido de Manager por diseño. Decisión 2026-04-29:
-- Álvaro debe ver Manager y eso resuelve también el "sin sync" en su dashboard
-- (la función dashboard_kpis_hoy() es security invoker y necesita SELECT en
-- manager_holded_sync para devolver datos de sync).
--
-- Las policies son aditivas — añadir nuevas policies admin_op no invalida las
-- existentes admin_full / responsable.
-- ============================================================================

drop policy if exists "manager: admin_op rw facturas" on public.manager_facturas;
create policy "manager: admin_op rw facturas"
  on public.manager_facturas for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'));

drop policy if exists "manager: admin_op rw lineas" on public.manager_lineas;
create policy "manager: admin_op rw lineas"
  on public.manager_lineas for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'));

drop policy if exists "manager: admin_op rw contactos" on public.manager_contactos;
create policy "manager: admin_op rw contactos"
  on public.manager_contactos for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'));

drop policy if exists "manager: admin_op rw holded_sync" on public.manager_holded_sync;
create policy "manager: admin_op rw holded_sync"
  on public.manager_holded_sync for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'));

drop policy if exists "manager: admin_op rw clientes_alias" on public.manager_clientes_alias;
create policy "manager: admin_op rw clientes_alias"
  on public.manager_clientes_alias for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'));

drop policy if exists "manager: admin_op rw costes_manuales" on public.manager_costes_manuales;
create policy "manager: admin_op rw costes_manuales"
  on public.manager_costes_manuales for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'));

drop policy if exists "manager: admin_op rw lineas_abuelo" on public.manager_lineas_abuelo;
create policy "manager: admin_op rw lineas_abuelo"
  on public.manager_lineas_abuelo for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'));

drop policy if exists "manager: admin_op rw ventas_abuelo" on public.manager_ventas_abuelo;
create policy "manager: admin_op rw ventas_abuelo"
  on public.manager_ventas_abuelo for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin_op'));
