-- Read-only contract/security assertions, suitable after applying A9. Rolls back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
select pg_temp.assert_true(not has_function_privilege('anon','public.facturacion_verifactu_prueba_reservar(bigint,text,text)','EXECUTE'), 'anon cannot reserve');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.facturacion_verifactu_prueba_finalizar(uuid,integer,text)','EXECUTE'), 'user cannot fabricate response');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.facturacion_verifactu_envio_prueba_eventos','INSERT'), 'no direct insert');
select pg_temp.assert_true(not has_table_privilege('service_role','public.facturacion_verifactu_envio_prueba_eventos','UPDATE'), 'backend cannot mutate audit');
select pg_temp.assert_true(not has_table_privilege('service_role','public.facturacion_verifactu_envio_prueba_eventos','TRUNCATE'), 'backend cannot truncate audit');
select pg_temp.assert_true((public.facturacion_verifactu_prueba_parsear('<html>ok</html>')->>'tipo') = 'incierto','HTML is not acceptance');
select pg_temp.assert_true((public.facturacion_verifactu_prueba_parsear('<broken')->>'tipo') = 'incierto','malformed XML');
select pg_temp.assert_true((public.facturacion_verifactu_prueba_parsear('<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x>&a;</x>')->>'tipo') = 'incierto','XXE blocked');
select pg_temp.assert_true((public.facturacion_verifactu_prueba_parsear('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>Server</faultcode></s:Fault></s:Body></s:Envelope>')->>'tipo') = 'soap_fault','SOAP fault');
select pg_temp.assert_true((public.facturacion_verifactu_prueba_parsear('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:r="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd"><s:Body><r:RespuestaRegFactuSistemaFacturacion><r:CSV>TEST123</r:CSV><r:TiempoEsperaEnvio>120</r:TiempoEsperaEnvio><r:EstadoEnvio>ParcialmenteCorrecto</r:EstadoEnvio><r:RespuestaLinea><r:EstadoRegistro>AceptadoConErrores</r:EstadoRegistro><r:CodigoErrorRegistro>2000</r:CodigoErrorRegistro><r:DescripcionErrorRegistro>Fixture</r:DescripcionErrorRegistro></r:RespuestaLinea></r:RespuestaRegFactuSistemaFacturacion></s:Body></s:Envelope>')) = '{"tipo":"respuesta_recibida","csv":"TEST123","espera_segundos":120,"estado_envio":"ParcialmenteCorrecto","lineas":[{"estado":"AceptadoConErrores","codigo":"2000","descripcion":"Fixture"}]}'::jsonb,'states, CSV, wait and line errors preserved');
rollback;
