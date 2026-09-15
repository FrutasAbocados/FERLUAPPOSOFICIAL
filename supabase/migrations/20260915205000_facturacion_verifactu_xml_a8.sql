-- ============================================================================
-- Facturacion propia A8: XML tecnico VERI*FACTU validable con XSD oficial
-- ============================================================================
-- Materializa el payload RegFactuSistemaFacturacion de una simulacion A7.
-- NO es un envio SOAP, NO consume numeracion fiscal y NO remite datos a AEAT.
-- Los payloads son append-only y conservan los checksums de los XSD usados.
-- ============================================================================

create table public.facturacion_verifactu_xml_simulaciones (
  id                               bigint generated always as identity primary key,
  simulacion_id                    bigint not null unique
    references public.facturacion_verifactu_simulaciones(id) on delete restrict,
  xml_payload                      text not null,
  xml_sha256                       text not null check (xml_sha256 ~ '^[0-9A-F]{64}$'),
  xsd_version                      text not null default '1.0',
  xsd_suministro_lr_sha256         text not null default
    '26bacfc6229d1a314758753244219ba207b2dcc8e2a22f7ab60b8ab6bae877e1',
  xsd_suministro_info_sha256       text not null default
    'ee4c1655175644de44c4c25055ffeb8e5f4bb4bc3834ce8254d4222ef18c8aa1',
  declaracion                      text not null default
    'SIMULACION TECNICA A8: XML no remitido a la AEAT y sin validez fiscal.',
  actor_id                         uuid default auth.uid()
    references auth.users(id) on delete set null,
  generated_at                     timestamptz not null default now(),
  constraint facturacion_verifactu_xml_documento_check check (
    xml_is_well_formed_document(xml_payload)
  ),
  constraint facturacion_verifactu_xml_hash_check check (
    xml_sha256 = upper(encode(
      extensions.digest(convert_to(xml_payload, 'UTF8'), 'sha256'),
      'hex'
    ))
  ),
  constraint facturacion_verifactu_xml_xsd_version_check check (xsd_version = '1.0'),
  constraint facturacion_verifactu_xml_lr_checksum_check check (
    xsd_suministro_lr_sha256 =
      '26bacfc6229d1a314758753244219ba207b2dcc8e2a22f7ab60b8ab6bae877e1'
  ),
  constraint facturacion_verifactu_xml_info_checksum_check check (
    xsd_suministro_info_sha256 =
      'ee4c1655175644de44c4c25055ffeb8e5f4bb4bc3834ce8254d4222ef18c8aa1'
  ),
  constraint facturacion_verifactu_xml_declaracion_check check (
    declaracion =
      'SIMULACION TECNICA A8: XML no remitido a la AEAT y sin validez fiscal.'
  )
);

comment on table public.facturacion_verifactu_xml_simulaciones is
  'Payloads XML A8 de simulaciones A7. No son facturas ni registros remitidos a AEAT.';
comment on column public.facturacion_verifactu_xml_simulaciones.xml_payload is
  'RegFactuSistemaFacturacion bien formado y generado con el orden del XSD AEAT 1.0.';
comment on column public.facturacion_verifactu_xml_simulaciones.xml_sha256 is
  'SHA-256 del documento XML UTF-8 exacto disponible para descarga.';

create index facturacion_verifactu_xml_actor_idx
  on public.facturacion_verifactu_xml_simulaciones (actor_id)
  where actor_id is not null;

alter table public.facturacion_verifactu_xml_simulaciones enable row level security;

create policy "facturacion verifactu xml: admin read"
  on public.facturacion_verifactu_xml_simulaciones for select
  using (public.is_admin());

revoke all on public.facturacion_verifactu_xml_simulaciones
  from public, anon, authenticated;
grant select on public.facturacion_verifactu_xml_simulaciones
  to authenticated, service_role;

create or replace function public.facturacion_verifactu_xml_append_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Los XML tecnicos VERI*FACTU son inmutables' using errcode = '55000';
end;
$$;

create trigger facturacion_verifactu_xml_append_only
  before update or delete on public.facturacion_verifactu_xml_simulaciones
  for each row execute function public.facturacion_verifactu_xml_append_only();

create or replace function public.facturacion_verifactu_xml_escape(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select replace(
    replace(
      replace(
        replace(
          replace(coalesce(p_value, ''), '&', '&amp;'),
          '<', '&lt;'
        ),
        '>', '&gt;'
      ),
      '"', '&quot;'
    ),
    '''', '&apos;'
  );
$$;

create or replace function public.facturacion_verifactu_xml_payload(
  p_registro jsonb,
  p_fecha_operacion date,
  p_emisor_nombre text,
  p_emisor_nif text
)
returns text
language plpgsql
stable
set search_path = public, pg_catalog
as $$
declare
  v_xml text;
  v_destinatario jsonb;
  v_detalle jsonb;
  v_sistema jsonb;
  v_anterior jsonb;
  v_fecha_operacion_text text;
begin
  v_fecha_operacion_text := to_char(p_fecha_operacion, 'DD-MM-YYYY');
  v_sistema := p_registro -> 'SistemaInformatico';

  v_xml := '<?xml version="1.0" encoding="UTF-8"?>' || E'\n'
    || '<sum:RegFactuSistemaFacturacion'
    || ' xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd"'
    || ' xmlns:sum1="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">' || E'\n'
    || '  <sum:Cabecera>' || E'\n'
    || '    <sum1:ObligadoEmision>' || E'\n'
    || '      <sum1:NombreRazon>' || public.facturacion_verifactu_xml_escape(p_emisor_nombre) || '</sum1:NombreRazon>' || E'\n'
    || '      <sum1:NIF>' || public.facturacion_verifactu_xml_escape(p_emisor_nif) || '</sum1:NIF>' || E'\n'
    || '    </sum1:ObligadoEmision>' || E'\n'
    || '  </sum:Cabecera>' || E'\n'
    || '  <sum:RegistroFactura>' || E'\n'
    || '    <sum1:RegistroAlta>' || E'\n'
    || '      <sum1:IDVersion>' || public.facturacion_verifactu_xml_escape(p_registro ->> 'IDVersion') || '</sum1:IDVersion>' || E'\n'
    || '      <sum1:IDFactura>' || E'\n'
    || '        <sum1:IDEmisorFactura>' || public.facturacion_verifactu_xml_escape(p_registro #>> '{IDFactura,IDEmisorFactura}') || '</sum1:IDEmisorFactura>' || E'\n'
    || '        <sum1:NumSerieFactura>' || public.facturacion_verifactu_xml_escape(p_registro #>> '{IDFactura,NumSerieFactura}') || '</sum1:NumSerieFactura>' || E'\n'
    || '        <sum1:FechaExpedicionFactura>' || public.facturacion_verifactu_xml_escape(p_registro #>> '{IDFactura,FechaExpedicionFactura}') || '</sum1:FechaExpedicionFactura>' || E'\n'
    || '      </sum1:IDFactura>' || E'\n'
    || '      <sum1:NombreRazonEmisor>' || public.facturacion_verifactu_xml_escape(p_registro ->> 'NombreRazonEmisor') || '</sum1:NombreRazonEmisor>' || E'\n'
    || '      <sum1:TipoFactura>' || public.facturacion_verifactu_xml_escape(p_registro ->> 'TipoFactura') || '</sum1:TipoFactura>' || E'\n';

  if v_fecha_operacion_text <> p_registro #>> '{IDFactura,FechaExpedicionFactura}' then
    v_xml := v_xml
      || '      <sum1:FechaOperacion>' || public.facturacion_verifactu_xml_escape(v_fecha_operacion_text) || '</sum1:FechaOperacion>' || E'\n';
  end if;

  v_xml := v_xml
    || '      <sum1:DescripcionOperacion>' || public.facturacion_verifactu_xml_escape(p_registro ->> 'DescripcionOperacion') || '</sum1:DescripcionOperacion>' || E'\n'
    || '      <sum1:Destinatarios>' || E'\n';

  for v_destinatario in
    select value
    from jsonb_array_elements(p_registro #> '{Destinatarios,IDDestinatario}')
  loop
    v_xml := v_xml
      || '        <sum1:IDDestinatario>' || E'\n'
      || '          <sum1:NombreRazon>' || public.facturacion_verifactu_xml_escape(v_destinatario ->> 'NombreRazon') || '</sum1:NombreRazon>' || E'\n'
      || '          <sum1:NIF>' || public.facturacion_verifactu_xml_escape(v_destinatario ->> 'NIF') || '</sum1:NIF>' || E'\n'
      || '        </sum1:IDDestinatario>' || E'\n';
  end loop;

  v_xml := v_xml
    || '      </sum1:Destinatarios>' || E'\n'
    || '      <sum1:Desglose>' || E'\n';

  for v_detalle in
    select value
    from jsonb_array_elements(p_registro #> '{Desglose,DetalleDesglose}')
  loop
    v_xml := v_xml
      || '        <sum1:DetalleDesglose>' || E'\n'
      || '          <sum1:Impuesto>' || public.facturacion_verifactu_xml_escape(coalesce(v_detalle ->> 'Impuesto', '01')) || '</sum1:Impuesto>' || E'\n'
      || '          <sum1:ClaveRegimen>' || public.facturacion_verifactu_xml_escape(v_detalle ->> 'ClaveRegimen') || '</sum1:ClaveRegimen>' || E'\n'
      || '          <sum1:CalificacionOperacion>' || public.facturacion_verifactu_xml_escape(v_detalle ->> 'CalificacionOperacion') || '</sum1:CalificacionOperacion>' || E'\n'
      || '          <sum1:TipoImpositivo>' || public.facturacion_verifactu_xml_escape(v_detalle ->> 'TipoImpositivo') || '</sum1:TipoImpositivo>' || E'\n'
      || '          <sum1:BaseImponibleOimporteNoSujeto>' || public.facturacion_verifactu_xml_escape(v_detalle ->> 'BaseImponibleOimporteNoSujeto') || '</sum1:BaseImponibleOimporteNoSujeto>' || E'\n'
      || '          <sum1:CuotaRepercutida>' || public.facturacion_verifactu_xml_escape(v_detalle ->> 'CuotaRepercutida') || '</sum1:CuotaRepercutida>' || E'\n';

    if coalesce(v_detalle ->> 'TipoRecargoEquivalencia', '') <> '' then
      v_xml := v_xml
        || '          <sum1:TipoRecargoEquivalencia>' || public.facturacion_verifactu_xml_escape(v_detalle ->> 'TipoRecargoEquivalencia') || '</sum1:TipoRecargoEquivalencia>' || E'\n'
        || '          <sum1:CuotaRecargoEquivalencia>' || public.facturacion_verifactu_xml_escape(v_detalle ->> 'CuotaRecargoEquivalencia') || '</sum1:CuotaRecargoEquivalencia>' || E'\n';
    end if;

    v_xml := v_xml || '        </sum1:DetalleDesglose>' || E'\n';
  end loop;

  v_xml := v_xml
    || '      </sum1:Desglose>' || E'\n'
    || '      <sum1:CuotaTotal>' || public.facturacion_verifactu_xml_escape(p_registro ->> 'CuotaTotal') || '</sum1:CuotaTotal>' || E'\n'
    || '      <sum1:ImporteTotal>' || public.facturacion_verifactu_xml_escape(p_registro ->> 'ImporteTotal') || '</sum1:ImporteTotal>' || E'\n'
    || '      <sum1:Encadenamiento>' || E'\n';

  if coalesce(p_registro #>> '{Encadenamiento,PrimerRegistro}', '') <> '' then
    v_xml := v_xml
      || '        <sum1:PrimerRegistro>' || public.facturacion_verifactu_xml_escape(p_registro #>> '{Encadenamiento,PrimerRegistro}') || '</sum1:PrimerRegistro>' || E'\n';
  else
    v_anterior := p_registro #> '{Encadenamiento,RegistroAnterior}';
    v_xml := v_xml
      || '        <sum1:RegistroAnterior>' || E'\n'
      || '          <sum1:IDEmisorFactura>' || public.facturacion_verifactu_xml_escape(v_anterior ->> 'IDEmisorFactura') || '</sum1:IDEmisorFactura>' || E'\n'
      || '          <sum1:NumSerieFactura>' || public.facturacion_verifactu_xml_escape(v_anterior ->> 'NumSerieFactura') || '</sum1:NumSerieFactura>' || E'\n'
      || '          <sum1:FechaExpedicionFactura>' || public.facturacion_verifactu_xml_escape(v_anterior ->> 'FechaExpedicionFactura') || '</sum1:FechaExpedicionFactura>' || E'\n'
      || '          <sum1:Huella>' || public.facturacion_verifactu_xml_escape(v_anterior ->> 'Huella') || '</sum1:Huella>' || E'\n'
      || '        </sum1:RegistroAnterior>' || E'\n';
  end if;

  v_xml := v_xml
    || '      </sum1:Encadenamiento>' || E'\n'
    || '      <sum1:SistemaInformatico>' || E'\n'
    || '        <sum1:NombreRazon>' || public.facturacion_verifactu_xml_escape(v_sistema ->> 'NombreRazon') || '</sum1:NombreRazon>' || E'\n'
    || '        <sum1:NIF>' || public.facturacion_verifactu_xml_escape(v_sistema ->> 'NIF') || '</sum1:NIF>' || E'\n'
    || '        <sum1:NombreSistemaInformatico>' || public.facturacion_verifactu_xml_escape(v_sistema ->> 'NombreSistemaInformatico') || '</sum1:NombreSistemaInformatico>' || E'\n'
    || '        <sum1:IdSistemaInformatico>' || public.facturacion_verifactu_xml_escape(v_sistema ->> 'IdSistemaInformatico') || '</sum1:IdSistemaInformatico>' || E'\n'
    || '        <sum1:Version>' || public.facturacion_verifactu_xml_escape(v_sistema ->> 'Version') || '</sum1:Version>' || E'\n'
    || '        <sum1:NumeroInstalacion>' || public.facturacion_verifactu_xml_escape(v_sistema ->> 'NumeroInstalacion') || '</sum1:NumeroInstalacion>' || E'\n'
    || '        <sum1:TipoUsoPosibleSoloVerifactu>' || public.facturacion_verifactu_xml_escape(v_sistema ->> 'TipoUsoPosibleSoloVerifactu') || '</sum1:TipoUsoPosibleSoloVerifactu>' || E'\n'
    || '        <sum1:TipoUsoPosibleMultiOT>' || public.facturacion_verifactu_xml_escape(v_sistema ->> 'TipoUsoPosibleMultiOT') || '</sum1:TipoUsoPosibleMultiOT>' || E'\n'
    || '        <sum1:IndicadorMultiplesOT>' || public.facturacion_verifactu_xml_escape(v_sistema ->> 'IndicadorMultiplesOT') || '</sum1:IndicadorMultiplesOT>' || E'\n'
    || '      </sum1:SistemaInformatico>' || E'\n'
    || '      <sum1:FechaHoraHusoGenRegistro>' || public.facturacion_verifactu_xml_escape(p_registro ->> 'FechaHoraHusoGenRegistro') || '</sum1:FechaHoraHusoGenRegistro>' || E'\n'
    || '      <sum1:TipoHuella>' || public.facturacion_verifactu_xml_escape(p_registro ->> 'TipoHuella') || '</sum1:TipoHuella>' || E'\n'
    || '      <sum1:Huella>' || public.facturacion_verifactu_xml_escape(p_registro ->> 'Huella') || '</sum1:Huella>' || E'\n'
    || '    </sum1:RegistroAlta>' || E'\n'
    || '  </sum:RegistroFactura>' || E'\n'
    || '</sum:RegFactuSistemaFacturacion>' || E'\n';

  return v_xml;
end;
$$;

create or replace function public.facturacion_generar_verifactu_xml_simulacion(
  p_borrador_id uuid
)
returns table (
  xml_simulacion_id bigint,
  simulacion_id bigint,
  numero_simulado text,
  xml_sha256 text,
  generado_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_simulacion public.facturacion_verifactu_simulaciones%rowtype;
  v_existente public.facturacion_verifactu_xml_simulaciones%rowtype;
  v_evento public.facturacion_revision_sombra_eventos%rowtype;
  v_ultima_revision public.facturacion_revision_sombra_eventos%rowtype;
  v_destinatario jsonb;
  v_detalle jsonb;
  v_fecha_operacion date;
  v_xml text;
  v_xml_sha text;
  v_generated_at timestamptz;
begin
  if not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Solo administracion puede generar XML tecnicos' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('abocadosos:facturacion:verifactu:xml:a8'));

  select s.*
  into v_simulacion
  from public.facturacion_verifactu_simulaciones s
  where s.borrador_id = p_borrador_id
  order by s.secuencia desc
  limit 1;

  if v_simulacion.id is null then
    raise exception 'Se necesita una simulacion tecnica A7' using errcode = '55000';
  end if;

  select e.*
  into v_ultima_revision
  from public.facturacion_revision_sombra_eventos e
  where e.borrador_id = p_borrador_id
  order by e.secuencia desc
  limit 1;

  if v_ultima_revision.id is null
     or v_ultima_revision.id <> v_simulacion.revision_evento_id
     or v_ultima_revision.accion <> 'cerrado' then
    raise exception 'La simulacion A7 ya no corresponde al cierre vigente' using errcode = '55000';
  end if;

  select e.*
  into v_evento
  from public.facturacion_revision_sombra_eventos e
  where e.id = v_simulacion.revision_evento_id;

  if v_evento.snapshot is null
     or v_evento.snapshot ->> 'schema' <> 'abocadosos_revision_sombra_v1'
     or v_evento.snapshot ->> 'naturaleza' <> 'control_interno_no_fiscal' then
    raise exception 'Snapshot A6 ausente o no soportado' using errcode = '55000';
  end if;

  select x.*
  into v_existente
  from public.facturacion_verifactu_xml_simulaciones x
  where x.simulacion_id = v_simulacion.id;

  if found then
    return query select
      v_existente.id,
      v_existente.simulacion_id,
      v_simulacion.numero_simulado,
      v_existente.xml_sha256,
      v_existente.generated_at;
    return;
  end if;

  if v_simulacion.registro_alta ->> 'Huella' <> v_simulacion.huella
     or v_simulacion.registro_alta #>> '{IDFactura,NumSerieFactura}' <> v_simulacion.numero_simulado
     or v_simulacion.registro_alta #>> '{IDFactura,IDEmisorFactura}' <> v_simulacion.emisor_nif
     or v_simulacion.registro_alta ->> 'NombreRazonEmisor' <> v_simulacion.emisor_nombre
     or v_simulacion.registro_alta ->> 'TipoFactura' <> 'F1'
     or v_simulacion.registro_alta ->> 'TipoHuella' <> '01' then
    raise exception 'La simulacion A7 no es consistente' using errcode = '55000';
  end if;

  if length(v_simulacion.emisor_nif) <> 9
     or length(v_simulacion.emisor_nombre) not between 1 and 120
     or length(coalesce(v_simulacion.registro_alta ->> 'DescripcionOperacion', '')) not between 1 and 500
     or coalesce(jsonb_typeof(v_simulacion.registro_alta #> '{Destinatarios,IDDestinatario}'), '') <> 'array'
     or coalesce(jsonb_array_length(v_simulacion.registro_alta #> '{Destinatarios,IDDestinatario}'), 0) not between 1 and 1000
     or coalesce(jsonb_typeof(v_simulacion.registro_alta #> '{Desglose,DetalleDesglose}'), '') <> 'array'
     or coalesce(jsonb_array_length(v_simulacion.registro_alta #> '{Desglose,DetalleDesglose}'), 0) not between 1 and 12 then
    raise exception 'La simulacion A7 excede el subconjunto XSD soportado por A8' using errcode = '22023';
  end if;

  for v_destinatario in
    select value
    from jsonb_array_elements(v_simulacion.registro_alta #> '{Destinatarios,IDDestinatario}')
  loop
    if length(coalesce(v_destinatario ->> 'NombreRazon', '')) not between 1 and 120
       or length(coalesce(v_destinatario ->> 'NIF', '')) <> 9 then
      raise exception 'Destinatario fuera del subconjunto XSD A8' using errcode = '22023';
    end if;
  end loop;

  for v_detalle in
    select value
    from jsonb_array_elements(v_simulacion.registro_alta #> '{Desglose,DetalleDesglose}')
  loop
    if coalesce(v_detalle ->> 'ClaveRegimen', '') <> '01'
       or coalesce(v_detalle ->> 'CalificacionOperacion', '') <> 'S1'
       or coalesce(v_detalle ->> 'TipoImpositivo', '') !~ '^\d{1,3}(\.\d{0,2})?$'
       or coalesce(v_detalle ->> 'BaseImponibleOimporteNoSujeto', '') !~ '^[+-]?\d{1,12}(\.\d{0,2})?$'
       or coalesce(v_detalle ->> 'CuotaRepercutida', '') !~ '^[+-]?\d{1,12}(\.\d{0,2})?$'
       or (
         coalesce(v_detalle ->> 'TipoRecargoEquivalencia', '') <> ''
         and (
           coalesce(v_detalle ->> 'TipoRecargoEquivalencia', '') !~ '^\d{1,3}(\.\d{0,2})?$'
           or coalesce(v_detalle ->> 'CuotaRecargoEquivalencia', '') !~ '^[+-]?\d{1,12}(\.\d{0,2})?$'
         )
       ) then
      raise exception 'Desglose fuera del subconjunto XSD A8' using errcode = '22023';
    end if;
  end loop;

  if coalesce(v_simulacion.registro_alta ->> 'CuotaTotal', '') !~ '^[+-]?\d{1,12}(\.\d{0,2})?$'
     or coalesce(v_simulacion.registro_alta ->> 'ImporteTotal', '') !~ '^[+-]?\d{1,12}(\.\d{0,2})?$'
     or coalesce(v_simulacion.registro_alta ->> 'FechaHoraHusoGenRegistro', '') = '' then
    raise exception 'Totales o fecha-hora fuera del subconjunto XSD A8' using errcode = '22023';
  end if;

  perform (v_simulacion.registro_alta ->> 'FechaHoraHusoGenRegistro')::timestamptz;
  v_fecha_operacion := (v_evento.snapshot #>> '{borrador,fecha_operacion}')::date;
  v_xml := public.facturacion_verifactu_xml_payload(
    v_simulacion.registro_alta,
    v_fecha_operacion,
    v_simulacion.emisor_nombre,
    v_simulacion.emisor_nif
  );

  if not xml_is_well_formed_document(v_xml) then
    raise exception 'El payload XML generado no esta bien formado' using errcode = '2200N';
  end if;

  v_xml_sha := upper(encode(
    extensions.digest(convert_to(v_xml, 'UTF8'), 'sha256'),
    'hex'
  ));
  v_generated_at := clock_timestamp();

  return query
  insert into public.facturacion_verifactu_xml_simulaciones as x (
    simulacion_id,
    xml_payload,
    xml_sha256,
    actor_id,
    generated_at
  ) values (
    v_simulacion.id,
    v_xml,
    v_xml_sha,
    auth.uid(),
    v_generated_at
  )
  returning x.id, x.simulacion_id, v_simulacion.numero_simulado, x.xml_sha256, x.generated_at;
end;
$$;

create or replace function public.facturacion_verifactu_xml_simulaciones_actual()
returns table (
  borrador_id uuid,
  xml_simulacion_id bigint,
  simulacion_id bigint,
  numero_simulado text,
  xml_sha256 text,
  xsd_version text,
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
    raise exception 'Solo administracion puede consultar XML tecnicos' using errcode = '42501';
  end if;

  return query
  with ultimo_xml as (
    select distinct on (s.borrador_id)
      s.borrador_id,
      s.revision_evento_id,
      s.secuencia,
      s.id as simulacion_id,
      s.numero_simulado,
      x.id as xml_simulacion_id,
      x.xml_sha256,
      x.xsd_version,
      x.generated_at
    from public.facturacion_verifactu_simulaciones s
    join public.facturacion_verifactu_xml_simulaciones x on x.simulacion_id = s.id
    order by s.borrador_id, s.secuencia desc
  ), ultima_simulacion as (
    select distinct on (s.borrador_id) s.id, s.borrador_id
    from public.facturacion_verifactu_simulaciones s
    order by s.borrador_id, s.secuencia desc
  ), ultima_revision as (
    select distinct on (e.borrador_id) e.id, e.borrador_id, e.accion
    from public.facturacion_revision_sombra_eventos e
    order by e.borrador_id, e.secuencia desc
  )
  select
    x.borrador_id,
    x.xml_simulacion_id,
    x.simulacion_id,
    x.numero_simulado,
    x.xml_sha256,
    x.xsd_version,
    x.generated_at,
    (
      us.id = x.simulacion_id
      and ur.id = x.revision_evento_id
      and ur.accion = 'cerrado'
      and coalesce(rs.vigente, false)
    )
  from ultimo_xml x
  join ultima_simulacion us on us.borrador_id = x.borrador_id
  join ultima_revision ur on ur.borrador_id = x.borrador_id
  left join public.facturacion_revision_sombra_actual() rs
    on rs.borrador_id = x.borrador_id;
end;
$$;

create or replace function public.facturacion_verifactu_xml_obtener(
  p_borrador_id uuid
)
returns table (
  nombre_archivo text,
  contenido_xml text,
  xml_sha256 text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Solo administracion puede descargar XML tecnicos' using errcode = '42501';
  end if;

  return query
  select
    s.numero_simulado || '-A8.xml',
    x.xml_payload,
    x.xml_sha256
  from public.facturacion_verifactu_simulaciones s
  join public.facturacion_verifactu_xml_simulaciones x on x.simulacion_id = s.id
  where s.borrador_id = p_borrador_id
  order by s.secuencia desc
  limit 1;
end;
$$;

revoke all on function public.facturacion_verifactu_xml_append_only()
  from public, anon, authenticated;
revoke all on function public.facturacion_verifactu_xml_escape(text)
  from public, anon, authenticated;
revoke all on function public.facturacion_verifactu_xml_payload(jsonb, date, text, text)
  from public, anon, authenticated;
revoke all on function public.facturacion_generar_verifactu_xml_simulacion(uuid)
  from public, anon;
revoke all on function public.facturacion_verifactu_xml_simulaciones_actual()
  from public, anon;
revoke all on function public.facturacion_verifactu_xml_obtener(uuid)
  from public, anon;

grant execute on function public.facturacion_verifactu_xml_payload(jsonb, date, text, text)
  to service_role;
grant execute on function public.facturacion_generar_verifactu_xml_simulacion(uuid)
  to authenticated, service_role;
grant execute on function public.facturacion_verifactu_xml_simulaciones_actual()
  to authenticated, service_role;
grant execute on function public.facturacion_verifactu_xml_obtener(uuid)
  to authenticated, service_role;
