-- Seed inicial de mapeos validados con Luis (2026-06-03) + cron de refresco diario.
-- Idempotente: on conflict actualiza. Resuelve holded_product_id por nombre de catálogo.
with seed(nombre, target, factor, fijo, nota) as (values
  ('tomate daniela','TOMATE DANIELA KG',1,null,'val Luis'),
  ('tomate daniela h* +-7 k/c(kg)(*c)','TOMATE DANIELA KG',1,null,'val Luis'),
  ('tomate daniela primera','TOMATE DANIELA KG',1,null,'val Luis'),
  ('tomate pera 1º','TOMATE PERA EXTRA KG',1,null,'val Luis'),
  ('tomate pera extra*+- 12 k/c*(kg)(*c)','TOMATE PERA EXTRA KG',1,null,'val Luis'),
  ('pimientos rojos (asar)','PIMIENTO ROJO ASAR KG',1,null,'val Luis'),
  ('pimientos verdes (asar)','PIMIENTO VERDE ASAR KG',1,null,'val Luis'),
  ('berenjenas','BERENJENA KG',1,null,'val Luis'),
  ('berenjena negra 1º','BERENJENA KG',1,null,'val Luis'),
  ('calabacines','CALABACÍN KG',1,null,'val Luis'),
  ('calabacin gordo 1º','CALABACÍN KG',1,null,'val Luis'),
  ('limones verna','LIMÓN VERNA KG',1,null,'val Luis'),
  ('brocoli','BROCOLI',1,null,'val Luis'),
  ('ajo pelado bolsa 1kg','AJO PELADO BOLSA 1KG',1,null,'val Luis'),
  ('patatas nuevas','PATATA NUEVA KG',1,null,'val Luis'),
  ('patatas especial freir "agria"','PATATA AGRIA TORCAL KG',1,null,'val Luis'),
  ('patata esp.freir agria papel *15k/c*(kg','PATATA AGRIA TORCAL KG',1,null,'val Luis'),
  ('patata esp.freir agria papel *15k/c*kg','PATATA AGRIA TORCAL KG',1,null,'val Luis'),
  ('patata esp.freir agria papel *15k/c*(kg-','PATATA AGRIA TORCAL KG',1,null,'val Luis'),
  ('patata esp.freir agria papel *15k/c*(kg)','PATATA AGRIA TORCAL KG',1,null,'val Luis'),
  ('patatas clasificadas nº3','PATATA N3 CLASIFICADA',1,null,'val Luis'),
  ('fresas 1 lecho','FRESAS',1,null,'val Luis'),
  ('arandanos','ARANDANO',1,null,'val Luis'),
  ('coliflor piezas','COLIFLOR',1,null,'val Luis'),
  ('le.mezclum florette *4bol*500gr*(bol)10e1209','LECHUGA ENSALADA MEZCLUM 500GR',1,null,'val Luis'),
  ('ensalada mezclum 0.500 kg.','LECHUGA ENSALADA MEZCLUM 500GR',1,null,'val Luis'),
  ('rucula florette *6bol*100gr*(bol)10e1280','RUCULA',1,null,'val Luis'),
  ('cebolla morada ariza caja *10k/c*(kg)','CEBOLLA MORADA KG',1,null,'val Luis'),
  ('cebolla morada torres caja *10 k/c*(kg)','CEBOLLA MORADA KG',1,null,'val Luis'),
  ('albahaca','ALBAHACA FRESCA MANOJO',1,null,'val Luis'),
  ('mix tomate cherry','TOMATE CHERRY TRICOLOR',1,null,'val Luis'),
  ('aguacates aprox.4kg','AGUACATE EXTRA TROPS KG',1,3.25,'unif aguacate=trops, precio sigfrido'),
  ('aguacate sigfrido/retamosa*alv.14/16/18" +-4 kg (*c)','AGUACATE EXTRA TROPS KG',1,3.25,'unif aguacate=trops, precio sigfrido'),
  ('aguacate sigfrido/retamosa*alv.14/16/18* +-4 kg (°c)','AGUACATE EXTRA TROPS KG',1,3.25,'unif aguacate=trops, precio sigfrido'),
  ('aguacate pata negra 1l cal.12/14/18*+-4k/c*(c)','AGUACATE EXTRA TROPS KG',1,3.25,'unif aguacate=trops, precio sigfrido'),
  ('iceberg','LECHUGA ICEBERG PIEZA',12,null,'caja 12 piezas'),
  ('lima caja 4kg (c)','LIMA EXTRA KG',4,null,'caja 4kg'),
  ('tomates raf','TOMATE RAF KG',1,16.95,'golden raf premium, pin 16,95 val Luis (sigue)'),
  ('mangos','MANGO EXTRA KG',1,2.00,'pin 2,00/kg val Luis')
),
res as (
  select s.nombre, s.factor, s.fijo, s.nota,
    (select holded_product_id from pedidos_wa_productos_holded p
      where lower(p.holded_product_name)=lower(s.target) and p.holded_product_id<>'0' limit 1) pid
  from seed s
)
insert into manager_compra_alias(nombre_compra_norm, holded_product_id, factor_unidad, coste_fijo, nota)
select nombre, pid, factor, fijo, nota from res where pid is not null
on conflict (nombre_compra_norm) do update set
  holded_product_id=excluded.holded_product_id, factor_unidad=excluded.factor_unidad,
  coste_fijo=excluded.coste_fijo, nota=excluded.nota, activo=true;

-- Cron diario 04:35 (tras refresh-costes-calc de 04:30) + refresco inicial
select cron.schedule('refresh-coste-alias','35 4 * * *', 'select manager_refresh_coste_alias();');
select manager_refresh_coste_alias();
