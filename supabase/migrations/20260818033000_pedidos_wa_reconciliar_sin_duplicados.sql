-- El reconciliador anterior seleccionaba varias filas del mismo cliente y día
-- en una sola pasada. Si la generación de pedidos se repetía, podía crear más
-- de un documento real en Holded. Se elige solo la versión más reciente y se
-- omite el grupo cuando otra versión ya tiene documento.

create or replace function public.pedidos_wa_reconciliar_holded()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_url         text;
  v_service_key text;
  v_rec         record;
  v_n           integer := 0;
begin
  select value into v_url
  from public.app_settings
  where key = 'pedido_holded_url';

  select decrypted_secret into v_service_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_url is null or v_url = '' or v_service_key is null then return 0; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return 0; end if;

  for v_rec in
    with candidatos as (
      select distinct on (p.cliente_id, p.fecha)
        p.id,
        p.updated_at
      from public.pedidos_wa p
      join public.pedidos_wa_clientes c on c.id = p.cliente_id
      where p.estado = 'confirmado'
        and p.holded_invoice_id is null
        and p.updated_at < now() - interval '3 minutes'
        and p.updated_at >= now() - interval '2 days'
        and c.tipo_factura = 'HOLDED'
        and c.holded_contact_id is not null
        and c.holded_doc_type in ('invoice', 'waybill')
        and not exists (
          select 1
          from public.pedidos_wa subido
          where subido.cliente_id = p.cliente_id
            and subido.fecha = p.fecha
            and subido.holded_invoice_id is not null
        )
      order by p.cliente_id, p.fecha, p.updated_at desc, p.id desc
    )
    select id
    from candidatos
    order by updated_at
    limit 25
  loop
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'pedido_id', v_rec.id,
        'auto', true,
        'reconcile', true
      ),
      timeout_milliseconds := 30000
    );
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

revoke execute on function public.pedidos_wa_reconciliar_holded()
  from public, anon, authenticated;
grant execute on function public.pedidos_wa_reconciliar_holded()
  to service_role;
