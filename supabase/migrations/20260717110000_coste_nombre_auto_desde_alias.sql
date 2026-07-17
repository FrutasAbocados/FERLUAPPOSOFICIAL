-- Coste por nombre AUTOMÁTICO desde la compra real (17-jul-2026)
--
-- Algunos productos se venden por nombre escrito a mano (sin product_id) y no
-- alcanzan el coste automático de compras. Hasta ahora se fijaban a mano en
-- manager_costes_manuales_nombre. Esta tabla + función los mantiene solos:
-- para cada (nombre → producto Holded), copia el coste calculado del alias de
-- compra (media ponderada reciente) al override por nombre.
--
-- Clave de robustez: SOLO pisa el override cuando hay coste de alias (>0). Si el
-- producto se deja de comprar (p.ej. sandía fuera de temporada) y el alias se
-- vacía, se conserva el último valor bueno — nunca revierte al coste genérico.

create table if not exists public.manager_coste_nombre_auto (
  nombre_norm       text primary key,
  holded_product_id text not null,
  nota              text,
  updated_at        timestamptz not null default now()
);

alter table public.manager_coste_nombre_auto enable row level security;
drop policy if exists "coste_nombre_auto: admin rw" on public.manager_coste_nombre_auto;
create policy "coste_nombre_auto: admin rw" on public.manager_coste_nombre_auto
  for all using (public.is_admin()) with check (public.is_admin());

-- Función: refresca los overrides por nombre desde el alias_calc del producto.
create or replace function public.manager_refresh_coste_nombre_auto()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.manager_costes_manuales_nombre (nombre_norm, coste_eur, nota)
  select l.nombre_norm, a.coste_eur, 'auto desde compra ' || to_char(now(), 'DD/MM')
  from public.manager_coste_nombre_auto l
  join public.manager_coste_alias_calc a on a.product_id = l.holded_product_id
  where a.coste_eur is not null and a.coste_eur > 0
  on conflict (nombre_norm) do update
    set coste_eur = excluded.coste_eur,
        nota = excluded.nota,
        updated_at = now();
end;
$function$;

-- Encadenar tras el refresco del alias (cron :15) para que use el dato fresco.
create or replace function public.manager_refresh_coste_alias()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  truncate manager_coste_alias_calc;

  insert into manager_coste_alias_calc(product_id, coste_eur, n_compras)
  with lineas as (
    select l.subtotal, l.units, f.fecha, lower(trim(l.nombre)) as nom
    from manager_lineas l
    join manager_facturas f on f.id = l.factura_id
    where f.tipo = 'COMPRA'
      and l.product_id is null
      and f.fecha >= current_date - 45
      and l.subtotal > 0
      and l.units > 0
  ),
  m as (
    select li.fecha,
           li.subtotal,
           a.holded_product_id as pid,
           a.coste_fijo,
           li.units * a.factor_unidad as kg_eq
    from lineas li
    cross join lateral (
      select a.*
      from manager_compra_alias a
      where a.activo
        and a.holded_product_id is not null
        and (a.nombre_compra_norm = li.nom
             or manager_norm_nombre(a.nombre_compra_norm) = manager_norm_nombre(li.nom))
      order by (a.nombre_compra_norm = li.nom) desc, a.nombre_compra_norm
      limit 1
    ) a
    where a.factor_unidad > 0
  ),
  raw as (
    select *, dense_rank() over (partition by pid order by fecha desc) as rk
    from m
  ),
  agg as (
    select pid,
           max(coste_fijo) as coste_fijo,
           count(distinct fecha) as n_fechas,
           sum(subtotal) filter (where rk <= 3) as s3,
           sum(kg_eq)    filter (where rk <= 3) as k3,
           sum(subtotal) filter (where fecha >= current_date - 7) as s7,
           sum(kg_eq)    filter (where fecha >= current_date - 7) as k7,
           sum(subtotal) filter (where fecha >= current_date - 21) as s21,
           sum(kg_eq)    filter (where fecha >= current_date - 21) as k21,
           sum(subtotal) as s45,
           sum(kg_eq)    as k45,
           count(*) as n
    from raw
    group by pid
  ),
  calc as (
    select pid, n,
           coalesce(
             coste_fijo,
             case when n_fechas >= 3 and k3 > 0 then s3 / k3
                  when k7  > 0 then s7  / k7
                  when k21 > 0 then s21 / k21
                  else s45 / nullif(k45, 0)
             end
           ) as coste
    from agg
  )
  select pid, coste::numeric(12,4), n
  from calc
  where coste is not null and coste > 0;

  -- Propagar el coste de compra a los overrides por nombre vinculados.
  perform public.manager_refresh_coste_nombre_auto();
end;
$function$;

-- Semilla: nombres estacionales/volátiles cuyo alias de compra es fiable.
insert into public.manager_coste_nombre_auto (nombre_norm, holded_product_id, nota) values
 ('sandía negra kg', '6691189896bde2717f0b5c5c', 'Sandía negra — auto'),
 ('sandias negras',  '6691189896bde2717f0b5c5c', 'Sandía negra — auto'),
 ('sandia fashion',  '6691189896bde2717f0b5c5c', 'Sandía negra — auto'),
 ('melón piel sapo kg', '685d184279fa75147a086959', 'Melón — auto')
on conflict (nombre_norm) do update
  set holded_product_id = excluded.holded_product_id, nota = excluded.nota, updated_at = now();

-- Ejecutar ya.
select public.manager_refresh_coste_nombre_auto();
