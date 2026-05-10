# ⚠️ OBSOLETO 2026-05-09 — Setup webhook Holded

> **NO seguir esta guía.** El sondeo del 2026-05-09 PM4 con API key real
> confirmó que el endpoint `POST /api/webhooks/v1/create` ya no existe en el
> API REST de Holded — devuelve la app web PHP (con `PHPSESSID`) en lugar de
> JSON. Las "guías" terceras (rollout/integrately/apitracker) están obsoletas.
>
> **Decisión adoptada:** Plan B1 = aceptar polling cron horario `holded-sync`
> (cubre 95% del caso). Ver detalle en
> `~/.claude/projects/-Users-luis/memory/holded_webhook_investigacion_pendiente.md`.
>
> Esta guía se conserva como referencia histórica del intento.

---

## (Histórico) Setup webhook Holded — guía operativa

Esta guía era para configurar el webhook Holded en producción una vez. La parte
delicada era **descubrir qué secret usa Holded para firmar el HMAC**, porque NO
está documentado públicamente.

> Edge desplegado: `holded-webhook` v2 (2026-05-09).
> Acepta `x-holded-signature` HMAC SHA256 (preferido) o `x-webhook-secret`
> legacy (fallback inútil hasta que Holded soporte custom headers).
>
> Secret pendiente en `app_settings.holded_webhook_hmac_secret = PENDING_SET_AFTER_TEST`.

## Variables que necesitas

```bash
export HOLDED_API_KEY="<tu API key de Holded — obtenerla en Holded Settings → Developers → API key>"
export EDGE_URL="https://ucjkyjhvvdofyaizzdbk.supabase.co/functions/v1/holded-webhook"
```

## Paso 1 — Sondear con un evento real (descubrir el secret HMAC)

### 1.1 Registrar 1 webhook de PRUEBA apuntando al edge

```bash
curl -sX POST https://api.holded.com/api/webhooks/v1/create \
  -H "key: $HOLDED_API_KEY" \
  -H "content-type: application/json" \
  -d "{\"url\": \"$EDGE_URL\", \"event\": \"invoice.created\"}"
```

> Guarda el JSON que devuelve. Si trae un campo `secret` o similar, ESE es el
> secret HMAC. Si solo trae un `id`, el secret será probablemente la API key.

### 1.2 Listar webhooks registrados (para ver qué guardó Holded)

```bash
curl -s https://api.holded.com/api/webhooks/v1/list \
  -H "key: $HOLDED_API_KEY" | jq .
```

### 1.3 Generar un evento real

Crea **una factura de prueba** en Holded (cliente test, importe simbólico
1 €). Esto disparará el webhook `invoice.created`.

### 1.4 Inspeccionar el log del edge

En Supabase Studio → Edge Functions → `holded-webhook` → Logs.
Busca la línea con prefijo `[HOLDED-WEBHOOK-DEBUG]`. Verás algo como:

```
[HOLDED-WEBHOOK-DEBUG] {"headers":{"x-holded-signature":"a1b2c3...","content-type":"application/json"},"body_preview":"{\"event\":\"invoice.created\",\"data\":{\"id\":\"...\"...}","body_len":NNN}
```

**Copia el `x-holded-signature` y el `body_preview` completo.**

### 1.5 Probar candidatos para el secret

Crea un script Python local (o bash + openssl) que pruebe varios candidatos:

```python
import hmac, hashlib

body = '''<pega aquí el body_preview EXACTO, byte a byte>'''
expected_sig = '<pega aquí el x-holded-signature>'

candidates = {
    "API key": "<TU_HOLDED_API_KEY>",
    "API key reverse": "<TU_HOLDED_API_KEY>"[::-1],
    # añade otros si los descubres
}

for name, secret in candidates.items():
    h = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    print(f"{name}: {h}  {'✅ MATCH' if h == expected_sig.lower() else ''}")
```

> El secret correcto será el que produce un HMAC que matchea
> `x-holded-signature`. Si la API key no matchea, prueba: API key + ":",
> "secret" + API key, primeros 32 chars de la API key, etc.

### 1.6 Configurar el secret en Supabase

Una vez identificado:

```sql
-- Ejecutar en Supabase Studio → SQL Editor (proyecto Ferlu)
UPDATE app_settings
SET value = '<el secret descubierto>', updated_at = now()
WHERE key = 'holded_webhook_hmac_secret';
```

### 1.7 Verificar fin a fin

Crea otra factura de prueba en Holded. En el log del edge debería aparecer:

```
{"ok":true,"auth_method":"hmac","event":"invoice.created","holded_id":"...",...}
```

Si vuelve `auth_method:"hmac"` con `ok:true`, el HMAC matchea y todo funciona.

## Paso 2 — Registrar los webhooks definitivos

Holded crea **un webhook por cada evento** (no soporta wildcards `invoice.*`).
Hay que registrar uno por cada uno:

```bash
for ev in invoice.created invoice.updated invoice.deleted \
          waybill.created waybill.updated waybill.deleted; do
  echo "Registering $ev..."
  curl -sX POST https://api.holded.com/api/webhooks/v1/create \
    -H "key: $HOLDED_API_KEY" \
    -H "content-type: application/json" \
    -d "{\"url\": \"$EDGE_URL\", \"event\": \"$ev\"}" | jq -r '.id // .error // .'
done
```

## Paso 3 — Eliminar el webhook de prueba (opcional)

Si en el paso 1.1 registraste solo `invoice.created` y luego en el paso 2 lo
duplicaste, elimina el primero para no recibir eventos duplicados:

```bash
# Listar para ver IDs
curl -s https://api.holded.com/api/webhooks/v1/list -H "key: $HOLDED_API_KEY" | jq .

# Borrar el ID duplicado
curl -sX DELETE "https://api.holded.com/api/webhooks/v1/<webhook_id>" \
  -H "key: $HOLDED_API_KEY"
```

## Paso 4 — Verificar el flujo en el primer pedido real

1. Crear una factura nueva en Holded (cliente real, datos reales).
2. Verificar en Supabase:

```sql
SELECT holded_invoice_num, holded_status, holded_total, holded_last_webhook_at
FROM pedidos_wa
WHERE holded_invoice_id = '<id devuelto por Holded>';
```

> Si `holded_last_webhook_at` se rellena → el webhook está vivo.
> Si `holded_status = 'approved'` después de aprobar la factura en Holded →
> bidireccional OK.

## Paso 5 — Limpiar logging de debug

Una vez estable y verificado, en `supabase/functions/holded-webhook/index.ts`
quitar los `console.log('[HOLDED-WEBHOOK-DEBUG]', ...)` y redeploy. Ya no
hacen falta y abultan los logs.

## Si nada de esto funciona

Plan B: contactar al soporte Holded preguntando "¿con qué secret se firma el
header `x-holded-signature` en los webhooks API v1?". Es información que
deberían poder dar sin problemas.

## Referencias

- Endpoint create: `POST https://api.holded.com/api/webhooks/v1/create`
- Header signature: `x-holded-signature: <hex_sha256>` (puede o no llevar
  prefix `sha256=`)
- Eventos confirmados: `invoice.created` (resto inferidos por convención).
- Edge function: `supabase/functions/holded-webhook/index.ts` v2.
- Memoria del proyecto: `~/.claude/projects/-Users-luis/memory/holded_webhook_investigacion_pendiente.md`.
