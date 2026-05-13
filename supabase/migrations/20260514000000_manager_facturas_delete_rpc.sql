-- ============================================================================
-- Manager — RPC para eliminar facturas en lote (solo BD local)
-- Solo admin_full. CASCADE elimina manager_lineas automáticamente.
-- cobros_movimientos queda como historial (sin FK, no se toca).
-- ============================================================================
create or replace function public.manager_facturas_delete(p_ids text[])
returns integer
language plpgsql security definer
as $$
declare
  v_deleted integer;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin_full'
  ) then
    raise exception 'Solo admin_full puede eliminar facturas';
  end if;

  delete from public.manager_facturas
  where id = any(p_ids);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
