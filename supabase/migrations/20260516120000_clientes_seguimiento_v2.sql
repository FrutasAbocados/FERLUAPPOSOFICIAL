-- Seguimiento activo v2: grid 2x2 operativo diario
-- Nuevas columnas en clientes_programa
ALTER TABLE clientes_programa
  ADD COLUMN IF NOT EXISTS excluido_seguimiento    bool         NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_exclusion        text,
  ADD COLUMN IF NOT EXISTS llamado_seguimiento_at  timestamptz;

-- RPC v2: solo clientes con >= 2 pedidos en días distintos, sin excluidos ni pausados
-- dias > 0 excluye pedidos con fecha mañana (Holded pone fecha documento = día siguiente)
DROP FUNCTION IF EXISTS clientes_seguimiento_v2(int);
CREATE FUNCTION clientes_seguimiento_v2(p_dias_activo int DEFAULT 90)
RETURNS TABLE(
  contact_name_canon      text,
  ult_pedido              date,
  dias_sin_pedir          int,
  cadencia_dias           numeric,
  pedidos_activo          int,
  ventas_activo           numeric,
  llamado_seguimiento_at  timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH base AS (
    SELECT COALESCE(a.alias_to, f.contact_name) AS cn, f.fecha, f.subtotal
    FROM   public.manager_facturas f
    LEFT JOIN public.manager_clientes_alias a ON a.alias_from = f.contact_name
    WHERE  f.tipo = 'VENTA'
      AND  f.contact_name IS NOT NULL
      AND  f.fecha >= current_date - make_interval(days => p_dias_activo)
  ),
  agg AS (
    SELECT cn,
           max(fecha)::date       AS ult_pedido,
           min(fecha)::date       AS primer_pedido,
           count(DISTINCT fecha)  AS dias_con_pedido,
           count(*)::int          AS pedidos_activo,
           sum(subtotal)::numeric AS ventas_activo
    FROM   base
    GROUP BY cn
  ),
  con_cad AS (
    SELECT cn, ult_pedido, primer_pedido, pedidos_activo, ventas_activo,
           CASE WHEN dias_con_pedido >= 2 AND (ult_pedido - primer_pedido) > 0
                THEN (ult_pedido - primer_pedido)::numeric / (dias_con_pedido - 1)
           END AS cadencia_dias
    FROM   agg
    WHERE  pedidos_activo >= 2 AND dias_con_pedido >= 2
  )
  SELECT c.cn,
         c.ult_pedido,
         (current_date - c.ult_pedido)::int AS dias_sin_pedir,
         c.cadencia_dias,
         c.pedidos_activo,
         c.ventas_activo,
         prog.llamado_seguimiento_at
  FROM   con_cad c
  LEFT JOIN public.clientes_preferencias pref ON pref.contact_name_canon = c.cn
  LEFT JOIN public.clientes_programa     prog ON prog.contact_name_canon = c.cn
  WHERE  (prog.excluido_seguimiento IS NULL OR NOT prog.excluido_seguimiento)
    AND  (pref.en_pausa_hasta IS NULL OR pref.en_pausa_hasta < current_date)
    AND  (current_date - c.ult_pedido) > 0
  ORDER BY (current_date - c.ult_pedido) DESC, c.ventas_activo DESC;
$$;

-- RPC: listado de excluidos
DROP FUNCTION IF EXISTS clientes_seguimiento_excluidos();
CREATE FUNCTION clientes_seguimiento_excluidos()
RETURNS TABLE(contact_name_canon text, motivo_exclusion text, excluido_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT contact_name_canon, motivo_exclusion, updated_at
  FROM   clientes_programa
  WHERE  excluido_seguimiento = true
  ORDER BY updated_at DESC;
$$;

-- RPC: excluir cliente del seguimiento
DROP FUNCTION IF EXISTS seguimiento_excluir(text, text);
CREATE FUNCTION seguimiento_excluir(p_name text, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO clientes_programa(contact_name_canon, excluido_seguimiento, motivo_exclusion)
  VALUES (p_name, true, p_motivo)
  ON CONFLICT (contact_name_canon)
  DO UPDATE SET excluido_seguimiento = true, motivo_exclusion = p_motivo, updated_at = now();
END;
$$;

-- RPC: restaurar cliente al seguimiento
DROP FUNCTION IF EXISTS seguimiento_restaurar(text);
CREATE FUNCTION seguimiento_restaurar(p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE clientes_programa
  SET    excluido_seguimiento = false, motivo_exclusion = NULL, updated_at = now()
  WHERE  contact_name_canon = p_name;
END;
$$;

-- RPC: marcar llamado hoy
DROP FUNCTION IF EXISTS seguimiento_marcar_llamado(text);
CREATE FUNCTION seguimiento_marcar_llamado(p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO clientes_programa(contact_name_canon, llamado_seguimiento_at)
  VALUES (p_name, now())
  ON CONFLICT (contact_name_canon)
  DO UPDATE SET llamado_seguimiento_at = now(), updated_at = now();
END;
$$;
