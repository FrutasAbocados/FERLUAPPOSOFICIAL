-- Red de seguridad de Pedidos WA → Holded (cron cada 2 min).
--
-- Reenviaba solo 3 pedidos por pasada y esperaba 5 min antes de tocar uno. Al
-- confirmar una tanda de 14 (incidente 14-jul-2026), recuperar los que fallaron
-- llevaba más de 10 minutos y Luis acababa subiéndolos a mano uno a uno.
--
-- Ahora reenvía el lote entero (hasta 25) y espera 3 min en vez de 5. Los 3 min
-- siguen siendo muy superiores al timeout de la edge (30 s), así que no puede
-- reenviar un pedido que aún esté en vuelo → no duplica documentos en Holded.
-- El guard real contra duplicados sigue siendo holded_invoice_id IS NULL.
create or replace function public.pedidos_wa_reconciliar_holded()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_url      text;
  v_anon_key text;
  v_rec      record;
  v_n        integer := 0;
BEGIN
  SELECT value INTO v_url      FROM public.app_settings WHERE key = 'pedido_holded_url';
  SELECT value INTO v_anon_key FROM public.app_settings WHERE key = 'pedido_holded_anon_key';
  IF v_url IS NULL OR v_url = '' THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN RETURN 0; END IF;

  FOR v_rec IN
    SELECT id
    FROM public.pedidos_wa
    WHERE estado = 'confirmado'
      AND holded_invoice_id IS NULL
      AND updated_at <  now() - interval '3 minutes'   -- parado >3 min: no en vuelo
      AND updated_at >= now() - interval '2 days'      -- ventana de seguridad
    ORDER BY updated_at
    LIMIT 25
  LOOP
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || coalesce(v_anon_key, '')
      ),
      body                 := jsonb_build_object('pedido_id', v_rec.id, 'auto', true, 'reconcile', true),
      timeout_milliseconds := 30000
    );
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$function$;
