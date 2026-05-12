-- Tabla para ocultar productos del tab Productos (sin mapear o mapeados que se quieren eliminar)
CREATE TABLE IF NOT EXISTS public.pedidos_wa_productos_ocultos (
  producto_normalizado text PRIMARY KEY
);

-- RLS: solo admins gestionan
ALTER TABLE public.pedidos_wa_productos_ocultos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pedidos_wa_productos_ocultos: admin rw"
  ON public.pedidos_wa_productos_ocultos
  FOR ALL USING (is_admin());

-- Recrear la RPC filtrando ocultos
CREATE OR REPLACE FUNCTION public.pedidos_wa_productos_resumen()
RETURNS TABLE (
  producto_normalizado text,
  primer_uso           text,
  veces_usado          int,
  holded_product_id    text,
  holded_product_name  text,
  source               text
)
LANGUAGE sql STABLE
AS $$
  WITH productos AS (
    SELECT
      lower(trim(producto_normalizado)) AS nom,
      min(producto_normalizado)         AS primer_uso,
      count(*)::int                     AS veces_usado
    FROM public.pedidos_wa_lineas
    WHERE producto_normalizado IS NOT NULL AND producto_normalizado <> ''
    GROUP BY lower(trim(producto_normalizado))
  )
  SELECT
    p.nom                  AS producto_normalizado,
    p.primer_uso,
    p.veces_usado,
    ph.holded_product_id,
    ph.holded_product_name,
    ph.source
  FROM productos p
  LEFT JOIN public.pedidos_wa_productos_holded ph
    ON ph.producto_normalizado = p.nom
  WHERE p.nom NOT IN (
    SELECT po.producto_normalizado FROM public.pedidos_wa_productos_ocultos po
  )
  ORDER BY (ph.holded_product_id IS NULL) DESC, p.nom;
$$;
