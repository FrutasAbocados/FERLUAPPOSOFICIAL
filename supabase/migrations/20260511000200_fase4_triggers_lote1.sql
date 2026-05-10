-- FASE 4.4 — Lote 1: triggers modo dual
-- pedidos_wa_confirmado_dispatch + notif_push_dispatch_trigger
-- Mantienen su comportamiento original (http_post a edge) Y emiten al event bus.

-- ── 1. pedidos_wa_confirmado_dispatch ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pedidos_wa_confirmado_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url      text;
  v_anon_key text;
  v_cliente  record;
  v_lineas   jsonb;
BEGIN
  -- Guardia: solo cuando estado pasa a 'confirmado' por primera vez sin Holded
  IF new.estado <> 'confirmado' THEN RETURN new; END IF;
  IF new.holded_invoice_id IS NOT NULL THEN RETURN new; END IF;
  IF old.estado = 'confirmado' THEN RETURN new; END IF;

  -- ── Comportamiento original: disparar edge pedido-a-holded ─────────────────
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    SELECT value INTO v_url      FROM public.app_settings WHERE key = 'pedido_holded_url';
    SELECT value INTO v_anon_key FROM public.app_settings WHERE key = 'pedido_holded_anon_key';
    IF v_url IS NOT NULL AND v_url <> '' THEN
      PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || coalesce(v_anon_key, '')
        ),
        body    := jsonb_build_object('pedido_id', new.id, 'auto', true)
      );
    END IF;
  END IF;

  -- ── Evento al bus ──────────────────────────────────────────────────────────
  SELECT nombre,
         holded_contact_id,
         coalesce(holded_doc_type, 'invoice') AS doc_type
    INTO v_cliente
    FROM public.pedidos_wa_clientes
   WHERE id = new.cliente_id;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'producto', coalesce(l.producto_normalizado, l.producto_raw),
        'cantidad', l.cantidad,
        'unidad',   l.unidad
      ) ORDER BY l.orden
    ),
    '[]'::jsonb
  )
    INTO v_lineas
    FROM public.pedidos_wa_lineas l
   WHERE l.pedido_id = new.id;

  PERFORM emit_event(
    'ferlu.pedido_wa.confirmado',
    jsonb_build_object(
      'pedido_id',          new.id,
      'cliente_id',         new.cliente_id,
      'cliente_nombre',     coalesce(v_cliente.nombre, ''),
      'doc_type',           coalesce(new.holded_invoice_doc_type, v_cliente.doc_type, 'invoice'),
      'holded_contact_id',  v_cliente.holded_contact_id,
      'holded_invoice_id',  null,
      'holded_invoice_num', null,
      'fecha_entrega',      new.fecha::text,
      'lineas',             coalesce(v_lineas, '[]'::jsonb)
    ),
    'pedidos_wa',
    'high'
  );

  RETURN new;
END;
$$;

-- ── 2. notif_push_dispatch_trigger ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notif_push_dispatch_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url      text;
  v_anon_key text;
BEGIN
  -- ── Comportamiento original: disparar edge notif-push-send ─────────────────
  SELECT value INTO v_url      FROM public.app_settings WHERE key = 'notif_push_url';
  SELECT value INTO v_anon_key FROM public.app_settings WHERE key = 'notif_push_anon_key';
  IF v_url IS NOT NULL AND v_url <> '' THEN
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || coalesce(v_anon_key, '')
      ),
      body    := jsonb_build_object('notif_id', new.id)
    );
  END IF;

  -- ── Evento al bus ──────────────────────────────────────────────────────────
  PERFORM emit_event(
    'ferlu.notificacion.push_solicitada',
    jsonb_build_object(
      'notificacion_id', new.id,
      'titulo',          new.titulo,
      'mensaje',         new.cuerpo,
      'tipo',            new.tipo,
      'user_id',         new.empleado_id,
      'url',             (new.payload->>'url')
    ),
    'notificaciones',
    'medium'
  );

  RETURN new;
END;
$$;
