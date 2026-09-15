-- ============================================================================
-- Facturacion propia A7: simulacion tecnica del registro de alta VERI*FACTU
-- ============================================================================
-- Esta fase implementa el algoritmo oficial de huella y una cadena de pruebas,
-- pero NO emite facturas, NO consume numeracion fiscal, NO genera un XML para
-- remision y NO envia datos a la AEAT. Toda referencia usa el prefijo SIM-A7-.
-- ============================================================================

create table public.facturacion_verifactu_simulaciones (
  id                   bigint generated always as identity primary key,
  borrador_id          uuid not null
    references public.facturacion_borradores(id) on delete restrict,
  revision_evento_id   bigint not null unique
    references public.facturacion_revision_sombra_eventos(id) on delete restrict,
  secuencia            bigint not null unique check (secuencia > 0),
  numero_simulado      text not null unique
    check (numero_simulado ~ '^SIM-A7-[0-9]{6}$'),
  emisor_nif           text not null,
  emisor_nombre        text not null,
  fecha_expedicion     date not null,
  tipo_factura         text not null check (tipo_factura = 'F1'),
  cuota_total          numeric(14,2) not null,
  importe_total        numeric(14,2) not null,
  es_primer_registro   boolean not null,
  huella_anterior      text,
  cadena_hash          text not null,
  huella               text not null check (huella ~ '^[0-9A-F]{64}$'),
  registro_alta        jsonb not null,
  especificacion_hash  text not null default 'AEAT 0.1.2',
  declaracion          text not null default
    'SIMULACION TECNICA: no es factura, no es registro fiscal y no se remite a la AEAT.',
  actor_id             uuid default auth.uid()
    references auth.users(id) on delete set null,
  generated_at         timestamptz not null default now(),
  constraint facturacion_verifactu_simulaciones_encadenamiento_check check (
    (es_primer_registro and huella_anterior is null)
    or
    (not es_primer_registro and huella_anterior ~ '^[0-9A-F]{64}$')
  ),
  constraint facturacion_verifactu_simulaciones_registro_hash_check check (
    registro_alta ->> 'Huella' = huella
  ),
  constraint facturacion_verifactu_simulaciones_declaracion_check check (
    declaracion = 'SIMULACION TECNICA: no es factura, no es registro fiscal y no se remite a la AEAT.'
  )
);

comment on table public.facturacion_verifactu_simulaciones is
  'Cadena tecnica A7 con numeracion SIM-A7. Nunca constituye emision ni registro fiscal.';
comment on column public.facturacion_verifactu_simulaciones.huella is
  'SHA-256 calculado con el algoritmo AEAT para datos simulados; no prueba una emision.';
comment on column public.facturacion_verifactu_simulaciones.registro_alta is
  'JSON tecnico previo al XML/XSD. No es un mensaje aceptado ni enviado a la AEAT.';

create index facturacion_verifactu_simulaciones_borrador_idx
  on public.facturacion_verifactu_simulaciones (borrador_id, secuencia desc);
create index facturacion_verifactu_simulaciones_actor_idx
  on public.facturacion_verifactu_simulaciones (actor_id)
  where actor_id is not null;

alter table public.facturacion_verifactu_simulaciones enable row level security;

create policy "facturacion verifactu simulaciones: admin read"
  on public.facturacion_verifactu_simulaciones for select
  using (public.is_admin());

revoke all on public.facturacion_verifactu_simulaciones from public, anon, authenticated;
grant select on public.facturacion_verifactu_simulaciones to authenticated, service_role;

create or replace function public.facturacion_verifactu_simulaciones_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Las simulaciones VERI*FACTU son inmutables' using errcode = '55000';
end;
$$;

create trigger facturacion_verifactu_simulaciones_append_only
  before update or delete on public.facturacion_verifactu_simulaciones
  for each row execute function public.facturacion_verifactu_simulaciones_append_only();

-- Implementacion exacta del documento AEAT 0.1.2:
-- ocho campos, en orden, UTF-8, SHA-256 y hexadecimal en mayusculas.
create or replace function public.facturacion_verifactu_hash_alta(
  p_emisor_nif text,
  p_numero_factura text,
  p_fecha_expedicion date,
  p_tipo_factura text,
  p_cuota_total numeric,
  p_importe_total numeric,
  p_huella_anterior text,
  p_fecha_hora_huso text
)
returns table (
  cadena text,
  huella text
)
language sql
immutable
set search_path = pg_catalog, extensions
as $$
  with entrada as (
    select
      'IDEmisorFactura=' || btrim(coalesce(p_emisor_nif, ''))
      || '&NumSerieFactura=' || btrim(coalesce(p_numero_factura, ''))
      || '&FechaExpedicionFactura=' || coalesce(to_char(p_fecha_expedicion, 'DD-MM-YYYY'), '')
      || '&TipoFactura=' || btrim(coalesce(p_tipo_factura, ''))
      || '&CuotaTotal=' || coalesce(to_char(p_cuota_total, 'FM999999999999990.00'), '')
      || '&ImporteTotal=' || coalesce(to_char(p_importe_total, 'FM999999999999990.00'), '')
      || '&Huella=' || btrim(coalesce(p_huella_anterior, ''))
      || '&FechaHoraHusoGenRegistro=' || btrim(coalesce(p_fecha_hora_huso, '')) as valor
  )
  select
    e.valor,
    upper(encode(extensions.digest(convert_to(e.valor, 'UTF8'), 'sha256'), 'hex'))
  from entrada e;
$$;

create or replace function public.facturacion_generar_verifactu_simulacion(
  p_borrador_id uuid
)
returns table (
  simulacion_id bigint,
  secuencia bigint,
  numero_simulado text,
  huella text,
  generado_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_revision record;
  v_evento public.facturacion_revision_sombra_eventos%rowtype;
  v_borrador public.facturacion_borradores%rowtype;
  v_existente public.facturacion_verifactu_simulaciones%rowtype;
  v_anterior public.facturacion_verifactu_simulaciones%rowtype;
  v_secuencia bigint;
  v_numero text;
  v_fecha_expedicion date;
  v_generated_at timestamptz;
  v_generated_text text;
  v_cuota_total numeric(14,2);
  v_importe_total numeric(14,2);
  v_desglose jsonb;
  v_destinatario jsonb;
  v_encadenamiento jsonb;
  v_registro jsonb;
  v_cadena text;
  v_huella text;
  v_emisor_nif constant text := 'B22560510';
  v_emisor_nombre constant text := 'FERLU PROJECT S.L.';
  v_declaracion constant text :=
    'SIMULACION TECNICA: no es factura, no es registro fiscal y no se remite a la AEAT.';
begin
  if not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Solo administracion puede generar simulaciones' using errcode = '42501';
  end if;

  -- Una sola cadena tecnica. Evita carreras entre dos cierres simultaneos.
  perform pg_advisory_xact_lock(hashtext('abocadosos:facturacion:verifactu:simulacion:a7'));

  select r.*
  into v_revision
  from public.facturacion_revision_sombra_actual() r
  where r.borrador_id = p_borrador_id;

  if not found or v_revision.accion <> 'cerrado' or not v_revision.vigente then
    raise exception 'Se necesita una revision sombra cerrada y vigente' using errcode = '55000';
  end if;

  select b.*
  into v_borrador
  from public.facturacion_borradores b
  where b.id = p_borrador_id
  for update;

  if v_borrador.tipo_documento_previsto <> 'factura' then
    raise exception 'A7 solo simula registros de alta de facturas' using errcode = '55000';
  end if;

  select e.*
  into v_evento
  from public.facturacion_revision_sombra_eventos e
  where e.borrador_id = p_borrador_id
  order by e.secuencia desc
  limit 1;

  if v_evento.id is null or v_evento.accion <> 'cerrado' or v_evento.snapshot is null then
    raise exception 'No se encontro el snapshot cerrado A6' using errcode = '55000';
  end if;

  -- Idempotencia: un mismo cierre A6 produce como maximo una simulacion A7.
  select s.*
  into v_existente
  from public.facturacion_verifactu_simulaciones s
  where s.revision_evento_id = v_evento.id;

  if found then
    return query select
      v_existente.id,
      v_existente.secuencia,
      v_existente.numero_simulado,
      v_existente.huella,
      v_existente.generated_at;
    return;
  end if;

  if v_evento.snapshot ->> 'schema' <> 'abocadosos_revision_sombra_v1'
     or v_evento.snapshot ->> 'naturaleza' <> 'control_interno_no_fiscal' then
    raise exception 'Version de snapshot A6 no soportada' using errcode = '55000';
  end if;

  if coalesce(v_evento.snapshot #>> '{cliente,tipo_identificacion}', '') <> 'NIF'
     or coalesce(v_evento.snapshot #>> '{cliente,pais_codigo}', '') <> 'ES'
     or btrim(coalesce(v_evento.snapshot #>> '{cliente,numero_identificacion}', '')) = '' then
    raise exception 'A7 solo admite por ahora destinatarios con NIF espanol validado'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_evento.snapshot -> 'lineas_propias') linea
    where coalesce(linea ->> 'regimen_iva', '') <> 'general'
  ) then
    raise exception 'A7 solo admite por ahora lineas en regimen general'
      using errcode = '55000';
  end if;

  select
    round(coalesce(sum(
      coalesce((linea ->> 'cuota_iva')::numeric, 0)
      + coalesce((linea ->> 'cuota_recargo')::numeric, 0)
    ), 0), 2),
    round(coalesce(sum((linea ->> 'total')::numeric), 0), 2)
  into v_cuota_total, v_importe_total
  from jsonb_array_elements(v_evento.snapshot -> 'lineas_propias') linea;

  if v_importe_total <= 0 or v_importe_total <> v_evento.total_propio then
    raise exception 'Los importes del snapshot A6 no son consistentes' using errcode = '55000';
  end if;

  select jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'ClaveRegimen', '01',
      'CalificacionOperacion', 'S1',
      'TipoImpositivo', to_char(grupo.iva_pct, 'FM999999990.00'),
      'BaseImponibleOimporteNoSujeto', to_char(grupo.base, 'FM999999999999990.00'),
      'CuotaRepercutida', to_char(grupo.cuota_iva, 'FM999999999999990.00'),
      'TipoRecargoEquivalencia', case
        when grupo.recargo_pct > 0 then to_char(grupo.recargo_pct, 'FM999999990.00')
        else null
      end,
      'CuotaRecargoEquivalencia', case
        when grupo.recargo_pct > 0 then to_char(grupo.cuota_recargo, 'FM999999999999990.00')
        else null
      end
    )) order by grupo.iva_pct, grupo.recargo_pct
  )
  into v_desglose
  from (
    select
      (linea ->> 'iva_pct')::numeric as iva_pct,
      (linea ->> 'recargo_equivalencia_pct')::numeric as recargo_pct,
      round(sum((linea ->> 'base')::numeric), 2) as base,
      round(sum((linea ->> 'cuota_iva')::numeric), 2) as cuota_iva,
      round(sum((linea ->> 'cuota_recargo')::numeric), 2) as cuota_recargo
    from jsonb_array_elements(v_evento.snapshot -> 'lineas_propias') linea
    group by
      (linea ->> 'iva_pct')::numeric,
      (linea ->> 'recargo_equivalencia_pct')::numeric
  ) grupo;

  select s.*
  into v_anterior
  from public.facturacion_verifactu_simulaciones s
  order by s.secuencia desc
  limit 1;

  v_secuencia := coalesce(v_anterior.secuencia, 0) + 1;
  v_numero := 'SIM-A7-' || lpad(v_secuencia::text, 6, '0');
  v_generated_at := clock_timestamp();
  perform set_config('TimeZone', 'Europe/Madrid', true);
  v_fecha_expedicion := (v_generated_at at time zone 'Europe/Madrid')::date;
  v_generated_text := to_char(v_generated_at, 'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM');

  v_destinatario := jsonb_build_object(
    'NombreRazon', v_evento.snapshot #>> '{cliente,nombre_fiscal}',
    'NIF', v_evento.snapshot #>> '{cliente,numero_identificacion}'
  );

  v_encadenamiento := case
    when v_anterior.id is null then jsonb_build_object('PrimerRegistro', 'S')
    else jsonb_build_object(
      'RegistroAnterior', jsonb_build_object(
        'IDEmisorFactura', v_anterior.emisor_nif,
        'NumSerieFactura', v_anterior.numero_simulado,
        'FechaExpedicionFactura', to_char(v_anterior.fecha_expedicion, 'DD-MM-YYYY'),
        'Huella', v_anterior.huella
      )
    )
  end;

  select h.cadena, h.huella
  into v_cadena, v_huella
  from public.facturacion_verifactu_hash_alta(
    v_emisor_nif,
    v_numero,
    v_fecha_expedicion,
    'F1',
    v_cuota_total,
    v_importe_total,
    v_anterior.huella,
    v_generated_text
  ) h;

  v_registro := jsonb_build_object(
    'IDVersion', '1.0',
    'IDFactura', jsonb_build_object(
      'IDEmisorFactura', v_emisor_nif,
      'NumSerieFactura', v_numero,
      'FechaExpedicionFactura', to_char(v_fecha_expedicion, 'DD-MM-YYYY')
    ),
    'NombreRazonEmisor', v_emisor_nombre,
    'TipoFactura', 'F1',
    'DescripcionOperacion', 'Venta de frutas, verduras y otros productos alimentarios',
    'Destinatarios', jsonb_build_object(
      'IDDestinatario', jsonb_build_array(v_destinatario)
    ),
    'Desglose', jsonb_build_object('DetalleDesglose', v_desglose),
    'CuotaTotal', to_char(v_cuota_total, 'FM999999999999990.00'),
    'ImporteTotal', to_char(v_importe_total, 'FM999999999999990.00'),
    'Encadenamiento', v_encadenamiento,
    'SistemaInformatico', jsonb_build_object(
      'NombreRazon', v_emisor_nombre,
      'NIF', v_emisor_nif,
      'NombreSistemaInformatico', 'AbocadosOS',
      'IdSistemaInformatico', 'A7',
      'Version', 'A7-simulacion-1',
      'NumeroInstalacion', 'FERLU-01',
      'TipoUsoPosibleSoloVerifactu', 'S',
      'TipoUsoPosibleMultiOT', 'N',
      'IndicadorMultiplesOT', 'N'
    ),
    'FechaHoraHusoGenRegistro', v_generated_text,
    'TipoHuella', '01',
    'Huella', v_huella
  );

  return query
  insert into public.facturacion_verifactu_simulaciones as s (
    borrador_id,
    revision_evento_id,
    secuencia,
    numero_simulado,
    emisor_nif,
    emisor_nombre,
    fecha_expedicion,
    tipo_factura,
    cuota_total,
    importe_total,
    es_primer_registro,
    huella_anterior,
    cadena_hash,
    huella,
    registro_alta,
    declaracion,
    actor_id,
    generated_at
  ) values (
    p_borrador_id,
    v_evento.id,
    v_secuencia,
    v_numero,
    v_emisor_nif,
    v_emisor_nombre,
    v_fecha_expedicion,
    'F1',
    v_cuota_total,
    v_importe_total,
    v_anterior.id is null,
    v_anterior.huella,
    v_cadena,
    v_huella,
    v_registro,
    v_declaracion,
    auth.uid(),
    v_generated_at
  )
  returning s.id, s.secuencia, s.numero_simulado, s.huella, s.generated_at;
end;
$$;

create or replace function public.facturacion_verifactu_simulaciones_actual()
returns table (
  borrador_id uuid,
  simulacion_id bigint,
  revision_evento_id bigint,
  secuencia bigint,
  numero_simulado text,
  fecha_expedicion date,
  tipo_factura text,
  cuota_total numeric,
  importe_total numeric,
  huella_anterior text,
  huella text,
  generado_at timestamptz,
  vigente boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Solo administracion puede consultar simulaciones' using errcode = '42501';
  end if;

  return query
  with ultima_simulacion as (
    select distinct on (s.borrador_id) s.*
    from public.facturacion_verifactu_simulaciones s
    order by s.borrador_id, s.secuencia desc
  ), ultima_revision as (
    select distinct on (e.borrador_id) e.id, e.borrador_id, e.accion
    from public.facturacion_revision_sombra_eventos e
    order by e.borrador_id, e.secuencia desc
  )
  select
    s.borrador_id,
    s.id,
    s.revision_evento_id,
    s.secuencia,
    s.numero_simulado,
    s.fecha_expedicion,
    s.tipo_factura,
    s.cuota_total,
    s.importe_total,
    s.huella_anterior,
    s.huella,
    s.generated_at,
    (
      ur.id = s.revision_evento_id
      and ur.accion = 'cerrado'
      and coalesce(rs.vigente, false)
    )
  from ultima_simulacion s
  join ultima_revision ur on ur.borrador_id = s.borrador_id
  left join public.facturacion_revision_sombra_actual() rs
    on rs.borrador_id = s.borrador_id;
end;
$$;

revoke all on function public.facturacion_verifactu_simulaciones_append_only()
  from public, anon, authenticated;
revoke all on function public.facturacion_verifactu_hash_alta(
  text, text, date, text, numeric, numeric, text, text
) from public, anon, authenticated;
revoke all on function public.facturacion_generar_verifactu_simulacion(uuid)
  from public, anon;
revoke all on function public.facturacion_verifactu_simulaciones_actual()
  from public, anon;

grant execute on function public.facturacion_generar_verifactu_simulacion(uuid)
  to authenticated, service_role;
grant execute on function public.facturacion_verifactu_simulaciones_actual()
  to authenticated, service_role;
