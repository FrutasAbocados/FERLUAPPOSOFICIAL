-- Precios de compra en LuisOS: cada producto lleva las unidades compradas y lo
-- que cuesta la subida en euros (pidiendo lo mismo), cada proveedor el total de
-- todo lo que sube, y las subidas se ordenan por euros, no por porcentaje.
-- Se reescribe la definición actual de owner_digest_build con reemplazos exactos.
DO $migration$
DECLARE
  v_def text := pg_get_functiondef('public.owner_digest_build()'::regprocedure);
  v_pairs text[][] := ARRAY[
    ARRAY['sum(l.subtotal) / nullif(sum(l.units), 0) AS price, count(DISTINCT f.id) AS invoices',
          'sum(l.subtotal) / nullif(sum(l.units), 0) AS price, sum(l.units) AS units, count(DISTINCT f.id) AS invoices'],
    ARRAY['round(h.price, 3) AS now, a.fecha AS before_date,',
          'round(h.price, 3) AS now, round(h.units, 2) AS units, round((h.price - a.price) * h.units, 2) AS extra_eur, a.fecha AS before_date,'],
    ARRAY['''products'', s.products,',
          '''products'', s.products,
        ''extra_eur'', (SELECT round(coalesce(sum(cmp.extra_eur), 0), 2) FROM cmp WHERE cmp.contact_id = s.contact_id AND cmp.extra_eur > 0),'],
    ARRAY['jsonb_agg(to_jsonb(u) ORDER BY u.change_pct DESC)',
          'jsonb_agg(to_jsonb(u) ORDER BY u.extra_eur DESC NULLS LAST, u.change_pct DESC)'],
    ARRAY['SELECT nombre AS product, before, now, change_pct FROM cmp WHERE cmp.contact_id = s.contact_id AND change_pct >= 3 ORDER BY change_pct DESC LIMIT 40) u)',
          'SELECT nombre AS product, before, now, change_pct, units, extra_eur FROM cmp WHERE cmp.contact_id = s.contact_id AND change_pct >= 3 ORDER BY extra_eur DESC NULLS LAST LIMIT 40) u)'],
    ARRAY['SELECT nombre AS product, before, now, change_pct FROM cmp WHERE cmp.contact_id = s.contact_id AND change_pct <= -3 ORDER BY change_pct LIMIT 20) w)',
          'SELECT nombre AS product, before, now, change_pct, units, extra_eur FROM cmp WHERE cmp.contact_id = s.contact_id AND change_pct <= -3 ORDER BY change_pct LIMIT 20) w)']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(v_pairs, 1) LOOP
    IF (length(v_def) - length(replace(v_def, v_pairs[i][1], ''))) / length(v_pairs[i][1]) <> 1 THEN
      RAISE EXCEPTION 'owner_digest_build ha cambiado: el texto % no aparece exactamente una vez', i;
    END IF;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  END LOOP;
  EXECUTE v_def;
END;
$migration$;
