-- Extractos bancarios de Ferlu (BBVA; Unicaja cuando haya muestra) y cruce de
-- las transferencias recibidas con las facturas de Holded que citan.
-- Solo admin_full (Luis y Álvaro). Los movimientos se escriben únicamente por
-- banco_importar_extracto, que comprueba que los saldos encadenan al céntimo.

create table if not exists public.banco_extractos (
  id uuid primary key default gen_random_uuid(),
  banco text not null check (banco in ('BBVA', 'UNICAJA')),
  iban text not null check (iban ~ '^ES\d{22}$'),
  desde date not null,
  hasta date not null check (hasta >= desde),
  saldo_inicial numeric(14,2) not null,
  saldo_final numeric(14,2) not null,
  movimientos integer not null check (movimientos > 0),
  archivo_nombre text not null,
  archivo_sha256 text not null check (archivo_sha256 ~ '^[0-9a-f]{64}$'),
  importado_por uuid default auth.uid(),
  importado_at timestamptz not null default now(),
  unique (iban, archivo_sha256)
);

create table if not exists public.banco_movimientos (
  id uuid primary key default gen_random_uuid(),
  extracto_id uuid not null references public.banco_extractos(id) on delete restrict,
  iban text not null,
  fecha date not null,
  fecha_valor date,
  codigo text not null default '',
  concepto text not null default '',
  detalle text not null default '',
  importe numeric(14,2) not null,
  saldo numeric(14,2) not null,
  categoria text not null,
  facturas text[] not null default '{}',
  huella text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists banco_movimientos_fecha_idx on public.banco_movimientos (iban, fecha);

alter table public.banco_extractos enable row level security;
alter table public.banco_movimientos enable row level security;
revoke all on public.banco_extractos, public.banco_movimientos from anon, authenticated;
grant select on public.banco_extractos, public.banco_movimientos to authenticated;
drop policy if exists "banco_extractos: admin_full read" on public.banco_extractos;
create policy "banco_extractos: admin_full read" on public.banco_extractos
  for select to authenticated using ((select public.is_admin_full()));
drop policy if exists "banco_movimientos: admin_full read" on public.banco_movimientos;
create policy "banco_movimientos: admin_full read" on public.banco_movimientos
  for select to authenticated using ((select public.is_admin_full()));

-- p_extracto: {banco, iban, desde, hasta, saldo_inicial_cent, saldo_final_cent, archivo_nombre, archivo_sha256}
-- p_movimientos: [{orden, fecha, fecha_valor, codigo, concepto, detalle, importe_cent, saldo_cent, categoria, facturas}]
-- en orden cronológico. Devuelve {extracto_id, nuevos, repetidos}.
create or replace function public.banco_importar_extracto(p_extracto jsonb, p_movimientos jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n integer;
  v_nuevos integer;
  v_iban text := p_extracto->>'iban';
  v_errores integer;
begin
  if not (select public.is_admin_full()) then
    raise exception 'sin permiso para importar extractos' using errcode = '42501';
  end if;
  if jsonb_typeof(p_movimientos) <> 'array' or jsonb_array_length(p_movimientos) = 0 then
    raise exception 'el extracto no trae movimientos' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_movimientos);

  -- Los saldos deben encadenar al céntimo, empezando por el saldo inicial.
  with m as (
    select (x->>'orden')::int as orden, (x->>'importe_cent')::bigint as imp, (x->>'saldo_cent')::bigint as sal
    from jsonb_array_elements(p_movimientos) x
  ), c as (
    select orden, imp, sal,
      lag(sal) over (order by orden) as previo
    from m
  )
  select count(*) into v_errores from c
  where coalesce(previo, (p_extracto->>'saldo_inicial_cent')::bigint) + imp <> sal;
  if v_errores > 0 then
    raise exception 'los saldos no encadenan en % movimientos', v_errores using errcode = '22023';
  end if;
  if (select (x->>'saldo_cent')::bigint from jsonb_array_elements(p_movimientos) x order by (x->>'orden')::int desc limit 1)
     <> (p_extracto->>'saldo_final_cent')::bigint then
    raise exception 'el saldo final no coincide con el último movimiento' using errcode = '22023';
  end if;

  insert into public.banco_extractos (banco, iban, desde, hasta, saldo_inicial, saldo_final, movimientos, archivo_nombre, archivo_sha256)
  values (p_extracto->>'banco', v_iban, (p_extracto->>'desde')::date, (p_extracto->>'hasta')::date,
          (p_extracto->>'saldo_inicial_cent')::bigint / 100.0, (p_extracto->>'saldo_final_cent')::bigint / 100.0,
          v_n, p_extracto->>'archivo_nombre', p_extracto->>'archivo_sha256')
  on conflict (iban, archivo_sha256) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'este extracto ya estaba importado' using errcode = '23505';
  end if;

  -- La huella (cuenta, fecha, importe y saldo resultante) evita duplicar un
  -- movimiento que ya llegó en otro extracto que se solapa con este.
  insert into public.banco_movimientos (extracto_id, iban, fecha, fecha_valor, codigo, concepto, detalle, importe, saldo, categoria, facturas, huella)
  select v_id, v_iban, (x->>'fecha')::date, nullif(x->>'fecha_valor', '')::date, coalesce(x->>'codigo', ''),
         coalesce(x->>'concepto', ''), coalesce(x->>'detalle', ''),
         (x->>'importe_cent')::bigint / 100.0, (x->>'saldo_cent')::bigint / 100.0,
         coalesce(x->>'categoria', 'otros'),
         coalesce(array(select jsonb_array_elements_text(x->'facturas')), '{}'),
         v_iban || '|' || (x->>'fecha') || '|' || (x->>'importe_cent') || '|' || (x->>'saldo_cent')
  from jsonb_array_elements(p_movimientos) x
  on conflict (huella) do nothing;
  get diagnostics v_nuevos = row_count;

  return jsonb_build_object('extracto_id', v_id, 'nuevos', v_nuevos, 'repetidos', v_n - v_nuevos);
end;
$$;
revoke all on function public.banco_importar_extracto(jsonb, jsonb) from public, anon;
grant execute on function public.banco_importar_extracto(jsonb, jsonb) to authenticated;

-- Transferencias recibidas en el periodo y facturas de Holded que citan.
-- Si un número está repetido en Holded se toma la factura más reciente anterior
-- al cobro. estado: cuadra · importe distinto · factura no encontrada · sin referencia.
create or replace function public.banco_conciliacion(p_desde date, p_hasta date)
returns table (
  movimiento_id uuid,
  fecha date,
  importe numeric,
  concepto text,
  detalle text,
  facturas_citadas text[],
  facturas jsonb,
  total_facturas numeric,
  diferencia numeric,
  estado text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (select public.is_admin_full()) then
    raise exception 'sin permiso para consultar el banco' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 366 then
    raise exception 'rango de fechas no válido' using errcode = '22007';
  end if;

  return query
  with mov as (
    select m.* from public.banco_movimientos m
    where m.fecha between p_desde and p_hasta and m.categoria = 'cobro_transferencia'
  ), cita as (
    select mov.id, n.num,
      (select jsonb_build_object('numero', f.doc_number, 'fecha', f.fecha, 'cliente', f.contact_name,
                                 'total', f.total, 'pendiente_holded', f.payments_pending,
                                 'en_cobros', exists (select 1 from public.cobros_movimientos c where c.numero_factura = f.doc_number),
                                 'cobrada_en_cobros', exists (select 1 from public.cobros_movimientos c where c.numero_factura = f.doc_number and c.pagado))
       from public.manager_facturas f
       where f.tipo = 'VENTA' and f.subtipo = 'invoice' and f.doc_number = n.num
         and coalesce(f.raw->>'draft', '') <> 'true' and f.fecha <= mov.fecha
       order by f.fecha desc limit 1) as fac
    from mov cross join lateral unnest(mov.facturas) as n(num)
  ), agg as (
    select c.id, jsonb_agg(coalesce(c.fac, jsonb_build_object('numero', c.num, 'no_encontrada', true)) order by c.num) as facturas,
      sum((c.fac->>'total')::numeric) as total, bool_or(c.fac is null) as falta
    from cita c group by c.id
  )
  select mov.id, mov.fecha, mov.importe, mov.concepto, mov.detalle, mov.facturas,
    coalesce(agg.facturas, '[]'::jsonb), agg.total,
    case when agg.total is null then null else mov.importe - agg.total end,
    case
      when cardinality(mov.facturas) = 0 then 'sin referencia'
      when agg.falta then 'factura no encontrada'
      when abs(mov.importe - agg.total) < 0.005 then 'cuadra'
      else 'importe distinto'
    end
  from mov left join agg on agg.id = mov.id
  order by mov.fecha desc, mov.importe desc;
end;
$$;
revoke all on function public.banco_conciliacion(date, date) from public, anon;
grant execute on function public.banco_conciliacion(date, date) to authenticated;
