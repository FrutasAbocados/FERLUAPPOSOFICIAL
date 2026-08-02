-- Agosto 2026: completar los dos nombres de venta que quedaban sin coste.
--
-- Mango trops usa el coste vivo de MANGO EXTRA KG, ya alimentado por los
-- aliases de compra existentes. JENGIBRE KG se conecta primero con las compras
-- reales llamadas JENGIBRE y después propaga ese coste al nombre de venta.

insert into public.manager_compra_alias (
  nombre_compra_norm,
  holded_product_id,
  factor_unidad,
  nota,
  activo
)
values (
  'jengibre',
  '69863714dfa4ccd0f900dfe3',
  1,
  'Jengibre por kg; alias validado agosto 2026',
  true
)
on conflict (nombre_compra_norm) do update
set holded_product_id = excluded.holded_product_id,
    factor_unidad = excluded.factor_unidad,
    nota = excluded.nota,
    activo = excluded.activo;

insert into public.manager_coste_nombre_auto (
  nombre_norm,
  holded_product_id,
  nota
)
values
  (
    'mango trops',
    '66911802cf2a4714d5034360',
    'Mango Trops -> MANGO EXTRA KG; validado agosto 2026'
  ),
  (
    'jengibre kg',
    '69863714dfa4ccd0f900dfe3',
    'JENGIBRE KG -> compras JENGIBRE; validado agosto 2026'
  )
on conflict (nombre_norm) do update
set holded_product_id = excluded.holded_product_id,
    nota = excluded.nota,
    updated_at = now();

-- Recalcula los costes de alias y propaga inmediatamente los dos nombres.
select public.manager_refresh_coste_alias();
