-- Coste tomate huevo de toro (confirmado por Luis 17-jul): 2,10 €/kg.
-- Las líneas a mano cogían 2,85; margen pasa a ~49%. Idempotente.
insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota) values
 ('tomate huevo de toro kg', 2.10, 'Coste real — Luis 17-jul'),
 ('tomate huevo de toro', 2.10, 'Coste real — Luis 17-jul')
on conflict (nombre_norm) do update set coste_eur=excluded.coste_eur, nota=excluded.nota, updated_at=now();
