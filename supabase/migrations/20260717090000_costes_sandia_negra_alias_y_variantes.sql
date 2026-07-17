-- Costes — sandía negra y variantes (16/17-jul-2026)
--
-- La sandía negra resolvía 2,40 €/kg (coste genérico viejo) porque la compra real
-- de Pérez Alcalde ("SANDIA NEGRA CHURRIANA SIN PIPAS", ~0,65 €/kg) no estaba
-- enlazada al producto de venta. Se añade el alias de compra (auto-actualiza con
-- el cron) y se corrigen dos variantes escritas a mano que daban margen negativo.
-- Idempotente (upsert).

-- 1) Alias de compra: sandía negra churriana → producto venta "SANDÍA NEGRA KG"
insert into public.manager_compra_alias (nombre_compra_norm, holded_product_id, factor_unidad, activo, nota)
values ('sandia negra churriana sin pipas', '6691189896bde2717f0b5c5c', 1.0, true,
        'Compra Pérez Alcalde de sandía negra (17-jul)')
on conflict (nombre_compra_norm) do update
  set holded_product_id = excluded.holded_product_id,
      factor_unidad = excluded.factor_unidad,
      activo = true,
      updated_at = now();

-- 2) Overrides por nombre para variantes/typos sin producto vinculado
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota) values
 ('tomate raff kg', 2.00, 'Typo de tomate raf — 17-jul'),
 ('sandias negras', 0.65, 'Variante sandía negra — coste real compra churriana 17-jul')
on conflict (nombre_norm) do update
  set coste_eur = excluded.coste_eur, nota = excluded.nota, updated_at = now();

-- 3) Refrescar el cálculo de coste por alias
select public.manager_refresh_coste_alias();
