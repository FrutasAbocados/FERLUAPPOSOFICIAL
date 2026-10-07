-- owner_digest (LuisOS) preparado de antemano: AbocadosOS lo calcula cada 2 min
-- (pg_cron, sin el límite de 3 s de anon) y la llamada de LuisOS solo lo lee.
-- Por la mañana el cálculo pasaba de 3 s y PostgREST lo cortaba («statement timeout»).

CREATE TABLE IF NOT EXISTS public.owner_digest_snapshot (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL,
  built_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.owner_digest_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_digest_snapshot FROM anon, authenticated;

-- owner_digest_build(): el mismo cálculo que owner_digest, sin clave (solo servidor).
CREATE OR REPLACE FUNCTION pg_temp.make_build() RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  d text := pg_get_functiondef('public.owner_digest(text)'::regprocedure);
  key_start int;
  key_end int;
BEGIN
  IF position('owner_digest_snapshot' in d) > 0 THEN RETURN; END IF; -- ya es el lector
  d := replace(d, 'FUNCTION public.owner_digest(p_key text)', 'FUNCTION public.owner_digest_build()');
  key_start := position('UPDATE public.integration_access_keys' in d);
  key_end := position('END IF;' in substr(d, key_start)) + key_start + length('END IF;') - 1;
  IF key_start = 0 THEN RAISE EXCEPTION 'bloque de clave no encontrado'; END IF;
  d := substr(d, 1, key_start - 1) || substr(d, key_end);
  EXECUTE d;
END;
$patch$;
SELECT pg_temp.make_build();
REVOKE ALL ON FUNCTION public.owner_digest_build() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.owner_digest_refresh()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO owner_digest_snapshot (id, data, built_at) VALUES (1, owner_digest_build(), now())
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, built_at = EXCLUDED.built_at;
END;
$function$;
REVOKE ALL ON FUNCTION public.owner_digest_refresh() FROM PUBLIC, anon, authenticated;

-- La llamada de LuisOS: clave + foto preparada (si por lo que sea es vieja, se calcula).
CREATE OR REPLACE FUNCTION public.owner_digest(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ok boolean;
  v_data jsonb;
  v_at timestamptz;
BEGIN
  UPDATE public.integration_access_keys
     SET last_used_at = now()
   WHERE name = 'luisos' AND active AND scope = 'owner_digest'
     AND key_sha256 = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex')
  RETURNING true INTO v_ok;
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'owner_digest: clave no válida' USING ERRCODE = '42501';
  END IF;
  SELECT data, built_at INTO v_data, v_at FROM owner_digest_snapshot WHERE id = 1;
  IF v_data IS NULL OR v_at < now() - interval '10 minutes' THEN
    RETURN owner_digest_build();
  END IF;
  RETURN v_data || jsonb_build_object('built_at', v_at);
END;
$function$;

SELECT public.owner_digest_refresh();

SELECT cron.schedule('owner-digest-luisos', '*/2 * * * *', $$SELECT public.owner_digest_refresh()$$);
