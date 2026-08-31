-- E1 · Canal WhatsApp: mapeo teléfono -> cliente de Pedidos WA
-- Aplicada en Supabase Ferlu el 2026-08-30.
--
-- Contexto: pedidos_wa_cliente_telefonos estaba VACÍA, y por eso la edge
-- `whatsapp-inbox` (viva desde 24-jun-2026) nunca resolvió ningún cliente.
--
-- Cambio de modelo: UNIQUE(telefono_norm) asumía "un móvil = un cliente".
-- Es falso en B2B: un mismo dueño tiene varios locales con el mismo móvil
-- (caso real verificado: ALMA 2 y alma paseo comparten el mismo número).
-- Pasamos a UNIQUE(cliente_id, telefono_norm) y la desambiguación se
-- resuelve preguntando al cliente en el Flow, no truncando datos.

begin;

alter table public.pedidos_wa_cliente_telefonos
  drop constraint if exists pedidos_wa_cliente_telefonos_telefono_norm_key;

alter table public.pedidos_wa_cliente_telefonos
  add constraint pedidos_wa_cliente_telefonos_cliente_tel_key
  unique (cliente_id, telefono_norm);

-- El UNIQUE anterior servía además de índice de búsqueda por teléfono.
-- Al quitarlo hay que reponer el índice: es el acceso caliente del webhook.
create index if not exists pedidos_wa_cliente_telefonos_tel_idx
  on public.pedidos_wa_cliente_telefonos (telefono_norm)
  where activo;

-- Semilla desde clientes_preferencias.telefono (única fuente disponible:
-- manager_contactos.raw no trae ninguna clave phone/mobile desde Holded).
-- Solo móviles españoles bien formados; fijos y basura quedan fuera para
-- que Luis los introduzca a mano y conste que son revisados.
with candidatos as (
  select
    p.id as cliente_id,
    cp.telefono as display,
    regexp_replace(coalesce(cp.telefono, ''), '\D', '', 'g') as d
  from public.pedidos_wa_clientes p
  join public.manager_contactos mc on mc.id = p.holded_contact_id
  join public.clientes_preferencias cp on cp.contact_name_canon = mc.nombre
  where p.activo
), normalizados as (
  select
    cliente_id,
    display,
    case
      when d ~ '^[679][0-9]{8}$'   then '34' || d
      when d ~ '^34[679][0-9]{8}$' then d
    end as telefono_norm
  from candidatos
)
insert into public.pedidos_wa_cliente_telefonos
  (cliente_id, telefono_norm, telefono_display, etiqueta, activo)
select cliente_id, telefono_norm, display, 'auto:holded_tags', true
from normalizados
where telefono_norm is not null
on conflict (cliente_id, telefono_norm) do nothing;

commit;

-- Resultado verificado tras aplicar: 33 filas, 33 clientes cubiertos,
-- 32 números distintos (el par que comparte móvil), 0 mal formados.
-- Quedan 26 clientes activos sin teléfono válido, pendientes de alta manual.
