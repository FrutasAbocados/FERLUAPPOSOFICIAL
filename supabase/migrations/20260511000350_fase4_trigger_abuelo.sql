-- FASE 4.5b — manager_abuelo_borrar_espejo modo dual
-- Añade emit_event() al trigger de borrado espejo Abuelo → manager_facturas.

CREATE OR REPLACE FUNCTION public.manager_abuelo_borrar_espejo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Comportamiento original: borrar espejo en manager_facturas (líneas cascadean por FK)
  DELETE FROM public.manager_facturas WHERE id = old.id::text AND subtipo = 'abuelo';

  -- ── Evento al bus ──────────────────────────────────────────────────────────
  PERFORM emit_event(
    'ferlu.abuelo.venta_eliminada',
    jsonb_build_object(
      'venta_id',          old.id,
      'manager_factura_id', old.id
    ),
    'manager_ventas_abuelo',
    'low'
  );

  RETURN old;
END;
$$;
