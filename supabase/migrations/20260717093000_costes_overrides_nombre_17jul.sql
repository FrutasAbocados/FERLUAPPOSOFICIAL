-- Overrides de coste por nombre — líneas de venta sin producto vinculado
-- (escritas a mano / WhatsApp / abuelo) que cogían un coste genérico erróneo.
-- Confirmados por Luis o derivados de la compra real. 17-jul-2026. Idempotente.
--
-- Ej. "sandía negra kg" se vende a ~1,29 y cuesta 0,65, pero salía -10% porque
-- las líneas sin product_id no alcanzan el alias de compra. El override por
-- nombre es de máxima prioridad y aplica a cualquier línea con ese nombre.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota) values
 ('sandía negra kg', 0.65, 'Compra churriana — Luis 17-jul'),
 ('sandia fashion', 0.65, 'Variante sandía negra — Luis 17-jul'),
 ('huevos xl', 3.25, 'Huevos XL docena — Luis 17-jul'),
 ('huevos xl docena', 3.25, 'Huevos XL docena — Luis 17-jul'),
 ('docenas huevos xl', 3.25, 'Huevos XL docena — Luis 17-jul'),
 ('shimeji setas', 1.10, 'Luis 17-jul'),
 ('pimiento asado', 10.95, 'Luis 17-jul'),
 ('patata baby primor', 2.99, 'Luis 17-jul'),
 ('patata baby primor kg', 2.99, 'Luis 17-jul'),
 ('sandía blanca rayada kg', 0.71, 'Coste alias compra real — 17-jul'),
 ('sandía blanca rayada', 0.71, 'Coste alias compra real — 17-jul'),
 ('canonigos mache', 1.41, 'Compra mache real — 17-jul'),
 ('canonigo', 1.41, 'Compra mache real — 17-jul'),
 ('canonigos', 1.41, 'Compra mache real — 17-jul')
on conflict (nombre_norm) do update set coste_eur=excluded.coste_eur, nota=excluded.nota, updated_at=now();
