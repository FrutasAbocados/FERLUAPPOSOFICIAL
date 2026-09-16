-- A9: manual, preproduction only. No fiscal issuance or changes to Holded.
insert into public.app_settings (key, value)
values ('facturacion_verifactu_pruebas_enabled', 'false') on conflict (key) do nothing;

create table public.facturacion_verifactu_envio_prueba_eventos (
  id bigint generated always as identity primary key,
  intento_id uuid not null,
  xml_id bigint not null references public.facturacion_verifactu_xml_simulaciones(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  fase text not null check (fase in ('iniciado', 'finalizado')),
  estado text not null check (estado in ('iniciado','respuesta_recibida','soap_fault','error_http','incierto')),
  endpoint text not null check (endpoint in (
    'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    'https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP')),
  soap_sha256 text not null check (soap_sha256 ~ '^[A-F0-9]{64}$'),
  http_status integer check (http_status between 100 and 599),
  respuesta text check (octet_length(respuesta) <= 262144),
  resumen jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  unique (intento_id, fase),
  check ((fase = 'iniciado') = (estado = 'iniciado'))
);
-- A9 intentionally allows only one attempt per immutable A8 XML, including uncertain outcomes.
create unique index facturacion_vf_prueba_un_envio_xml
  on public.facturacion_verifactu_envio_prueba_eventos(xml_id) where fase = 'iniciado';
create index facturacion_vf_prueba_actor on public.facturacion_verifactu_envio_prueba_eventos(actor_id);
alter table public.facturacion_verifactu_envio_prueba_eventos enable row level security;
create policy "verifactu pruebas: admin read" on public.facturacion_verifactu_envio_prueba_eventos
  for select to authenticated using (public.is_admin());
revoke all on public.facturacion_verifactu_envio_prueba_eventos from public, anon, authenticated, service_role;
grant select on public.facturacion_verifactu_envio_prueba_eventos to authenticated, service_role;
create trigger facturacion_vf_prueba_append_only before update or delete
  on public.facturacion_verifactu_envio_prueba_eventos
  for each row execute function public.facturacion_verifactu_xml_append_only();

create function public.facturacion_verifactu_pruebas_habilitado()
returns boolean language sql stable security invoker set search_path = public as $$
  select coalesce(public.is_admin(), false) and exists (
    select 1 from public.app_settings where key = 'facturacion_verifactu_pruebas_enabled' and value = 'true'
  );
$$;
revoke all on function public.facturacion_verifactu_pruebas_habilitado() from public, anon;
grant execute on function public.facturacion_verifactu_pruebas_habilitado() to authenticated;

-- Parse with PostgreSQL/libxml, never regex or a permissive HTML parser. No DTD/entities.
-- Extracted states are evidence from the test service, not fiscal acceptance.
create function public.facturacion_verifactu_prueba_parsear(p_body text)
returns jsonb language plpgsql immutable set search_path = pg_catalog as $$
declare
  doc xml;
  ns text[][] := array[
    array['s','http://schemas.xmlsoap.org/soap/envelope/'],
    array['r','https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd']
  ];
  base text := '/s:Envelope/s:Body/r:RespuestaRegFactuSistemaFacturacion';
  global_estado text;
  espera text;
  lineas jsonb;
begin
  if p_body is null or octet_length(p_body) > 262144 or p_body ~* '<!DOCTYPE|<!ENTITY'
    or not xml_is_well_formed_document(p_body) then
    return jsonb_build_object('tipo','incierto');
  end if;
  doc := xmlparse(document p_body);
  if cardinality(xpath('/s:Envelope/s:Body/s:Fault', doc, ns)) = 1 then
    return jsonb_build_object('tipo','soap_fault');
  end if;
  if cardinality(xpath(base, doc, ns)) <> 1 then
    return jsonb_build_object('tipo','incierto');
  end if;
  global_estado := (xpath('string(' || base || '/r:EstadoEnvio)', doc, ns))[1]::text;
  espera := (xpath('string(' || base || '/r:TiempoEsperaEnvio)', doc, ns))[1]::text;
  if global_estado not in ('Correcto','ParcialmenteCorrecto','Incorrecto') or espera !~ '^[0-9]{1,6}$' then
    return jsonb_build_object('tipo','incierto');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'estado', (xpath('string(/r:RespuestaLinea/r:EstadoRegistro)', l, ns))[1]::text,
    'codigo', (xpath('string(/r:RespuestaLinea/r:CodigoErrorRegistro)', l, ns))[1]::text,
    'descripcion', (xpath('string(/r:RespuestaLinea/r:DescripcionErrorRegistro)', l, ns))[1]::text
  )), '[]'::jsonb) into lineas from unnest(xpath(base || '/r:RespuestaLinea', doc, ns)) l;
  return jsonb_build_object('tipo','respuesta_recibida', 'estado_envio',global_estado,
    'csv',(xpath('string(' || base || '/r:CSV)', doc, ns))[1]::text,
    'espera_segundos',greatest(60, espera::integer), 'lineas',lineas);
end;
$$;
revoke all on function public.facturacion_verifactu_prueba_parsear(text) from public, anon, authenticated;
grant execute on function public.facturacion_verifactu_prueba_parsear(text) to service_role;

-- User JWT authorizes and supplies the actor. Only this function can reserve a send.
create function public.facturacion_verifactu_prueba_reservar(p_xml_id bigint, p_endpoint text, p_soap_sha256 text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_intento uuid := gen_random_uuid(); v_borrador uuid; v_ultimo public.facturacion_verifactu_envio_prueba_eventos;
begin
  if not coalesce(public.is_admin(), false) or auth.uid() is null then
    raise exception 'Solo administracion' using errcode = '42501';
  end if;
  if not public.facturacion_verifactu_pruebas_habilitado() then
    raise exception 'Envios de pruebas desactivados' using errcode = '55000';
  end if;
  perform pg_advisory_xact_lock(hashtext('abocadosos:verifactu:pruebas:a9'));
  select s.borrador_id into v_borrador from public.facturacion_verifactu_xml_simulaciones x
    join public.facturacion_verifactu_simulaciones s on s.id = x.simulacion_id where x.id = p_xml_id;
  perform 1 from public.facturacion_borradores b where b.id = v_borrador for update;
  if not exists (select 1 from public.facturacion_verifactu_xml_simulaciones_actual() x
    where x.xml_simulacion_id = p_xml_id and x.vigente) then
    raise exception 'XML A8 inexistente u obsoleto' using errcode = '55000';
  end if;
  -- Fail closed globally after an uncertain outcome or a worker crash. No automatic retries.
  select * into v_ultimo from public.facturacion_verifactu_envio_prueba_eventos order by id desc limit 1;
  if found then
    if v_ultimo.estado in ('iniciado','incierto','error_http') then
      raise exception 'Resultado anterior incierto: requiere revision manual' using errcode = '55000';
    end if;
    if clock_timestamp() < v_ultimo.created_at + make_interval(secs => coalesce((v_ultimo.resumen->>'espera_segundos')::integer,60)) then
      raise exception 'Esperar el intervalo indicado por AEAT' using errcode = '55000';
    end if;
  end if;
  insert into public.facturacion_verifactu_envio_prueba_eventos
    (intento_id,xml_id,actor_id,fase,estado,endpoint,soap_sha256)
    values (v_intento,p_xml_id,auth.uid(),'iniciado','iniciado',p_endpoint,p_soap_sha256);
  return v_intento;
end;
$$;
revoke all on function public.facturacion_verifactu_prueba_reservar(bigint,text,text) from public, anon;
grant execute on function public.facturacion_verifactu_prueba_reservar(bigint,text,text) to authenticated;

-- Only backend can append a terminal event; never change the reservation.
create function public.facturacion_verifactu_prueba_finalizar(p_intento_id uuid, p_http_status integer, p_respuesta text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inicio public.facturacion_verifactu_envio_prueba_eventos; v_resumen jsonb; v_estado text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Solo backend' using errcode = '42501'; end if;
  select * into strict v_inicio from public.facturacion_verifactu_envio_prueba_eventos
    where intento_id = p_intento_id and fase = 'iniciado';
  v_resumen := public.facturacion_verifactu_prueba_parsear(p_respuesta);
  v_estado := v_resumen->>'tipo';
  if p_http_status is null then v_estado := 'incierto';
  elsif p_http_status not between 200 and 299 and v_estado <> 'soap_fault' then v_estado := 'error_http'; end if;
  insert into public.facturacion_verifactu_envio_prueba_eventos
    (intento_id,xml_id,actor_id,fase,estado,endpoint,soap_sha256,http_status,respuesta,resumen)
    values (p_intento_id,v_inicio.xml_id,v_inicio.actor_id,'finalizado',v_estado,v_inicio.endpoint,
      v_inicio.soap_sha256,p_http_status,p_respuesta,v_resumen);
  return jsonb_build_object('intento_id',p_intento_id,'estado',v_estado,'resumen',v_resumen);
end;
$$;
revoke all on function public.facturacion_verifactu_prueba_finalizar(uuid,integer,text) from public, anon, authenticated;
grant execute on function public.facturacion_verifactu_prueba_finalizar(uuid,integer,text) to service_role;
