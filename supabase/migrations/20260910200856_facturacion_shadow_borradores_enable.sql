-- A4 validado: activar solo para nuevas confirmaciones de Pedidos WA.
-- No hay backfill de pedidos confirmados historicos.
update public.app_settings
set value = 'true',
    updated_at = now()
where key = 'facturacion_shadow_borradores_enabled';
