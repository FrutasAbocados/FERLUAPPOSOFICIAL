-- owner_digest (LuisOS): documentos de venta que LuisOS no cuenta.
-- Solo afecta a lo que lee LuisOS (ventas del día, semana, mes, objetivo,
-- series y cuadre); AbocadosOS y sus informes siguen con manager_ventas_efectivas.
-- Primer caso (decisión de Luis, 2026-10-07): CN260057, abono de Tamisa a la
-- F263338 del 30-sep (sustituida por F263349 + F263350). La factura ya no
-- contaba por ir Tamisa con albaranes, pero el abono sumaba hoy +1.757,80 €.

CREATE TABLE IF NOT EXISTS public.owner_digest_docs_excluidos (
  doc_number text PRIMARY KEY,
  motivo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.owner_digest_docs_excluidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_digest_docs_excluidos FROM anon, authenticated;

INSERT INTO public.owner_digest_docs_excluidos (doc_number, motivo) VALUES
  ('CN260057', 'Abono Tamisa de F263338 (30-sep), refacturada en F263349 + F263350; no cuenta en LuisOS')
ON CONFLICT (doc_number) DO NOTHING;

CREATE OR REPLACE VIEW public.owner_digest_ventas_efectivas AS
  SELECT v.* FROM public.manager_ventas_efectivas v
  WHERE NOT EXISTS (SELECT 1 FROM public.owner_digest_docs_excluidos x WHERE x.doc_number = v.doc_number);

CREATE OR REPLACE VIEW public.owner_digest_lineas_efectivas AS
  SELECT l.* FROM public.manager_lineas_efectivas l
  WHERE NOT EXISTS (
    SELECT 1 FROM public.manager_facturas f JOIN public.owner_digest_docs_excluidos x ON x.doc_number = f.doc_number
    WHERE f.id = l.factura_id);

REVOKE ALL ON public.owner_digest_ventas_efectivas, public.owner_digest_lineas_efectivas FROM anon, authenticated;

-- owner_digest_resumen(): manager_resumen_comparativo sobre las vistas de LuisOS.
-- Los owner_digest_* pasan a usarla en lugar de las del dashboard.
CREATE OR REPLACE FUNCTION pg_temp.make_digest_views() RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  d text;
  fn text;
BEGIN
  d := pg_get_functiondef('public.manager_resumen_comparativo(date, date)'::regprocedure);
  d := replace(d, 'FUNCTION public.manager_resumen_comparativo(', 'FUNCTION public.owner_digest_resumen(');
  d := replace(d, 'public.manager_ventas_efectivas', 'public.owner_digest_ventas_efectivas');
  d := replace(d, 'public.manager_lineas_efectivas', 'public.owner_digest_lineas_efectivas');
  IF position('manager_ventas_efectivas' in d) > 0 OR position('manager_lineas_efectivas' in d) > 0 THEN
    RAISE EXCEPTION 'owner_digest_resumen: quedan vistas del dashboard';
  END IF;
  EXECUTE d;

  FOREACH fn IN ARRAY ARRAY['owner_digest_build', 'owner_digest_extra', 'owner_digest_cuadre'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = fn;
    IF d IS NULL THEN RAISE EXCEPTION '% no existe', fn; END IF;
    d := replace(d, 'manager_resumen_comparativo(', 'owner_digest_resumen(');
    d := replace(d, 'manager_ventas_efectivas', 'owner_digest_ventas_efectivas');
    EXECUTE d;
  END LOOP;
END;
$patch$;
SELECT pg_temp.make_digest_views();
REVOKE ALL ON FUNCTION public.owner_digest_resumen(date, date) FROM PUBLIC, anon, authenticated;

SELECT public.owner_digest_refresh();
