-- Cierre de repartidor: incidencias por cliente y deuda automática a Cobros.
--
-- 1) Cada línea del cierre puede llevar un texto de incidencia. Al guardar el
--    cierre se crea/actualiza una incidencia (tipo 'incidencia', estado
--    'pendiente') enlazada al cliente, una por jornada+cliente.
-- 2) Al aprobar el cierre, cada línea de deuda se busca en Holded
--    (manager_facturas VENTA, mismo contacto, ±1 día, mismo total ±0,02 €) y se
--    pasa a Cobros con su número de factura. Lo que no cuadra no entra: sale en
--    cobros_cierre_descuadres() para que administración lo cuadre.
--    El botón «Generar deuda» de Manager sigue de respaldo; no hay duplicados
--    porque nunca se inserta un número de factura que ya esté en Cobros.

-- ─── 1. Incidencias desde el cierre ─────────────────────────────────────

alter table public.repartos_jornada_lineas
  add column if not exists incidencia_texto text;

alter table public.incidencias
  add column if not exists origen_jornada_id uuid references public.repartos_jornada(id) on delete set null,
  add column if not exists origen_contact_key text;

create unique index if not exists incidencias_origen_cierre_uidx
  on public.incidencias (origen_jornada_id, origen_contact_key)
  where origen_jornada_id is not null;

-- Clave estable del cliente dentro de una jornada (las líneas se borran y
-- reinsertan al guardar, así que su id no sirve).
create or replace function public.repartos_linea_contact_key(p_contact_id text, p_contact_nombre text)
returns text language sql immutable set search_path = public as $$
  select coalesce(nullif(p_contact_id, ''), 'nombre:' || lower(btrim(coalesce(p_contact_nombre, ''))));
$$;

create or replace function public.repartos_jornada_sync_incidencias(p_jornada_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha date;
  v_emp   uuid;
begin
  select fecha, empleado_id into v_fecha, v_emp
    from public.repartos_jornada where id = p_jornada_id;
  if not found then return; end if;

  if not (public.is_admin() or exists (
    select 1 from public.empleados e where e.id = v_emp and e.user_id = auth.uid()
  )) then
    raise exception 'sin permiso sobre este cierre';
  end if;

  insert into public.incidencias
    (contact_name_canon, fecha, tipo, descripcion, autor_empleado_id, origen_jornada_id, origen_contact_key)
  select d.cliente, v_fecha, 'incidencia', d.texto, v_emp, p_jornada_id, d.k
  from (
    select public.repartos_linea_contact_key(l.contact_id, l.contact_nombre) as k,
           min(coalesce(c.nombre_canon, l.contact_nombre)) as cliente,
           string_agg(btrim(l.incidencia_texto), E'\n' order by l.orden) as texto
      from public.repartos_jornada_lineas l
      left join public.manager_contacto_canon c on c.id = l.contact_id
     where l.jornada_id = p_jornada_id
       and btrim(coalesce(l.incidencia_texto, '')) <> ''
     group by 1
  ) d
  on conflict (origen_jornada_id, origen_contact_key) where origen_jornada_id is not null
  do update set descripcion = excluded.descripcion,
                contact_name_canon = excluded.contact_name_canon,
                fecha = excluded.fecha
          where public.incidencias.estado = 'pendiente'
            and public.incidencias.descripcion is distinct from excluded.descripcion;

  -- Si el repartidor borra el texto y nadie la ha tocado aún, desaparece.
  delete from public.incidencias i
   where i.origen_jornada_id = p_jornada_id
     and i.estado = 'pendiente'
     and not exists (
       select 1 from public.repartos_jornada_lineas l
        where l.jornada_id = p_jornada_id
          and btrim(coalesce(l.incidencia_texto, '')) <> ''
          and public.repartos_linea_contact_key(l.contact_id, l.contact_nombre) = i.origen_contact_key
     );
end;
$$;

revoke all on function public.repartos_jornada_sync_incidencias(uuid) from public, anon;
grant execute on function public.repartos_jornada_sync_incidencias(uuid) to authenticated;

-- Guardado del repartidor: misma función de producción + incidencia_texto + sync.
create or replace function public.repartos_jornada_empleado_guardar(
  p_fecha date, p_hora_inicio time without time zone, p_hora_fin time without time zone,
  p_notas text, p_efectivo_billetes numeric, p_efectivo_monedas numeric, p_lineas jsonb, p_gastos jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_empleado_id uuid;
  v_jornada_id  uuid;
  v_nombre      text;
BEGIN
  SELECT id, nombre INTO v_empleado_id, v_nombre
  FROM public.empleados_equipo
  WHERE user_id = auth.uid() AND activo = true
  LIMIT 1;
  IF v_empleado_id IS NULL THEN
    RAISE EXCEPTION 'no hay empleado activo vinculado a esta sesión';
  END IF;

  SELECT id INTO v_jornada_id
  FROM public.repartos_jornada
  WHERE empleado_id = v_empleado_id AND fecha = p_fecha AND origen = 'empleado';

  IF v_jornada_id IS NOT NULL THEN
    IF (SELECT revisado FROM public.repartos_jornada WHERE id = v_jornada_id) THEN
      RAISE EXCEPTION 'el cierre ya fue revisado por administración y no se puede modificar';
    END IF;
    UPDATE public.repartos_jornada
       SET hora_inicio = p_hora_inicio,
           hora_fin    = p_hora_fin,
           notas       = p_notas,
           efectivo_billetes = coalesce(p_efectivo_billetes, efectivo_billetes),
           efectivo_monedas  = coalesce(p_efectivo_monedas, efectivo_monedas),
           enviado_at  = now(),
           updated_at  = now()
     WHERE id = v_jornada_id;
  ELSE
    INSERT INTO public.repartos_jornada
      (fecha, empleado_id, hora_inicio, hora_fin, notas,
       efectivo_billetes, efectivo_monedas, origen, enviado_at, created_by)
    VALUES
      (p_fecha, v_empleado_id, p_hora_inicio, p_hora_fin, p_notas,
       p_efectivo_billetes, p_efectivo_monedas, 'empleado', now(), auth.uid())
    RETURNING id INTO v_jornada_id;
  END IF;

  DELETE FROM public.repartos_jornada_lineas WHERE jornada_id = v_jornada_id;
  INSERT INTO public.repartos_jornada_lineas
    (jornada_id, contact_id, contact_nombre, importe, forma_pago, orden, cobro_anterior, incidencia_texto)
  SELECT v_jornada_id,
         NULLIF(l->>'contact_id',''),
         coalesce(l->>'contact_nombre',''),
         coalesce((l->>'importe')::numeric, 0),
         coalesce(l->>'forma_pago','efectivo'),
         coalesce((l->>'orden')::int, ord),
         coalesce((l->>'cobro_anterior')::boolean, false),
         NULLIF(btrim(coalesce(l->>'incidencia_texto','')), '')
  FROM jsonb_array_elements(coalesce(p_lineas,'[]'::jsonb)) WITH ORDINALITY AS t(l, ord);

  DELETE FROM public.repartos_jornada_gastos WHERE jornada_id = v_jornada_id;
  INSERT INTO public.repartos_jornada_gastos
    (jornada_id, tipo, concepto, importe, orden, metodo_pago)
  SELECT v_jornada_id,
         coalesce(g->>'tipo','compras'),
         coalesce(g->>'concepto',''),
         coalesce((g->>'importe')::numeric, 0),
         coalesce((g->>'orden')::int, ord),
         coalesce(g->>'metodo_pago','efectivo')
  FROM jsonb_array_elements(coalesce(p_gastos,'[]'::jsonb)) WITH ORDINALITY AS t(g, ord);

  PERFORM public.repartos_jornada_sync_incidencias(v_jornada_id);

  INSERT INTO public.notificaciones
    (audience, empleado_id, tipo, titulo, cuerpo, payload, expires_at)
  VALUES
    ('admin', v_empleado_id, 'cierre_enviado',
     '📋 Cierre de ' || coalesce(v_nombre,'repartidor'),
     'Envió su cierre del ' || to_char(p_fecha,'DD/MM') || ' · pendiente de revisar',
     jsonb_build_object('jornada_id', v_jornada_id, 'fecha', p_fecha, 'empleado', v_nombre),
     now() + interval '7 days');

  RETURN v_jornada_id;
END;
$function$;

-- ─── 2. Deuda del cierre → Cobros ───────────────────────────────────────

-- Contacto Holded → ficha de Cobros (se rellena una vez y se reutiliza).
create table if not exists public.cobros_cliente_enlace (
  contact_id text primary key,
  cliente_id uuid not null references public.cobros_clientes(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.cobros_cliente_enlace enable row level security;
drop policy if exists "cobros_cliente_enlace: admin rw" on public.cobros_cliente_enlace;
create policy "cobros_cliente_enlace: admin rw" on public.cobros_cliente_enlace
  for all to authenticated
  using ((select public.is_admin()) or (select public.es_gestor_cobros()))
  with check ((select public.is_admin()) or (select public.es_gestor_cobros()));

-- Relleno inicial desde el historial: la ficha que reúne al menos el 80 % de
-- las facturas del contacto (con 5 o más; si solo hay una ficha, basta 1).
-- Las minoritarias son asignaciones manuales equivocadas de «Generar deuda».
insert into public.cobros_cliente_enlace (contact_id, cliente_id, created_by)
select contact_id, cliente_id, null
  from (
    select f.contact_id, cm.cliente_id, count(*) as n,
           sum(count(*)) over (partition by f.contact_id) as total,
           count(*) over (partition by f.contact_id) as fichas
      from public.cobros_movimientos cm
      join public.manager_facturas f on f.doc_number = cm.numero_factura and f.tipo = 'VENTA'
     where f.contact_id is not null
     group by f.contact_id, cm.cliente_id
  ) m
 where (fichas = 1) or (n >= 5 and n >= 0.8 * total)
on conflict (contact_id) do nothing;

alter table public.repartos_jornada
  add column if not exists deuda_cobros_at timestamptz;

alter table public.cobros_movimientos
  add column if not exists origen_jornada_id uuid references public.repartos_jornada(id) on delete set null;

-- Descuadres resueltos a mano por administración.
create table if not exists public.cobros_cierre_cuadres (
  id uuid primary key default gen_random_uuid(),
  jornada_id uuid not null references public.repartos_jornada(id) on delete cascade,
  contact_key text not null,
  importe numeric(12,2) not null,
  accion text not null check (accion in ('factura', 'cuadrado')),
  numero_factura text,
  nota text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (jornada_id, contact_key, importe)
);
alter table public.cobros_cierre_cuadres enable row level security;
drop policy if exists "cobros_cierre_cuadres: admin rw" on public.cobros_cierre_cuadres;
create policy "cobros_cierre_cuadres: admin rw" on public.cobros_cierre_cuadres
  for all to authenticated
  using ((select public.is_admin()) or (select public.es_gestor_cobros()))
  with check ((select public.is_admin()) or (select public.es_gestor_cobros()));

-- Inserta en Cobros una factura de venta si aún no está. Devuelve true si la creó.
create or replace function public.cobros_insertar_factura_venta(
  p_doc_number text, p_cliente_id uuid, p_jornada_id uuid, p_concepto text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare f record;
begin
  if exists (select 1 from public.cobros_movimientos where numero_factura = p_doc_number) then
    return false;
  end if;
  select doc_number, fecha, total into f
    from public.manager_facturas
   where tipo = 'VENTA' and doc_number = p_doc_number
   order by fecha desc limit 1;
  if not found then
    raise exception 'factura % no encontrada en Holded', p_doc_number;
  end if;
  insert into public.cobros_movimientos
    (cliente_id, tipo, numero_factura, fecha_factura, fecha_vencimiento, importe, pagado, concepto, origen_jornada_id)
  values
    (p_cliente_id, 'Factura', f.doc_number, f.fecha,
     (date_trunc('month', f.fecha) + interval '1 month - 1 day')::date,
     f.total, false, p_concepto, p_jornada_id);
  return true;
end;
$$;
revoke all on function public.cobros_insertar_factura_venta(text, uuid, uuid, text) from public, anon, authenticated;

-- Pasa la deuda de una jornada aprobada a Cobros. Idempotente.
create or replace function public.repartos_jornada_volcar_deuda(p_jornada_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha  date;
  r        record;
  v_doc    text;
  v_cli    uuid;
  n_nuevas int := 0;
  n_ya     int := 0;
  n_desc   int := 0;
begin
  if not public.is_admin() then
    raise exception 'solo administración puede pasar deuda a Cobros';
  end if;

  update public.repartos_jornada
     set deuda_cobros_at = coalesce(deuda_cobros_at, now())
   where id = p_jornada_id
  returning fecha into v_fecha;
  if not found then raise exception 'jornada no encontrada'; end if;

  for r in
    select l.contact_id, l.contact_nombre, l.importe,
           public.repartos_linea_contact_key(l.contact_id, l.contact_nombre) as k
      from public.repartos_jornada_lineas l
     where l.jornada_id = p_jornada_id
       and l.forma_pago = 'deuda'
       and not l.cobro_anterior
       and l.importe > 0
     order by l.orden
  loop
    if exists (select 1 from public.cobros_cierre_cuadres c
                where c.jornada_id = p_jornada_id and c.contact_key = r.k and c.importe = r.importe) then
      n_ya := n_ya + 1; continue;
    end if;

    -- Prefiere una factura que aún no esté en Cobros (dos repartos iguales al mismo cliente).
    select f.doc_number into v_doc
      from public.manager_facturas f
     where f.tipo = 'VENTA'
       and f.contact_id = r.contact_id
       and f.fecha between v_fecha - 1 and v_fecha + 1
       and abs(f.total - r.importe) < 0.02
     order by exists (select 1 from public.cobros_movimientos m where m.numero_factura = f.doc_number),
              abs(f.fecha - v_fecha), f.doc_number
     limit 1;

    if v_doc is null then n_desc := n_desc + 1; continue; end if;
    if exists (select 1 from public.cobros_movimientos m where m.numero_factura = v_doc) then
      n_ya := n_ya + 1; continue;
    end if;

    select cliente_id into v_cli from public.cobros_cliente_enlace where contact_id = r.contact_id;
    if v_cli is null then n_desc := n_desc + 1; continue; end if;

    if public.cobros_insertar_factura_venta(v_doc, v_cli, p_jornada_id, 'Cierre de reparto') then
      n_nuevas := n_nuevas + 1;
    else
      n_ya := n_ya + 1;
    end if;
  end loop;

  return jsonb_build_object('nuevas', n_nuevas, 'ya_estaban', n_ya, 'descuadres', n_desc);
end;
$$;
revoke all on function public.repartos_jornada_volcar_deuda(uuid) from public, anon;
grant execute on function public.repartos_jornada_volcar_deuda(uuid) to authenticated;

-- Aprobar: lo de producción (revisado + gastos) + deuda a Cobros. Devuelve el resumen.
drop function if exists public.repartos_jornada_revisar(uuid);
create function public.repartos_jornada_revisar(p_jornada_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not is_admin() then
    raise exception 'solo administración puede aprobar cierres';
  end if;
  if not exists (select 1 from public.repartos_jornada where id = p_jornada_id) then
    raise exception 'jornada no encontrada';
  end if;

  update public.repartos_jornada
     set revisado = true,
         revisado_at = now(),
         revisado_por = auth.uid(),
         updated_at = now()
   where id = p_jornada_id;

  perform public.repartos_jornada_volcar_gastos(p_jornada_id);
  return public.repartos_jornada_volcar_deuda(p_jornada_id);
end;
$function$;
revoke all on function public.repartos_jornada_revisar(uuid) from public, anon;
grant execute on function public.repartos_jornada_revisar(uuid) to authenticated;

-- Deuda de cierres aprobados que no ha llegado a Cobros. Calculado, no almacenado.
create or replace function public.cobros_cierre_descuadres()
returns table (
  jornada_id uuid,
  fecha date,
  repartidor text,
  contact_id text,
  contact_nombre text,
  contact_key text,
  importe numeric,
  motivo text,
  cliente_id uuid,
  candidatas jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with lin as (
    select j.id as jornada_id, j.fecha, e.nombre as repartidor,
           l.contact_id, l.contact_nombre, l.importe,
           public.repartos_linea_contact_key(l.contact_id, l.contact_nombre) as k
      from public.repartos_jornada j
      join public.repartos_jornada_lineas l on l.jornada_id = j.id
      left join public.empleados e on e.id = j.empleado_id
     where j.deuda_cobros_at is not null
       and l.forma_pago = 'deuda' and not l.cobro_anterior and l.importe > 0
  ), ev as (
    select lin.*,
           enl.cliente_id,
           exists (
             select 1 from public.manager_facturas f
              where f.tipo = 'VENTA' and f.contact_id = lin.contact_id
                and f.fecha between lin.fecha - 1 and lin.fecha + 1
                and abs(f.total - lin.importe) < 0.02
           ) as hay_factura,
           exists (
             select 1 from public.manager_facturas f
              join public.cobros_movimientos m on m.numero_factura = f.doc_number
              where f.tipo = 'VENTA' and f.contact_id = lin.contact_id
                and f.fecha between lin.fecha - 1 and lin.fecha + 1
                and abs(f.total - lin.importe) < 0.02
           ) as en_cobros
      from lin
      left join public.cobros_cliente_enlace enl on enl.contact_id = lin.contact_id
     where not exists (
       select 1 from public.cobros_cierre_cuadres c
        where c.jornada_id = lin.jornada_id and c.contact_key = lin.k and c.importe = lin.importe
     )
  )
  select ev.jornada_id, ev.fecha, ev.repartidor, ev.contact_id, ev.contact_nombre, ev.k, ev.importe,
         case
           when ev.contact_id is null then 'sin_cliente'
           when ev.hay_factura and ev.cliente_id is null then 'cliente_sin_enlace'
           when ev.hay_factura then 'pendiente'
           when exists (select 1 from public.manager_facturas f
                         where f.tipo = 'VENTA' and f.contact_id = ev.contact_id
                           and f.fecha between ev.fecha - 1 and ev.fecha + 1) then 'importe_distinto'
           else 'sin_factura'
         end as motivo,
         ev.cliente_id,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'doc_number', f.doc_number, 'fecha', f.fecha, 'total', f.total,
                    'en_cobros', exists (select 1 from public.cobros_movimientos m where m.numero_factura = f.doc_number))
                  order by f.fecha, f.doc_number)
             from public.manager_facturas f
            where f.tipo = 'VENTA' and f.contact_id = ev.contact_id
              and f.fecha between ev.fecha - 3 and ev.fecha + 3
         ), '[]'::jsonb) as candidatas
    from ev
   where not ev.en_cobros
   order by ev.fecha desc, ev.contact_nombre;
$$;
revoke all on function public.cobros_cierre_descuadres() from public, anon;
grant execute on function public.cobros_cierre_descuadres() to authenticated;

-- Cuadrar a mano: con factura (la pasa a Cobros) o marcando cuadrado con nota.
create or replace function public.cobros_cierre_cuadrar(
  p_jornada_id uuid, p_contact_key text, p_importe numeric,
  p_numero_factura text default null, p_cliente_id uuid default null, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact text;
  v_cli uuid;
begin
  if not (public.is_admin() or public.es_gestor_cobros()) then
    raise exception 'sin permiso para cuadrar cobros';
  end if;

  if nullif(btrim(coalesce(p_numero_factura, '')), '') is null then
    if nullif(btrim(coalesce(p_nota, '')), '') is null then
      raise exception 'indica una factura o una nota';
    end if;
    insert into public.cobros_cierre_cuadres (jornada_id, contact_key, importe, accion, nota)
    values (p_jornada_id, p_contact_key, p_importe, 'cuadrado', btrim(p_nota))
    on conflict (jornada_id, contact_key, importe) do update
      set accion = 'cuadrado', numero_factura = null, nota = excluded.nota;
    return;
  end if;

  select contact_id into v_contact from public.manager_facturas
   where tipo = 'VENTA' and doc_number = btrim(p_numero_factura) limit 1;
  if not found then
    raise exception 'factura % no encontrada en Holded', p_numero_factura;
  end if;

  v_cli := p_cliente_id;
  if v_cli is null then
    select cliente_id into v_cli from public.cobros_cliente_enlace where contact_id = v_contact;
  elsif v_contact is not null then
    insert into public.cobros_cliente_enlace (contact_id, cliente_id)
    values (v_contact, v_cli)
    on conflict (contact_id) do update set cliente_id = excluded.cliente_id;
  end if;
  if v_cli is null then
    raise exception 'elige la ficha de Cobros de este cliente';
  end if;

  perform public.cobros_insertar_factura_venta(btrim(p_numero_factura), v_cli, p_jornada_id, 'Cierre de reparto · cuadrado a mano');

  insert into public.cobros_cierre_cuadres (jornada_id, contact_key, importe, accion, numero_factura, nota)
  values (p_jornada_id, p_contact_key, p_importe, 'factura', btrim(p_numero_factura), nullif(btrim(coalesce(p_nota, '')), ''))
  on conflict (jornada_id, contact_key, importe) do update
    set accion = 'factura', numero_factura = excluded.numero_factura, nota = excluded.nota;
end;
$$;
revoke all on function public.cobros_cierre_cuadrar(uuid, text, numeric, text, uuid, text) from public, anon;
grant execute on function public.cobros_cierre_cuadrar(uuid, text, numeric, text, uuid, text) to authenticated;

-- Enlazar un contacto Holded a su ficha de Cobros y reintentar los cierres afectados.
create or replace function public.cobros_cliente_enlazar(p_contact_id text, p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j uuid;
  v_res jsonb;
  n int := 0;
begin
  if not public.is_admin() then
    raise exception 'solo administración puede enlazar clientes';
  end if;
  insert into public.cobros_cliente_enlace (contact_id, cliente_id)
  values (p_contact_id, p_cliente_id)
  on conflict (contact_id) do update set cliente_id = excluded.cliente_id;

  for j in
    select distinct l.jornada_id
      from public.repartos_jornada_lineas l
      join public.repartos_jornada rj on rj.id = l.jornada_id
     where rj.deuda_cobros_at is not null and l.contact_id = p_contact_id and l.forma_pago = 'deuda'
  loop
    v_res := public.repartos_jornada_volcar_deuda(j);
    n := n + coalesce((v_res->>'nuevas')::int, 0);
  end loop;
  return jsonb_build_object('nuevas', n);
end;
$$;
revoke all on function public.cobros_cliente_enlazar(text, uuid) from public, anon;
grant execute on function public.cobros_cliente_enlazar(text, uuid) to authenticated;
