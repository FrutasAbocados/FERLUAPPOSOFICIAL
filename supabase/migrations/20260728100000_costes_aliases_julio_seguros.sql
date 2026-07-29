-- Completa costes de ventas de julio cuando el nombre libre equivale de forma
-- inequívoca a un producto Holded con coste vivo en manager_coste_alias_calc.
-- Se resuelve el ID por nombre para no fijar identificadores externos en la migración.

with equivalencias(nombre_norm, producto_holded, nota) as (
  values
    ('espárragos xl',          'ESPARRAGOS XL',             'Equivalencia exacta sin tilde'),
    ('esparrago finos',        'ESPARRAGOS MANOJO',         'Espárrago fino por manojo'),
    ('patata clasificada n3',  'PATATA N3 CLASIFICADA',     'Mismo producto, orden de palabras'),
    ('patata melendez 10kg',   'PATATA MELENDEZ KG',        'Caja expresada como 10 unidades/kg'),
    ('uva blanca',             'UVA BLANCA KG',             'Mismo producto sin unidad'),
    ('patata torcal kg',       'PATATA AGRIA TORCAL KG',    'Mismo producto abreviado'),
    ('judia bobby',            'JUDIA BOBY KG',             'Mismo producto, variante ortográfica'),
    ('ajo pelado kg',          'AJO PELADO BOLSA 1KG',      'Mismo formato de 1 kg'),
    ('mora',                   'MORAS',                      'Singular/plural'),
    ('sandía rayada kg',       'SANDÍA BLANCA RAYADA KG',   'Mismo producto abreviado'),
    ('patata baby vitacress',  'PATATA VITACRESS',          'Mismo producto abreviado')
),
resueltas as (
  select
    e.nombre_norm,
    min(p.holded_product_id) as holded_product_id,
    min(e.nota) as nota
  from equivalencias e
  join public.pedidos_wa_productos_holded p
    on p.holded_product_name = e.producto_holded
   and p.holded_product_id <> '0'
  join public.manager_coste_alias_calc c
    on c.product_id = p.holded_product_id
   and c.coste_eur > 0
  group by e.nombre_norm
  having count(distinct p.holded_product_id) = 1
)
insert into public.manager_coste_nombre_auto (
  nombre_norm,
  holded_product_id,
  nota
)
select
  nombre_norm,
  holded_product_id,
  nota
from resueltas
on conflict (nombre_norm) do update
set holded_product_id = excluded.holded_product_id,
    nota = excluded.nota,
    updated_at = now();

select public.manager_refresh_coste_nombre_auto();

-- El nombre raw duplicaba el sufijo y quedaba fuera del alias ya existente.
insert into public.manager_clientes_alias (alias_from, alias_to)
values (
  'Victor Vinilo King SLU (Victor Beach) (Victor Beach)',
  'Victor Vinilo King SLU'
)
on conflict (alias_from) do update
set alias_to = excluded.alias_to;
