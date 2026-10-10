-- Precios de compra en LuisOS: la alerta cortaba a 12 subidas (y 8 bajadas) por
-- proveedor y el título contaba solo esas. Se sube el tope sin tocar nada más
-- de owner_digest_build: se reescribe su definición actual con los dos límites.
DO $migration$
DECLARE
  v_def text := pg_get_functiondef('public.owner_digest_build()'::regprocedure);
  v_up text := 'ORDER BY change_pct DESC LIMIT 12) u)';
  v_down text := 'ORDER BY change_pct LIMIT 8) w)';
BEGIN
  IF position(v_up IN v_def) = 0 OR position(v_down IN v_def) = 0 THEN
    RAISE EXCEPTION 'owner_digest_build ha cambiado: no encuentro los límites de supplier_prices';
  END IF;
  EXECUTE replace(replace(v_def, v_up, 'ORDER BY change_pct DESC LIMIT 40) u)'), v_down, 'ORDER BY change_pct LIMIT 20) w)');
END;
$migration$;
