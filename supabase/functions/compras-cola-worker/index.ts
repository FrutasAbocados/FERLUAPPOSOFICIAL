// Edge Function: compras-cola-worker
// ----------------------------------------------------------------------------
// Procesa la cola `pedidos_wa_compras_cola` en servidor, para que una tanda de
// facturas de proveedor siga aunque se cierre la app o el móvil se bloquee.
//
// Por cada PDF: OCR (parsear-factura-proveedor) → proveedor (autodetección o
// alias aprendido) → guardar compra + líneas + PDF → subir a Holded
// (compra-a-holded). Mismas reglas que la tanda que antes corría en el
// navegador: SOLO sube a Holded lo limpio; lo dudoso queda guardado y en
// «revisar». Al terminar un lote, `pedidos_wa_compras_cola_cerrar_lote`
// manda la notificación push.
//
// Lo despiertan la app al encolar y el cron `compras-cola-worker` cada minuto.
// Responde enseguida y trabaja en segundo plano (EdgeRuntime.waitUntil).
// Auth: service_role o admin.
// ----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const BUCKET       = 'gestoria-documentos'
/** Margen bajo el límite de reloj de la edge; el cron recoge lo que quede. */
const PRESUPUESTO_MS = 110_000
/** Diferencia máxima entre la suma de líneas y el bruto para subir sin revisión. */
const TOLERANCIA_DESVIACION = 0.05

const PROVEEDOR_HOLDED_ID: Record<string, string> = {
  alcalde:    '6923e68c528c6c69df09b578',
  abasthosur: '6980edf440e80f35360b88ed',
  agroejido:  '6995d3740c1522995e0b7ee6',
}

const dbHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonRes(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } })
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

/**
 * Nunca se fía de los claims sin verificar: el cron entra con la service key
 * exacta y la app con una sesión que valida Auth (/auth/v1/user).
 */
async function checkAuthAdmin(req: Request): Promise<boolean> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  if (timingSafeEqual(token, SERVICE_KEY)) return true
  // El cron usa la service key guardada en Vault, que no tiene por qué ser
  // textualmente la misma que recibe la función. Se valida con Supabase: el
  // listado de usuarios de Auth solo responde a una service key auténtica.
  const adminRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`, {
    headers: { apikey: token, authorization: `Bearer ${token}` },
  })
  if (adminRes.ok) return true
  if (!ANON_KEY) return false
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, authorization: `Bearer ${token}` },
  })
  if (!userRes.ok) return false
  const user = await userRes.json() as { id?: string }
  if (!user.id) return false
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,
    { headers: dbHeaders },
  )
  if (!res.ok) return false
  const rows = await res.json() as Array<{ role?: string }>
  return ['admin_full', 'admin_op'].includes(rows[0]?.role ?? '')
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Trabajo = {
  id: string
  lote_id: string
  nombre: string
  storage_path: string
  compra_id: string | null
  created_by: string | null
}

type Linea = {
  orden: number
  codigo_proveedor: string | null
  descripcion: string
  lote?: string | null
  origen?: string | null
  cantidad: number
  unidad: string
  precio_unitario: number
  iva_pct: number
  importe: number
  notas: string | null
}

type Extraccion = {
  proveedor_detectado: string
  proveedor_nombre: string
  num_factura: string
  fecha: string
  total_bruto: number
  total_iva: number
  total: number
  iva_desglose: unknown
  lineas: Linea[]
  notas_globales?: string | null
}

type Compra = {
  id: string
  pdf_path: string | null
  holded_purchase_id: string | null
  holded_purchase_num: string | null
  lineas?: unknown[]
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...dbHeaders, ...(init.headers ?? {}) },
  })
  const txt = await res.text()
  if (!res.ok) {
    let code = ''
    try { code = (JSON.parse(txt) as { code?: string }).code ?? '' } catch { /* */ }
    const err = new Error(`${path.split('?')[0]} ${res.status}: ${txt.slice(0, 300)}`) as Error & { code?: string }
    err.code = code
    throw err
  }
  return (txt ? JSON.parse(txt) : null) as T
}

async function patchTrabajo(id: string, patch: Record<string, unknown>) {
  await rest(`pedidos_wa_compras_cola?id=eq.${id}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  return await rest<T>(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) })
}

async function invocar<T>(fn: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: dbHeaders,
    body: JSON.stringify(body),
  })
  const txt = await res.text()
  let data: unknown = null
  try { data = JSON.parse(txt) } catch { data = { error: txt.slice(0, 300) } }
  return { status: res.status, data: data as T }
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

async function descargar(path: string): Promise<Uint8Array> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { headers: dbHeaders })
  if (!res.ok) throw new Error(`No se pudo leer el PDF subido (${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
}

/** Copia el PDF de la cola a la ruta definitiva de la compra (misma que usa la app). */
async function archivarPdf(origen: string, compraId: string): Promise<string> {
  const destino = `compras/${compraId}/original.pdf`
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/copy`, {
    method: 'POST',
    headers: dbHeaders,
    body: JSON.stringify({ bucketId: BUCKET, sourceKey: origen, destinationKey: destino }),
  })
  if (!res.ok) {
    const txt = await res.text()
    // Reintento: el destino ya existe porque la copia anterior sí llegó.
    if (!(res.status === 400 && /exists|Duplicate/i.test(txt))) {
      throw new Error(`No se archivó el PDF original (${res.status})`)
    }
  }
  return destino
}

/** Igual que `repararLineasExtraccion` del cliente: precio 0 con importe coherente. */
function repararLineas(extr: Extraccion): Extraccion {
  const lineas = (extr.lineas ?? []).map((l) => {
    const cantidad = Number(l.cantidad ?? 0)
    const importe  = Number(l.importe ?? 0)
    const precio   = Number(l.precio_unitario ?? 0)
    if (cantidad <= 0) return l
    const cuadra = Math.abs(cantidad * precio - importe) <= 0.05
    if (cuadra && precio > 0) return l
    if (importe > 0) return { ...l, precio_unitario: Number((importe / cantidad).toFixed(4)) }
    return l
  })
  return { ...extr, lineas }
}

const euros = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

// ─── Un trabajo ──────────────────────────────────────────────────────────────

async function subirAHolded(t: Trabajo, compraId: string) {
  await patchTrabajo(t.id, { estado: 'subiendo', detalle: 'Subiendo a Holded…' })
  const { status, data } = await invocar<{
    ok?: boolean; holded_purchase_id?: string; holded_purchase_num?: string | null
    error?: string; detail?: string; warning?: string
  }>('compra-a-holded', { compra_id: compraId, dry_run: false })

  if (status === 200 && data.ok && data.holded_purchase_id) {
    await patchTrabajo(t.id, { estado: 'ok', detalle: null, holded_num: data.holded_purchase_num ?? '✓' })
    return
  }
  // 207: creada en Holded pero no anotada en BD. Reintentar duplicaría.
  if (status === 207) {
    await patchTrabajo(t.id, {
      estado: 'revisar',
      detalle: `Subida a Holded (${data.holded_purchase_num ?? data.holded_purchase_id}) pero no se anotó — avisa antes de volver a subirla`,
    })
    return
  }
  await patchTrabajo(t.id, {
    estado: 'error',
    detalle: `Holded: ${data.error ?? status}${data.detail ? ` — ${String(data.detail).slice(0, 200)}` : ''}`,
  })
}

async function procesar(t: Trabajo) {
  // Ya guardada en un intento anterior: solo falta Holded (la edge es idempotente
  // si la compra ya tiene holded_purchase_id).
  if (t.compra_id) {
    const [c] = await rest<Compra[]>(`pedidos_wa_compras?id=eq.${t.compra_id}&select=id,holded_purchase_id,holded_purchase_num`)
    if (c?.holded_purchase_id) {
      await patchTrabajo(t.id, { estado: 'ok', detalle: null, holded_num: c.holded_purchase_num ?? '✓' })
      return
    }
    await subirAHolded(t, t.compra_id)
    return
  }

  await patchTrabajo(t.id, { estado: 'ocr', detalle: 'Leyendo el PDF…' })
  const bytes = await descargar(t.storage_path)
  const { data: parsed } = await invocar<Extraccion | { error: string }>(
    'parsear-factura-proveedor',
    { pdf_base64: toBase64(bytes), filename: t.nombre },
  )
  if (!parsed || 'error' in parsed) {
    throw new Error((parsed as { error?: string })?.error ?? 'Respuesta vacía del parser')
  }
  const extr = repararLineas(parsed)

  let holdedId: string | null = PROVEEDOR_HOLDED_ID[extr.proveedor_detectado] ?? null
  let proveedorNombre = extr.proveedor_nombre
  if (!holdedId) {
    const norm = (extr.proveedor_nombre ?? '').trim().toLowerCase()
    if (norm) {
      const alias = await rest<Array<{ holded_contact_id: string; holded_nombre: string }>>(
        `pedidos_wa_proveedor_alias?nombre_norm=eq.${encodeURIComponent(norm)}&activo=eq.true&select=holded_contact_id,holded_nombre&limit=1`,
      ).catch(() => [])
      if (alias[0]) {
        holdedId = alias[0].holded_contact_id
        proveedorNombre = alias[0].holded_nombre
      }
    }
  }

  const numFactura = (extr.num_factura ?? '').trim()
  const sumaLineas = extr.lineas.reduce((s, l) => s + Number(l.importe ?? 0), 0)
  const desv = Math.abs(sumaLineas - Number(extr.total_bruto ?? 0))

  await patchTrabajo(t.id, {
    estado: 'guardando',
    detalle: 'Guardando la compra…',
    proveedor: proveedorNombre,
    num_factura: numFactura,
    total: Number(extr.total ?? 0),
  })

  // Cabecera. Si ya existe (mismo proveedor + nº), se continúa la existente
  // como hacía la cola del navegador con `permitir_reanudar`.
  let compra: Compra
  let compraNueva = true
  try {
    const [nueva] = await rest<Compra[]>('pedidos_wa_compras?select=id,pdf_path,holded_purchase_id,holded_purchase_num', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        proveedor_holded_id: holdedId,
        proveedor_nombre:    proveedorNombre,
        num_factura:         numFactura,
        fecha:               extr.fecha,
        total_bruto:         extr.total_bruto,
        total_iva:           extr.total_iva,
        total:               extr.total,
        iva_desglose:        extr.iva_desglose,
        pdf_filename:        t.nombre,
        raw_extraction:      extr,
        notas:               extr.notas_globales ?? null,
        origen:              'pdf',
        created_by:          t.created_by,
      }),
    })
    compra = nueva
  } catch (e) {
    if ((e as { code?: string }).code !== '23505' || !holdedId) throw e
    const [existente] = await rest<Compra[]>(
      `pedidos_wa_compras?proveedor_holded_id=eq.${encodeURIComponent(holdedId)}&num_factura=eq.${encodeURIComponent(numFactura)}` +
      `&select=id,pdf_path,holded_purchase_id,holded_purchase_num,lineas:pedidos_wa_compras_lineas(id)`,
    )
    if (!existente) throw e
    compra = existente
    compraNueva = false
  }

  try {
    if (!(compra.lineas?.length) && extr.lineas.length > 0) {
      await rest('pedidos_wa_compras_lineas', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify(extr.lineas.map((l) => ({
          compra_id:        compra.id,
          orden:            l.orden,
          codigo_proveedor: l.codigo_proveedor,
          descripcion:      l.descripcion,
          lote:             l.lote ?? null,
          origen:           l.origen ?? null,
          cantidad:         l.cantidad,
          unidad:           l.unidad,
          precio_unitario:  l.precio_unitario,
          iva_pct:          l.iva_pct,
          importe:          l.importe,
          notas:            l.notas,
        }))),
      })
    }
    if (!compra.pdf_path) {
      const pdfPath = await archivarPdf(t.storage_path, compra.id)
      await rest(`pedidos_wa_compras?id=eq.${compra.id}`, {
        method: 'PATCH',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ pdf_path: pdfPath }),
      })
    }
  } catch (e) {
    // Sin líneas o sin PDF la compra no sirve: se deshace la cabecera nueva
    // para que el reintento empiece limpio.
    if (compraNueva) {
      await rest(`pedidos_wa_compras?id=eq.${compra.id}`, { method: 'DELETE' }).catch(() => {})
    }
    throw e
  }

  await patchTrabajo(t.id, { compra_id: compra.id })

  if (compra.holded_purchase_id) {
    await patchTrabajo(t.id, { estado: 'ok', detalle: null, holded_num: compra.holded_purchase_num ?? '✓' })
    return
  }

  const bloqueo = !holdedId
    ? 'Guardada sin proveedor Holded — enlázalo abajo y súbela a mano'
    : !numFactura
    ? 'Guardada sin nº de factura — complétalo antes de subirla'
    : desv > TOLERANCIA_DESVIACION
    ? `Guardada, NO subida: las líneas (${euros(sumaLineas)}) no cuadran con el bruto (${euros(Number(extr.total_bruto ?? 0))}), dif. ${euros(desv)}`
    : extr.notas_globales
    ? `Guardada, NO subida: el OCR no se fía — ${extr.notas_globales}`
    : null

  if (bloqueo) {
    await patchTrabajo(t.id, { estado: 'revisar', detalle: bloqueo })
    return
  }
  await subirAHolded(t, compra.id)
}

// ─── Bucle ───────────────────────────────────────────────────────────────────

async function trabajar() {
  const inicio = Date.now()
  while (Date.now() - inicio < PRESUPUESTO_MS) {
    const [t] = await rpc<Trabajo[]>('pedidos_wa_compras_cola_reclamar')
    if (!t) break
    try {
      await procesar(t)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const dup = (e as { code?: string }).code === '23505' || /duplicate key|unique/i.test(msg)
      console.error('[compras-cola-worker]', t.id, msg)
      await patchTrabajo(t.id, {
        estado: 'error',
        detalle: dup ? 'Esta factura ya estaba registrada' : msg.slice(0, 400),
      }).catch(() => {})
    }
    await rpc('pedidos_wa_compras_cola_cerrar_lote', { p_lote: t.lote_id }).catch((e) => {
      console.error('[compras-cola-worker] cerrar lote', e instanceof Error ? e.message : e)
    })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!(await checkAuthAdmin(req))) return jsonRes({ error: 'solo admin' }, 403)

  // @ts-ignore EdgeRuntime existe en el runtime de Supabase
  EdgeRuntime.waitUntil(trabajar().catch((e) => console.error('[compras-cola-worker] bucle', e)))
  return jsonRes({ ok: true })
})
