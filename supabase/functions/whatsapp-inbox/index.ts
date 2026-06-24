// Edge Function: whatsapp-inbox
// ----------------------------------------------------------------------------
// Webhook WhatsApp Business API para Pedidos WA.
// - GET: verificacion de webhook Meta.
// - POST webhook: guarda mensajes entrantes y genera una fila diaria copiable.
// - POST admin action: reprocesa el dia desde el dashboard.
//
// No crea pedidos_wa ni confirma Holded. Solo staging operacional.
// ----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || ''
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') || ''
const ALLOW_UNSIGNED_WEBHOOKS = Deno.env.get('WHATSAPP_ALLOW_UNSIGNED_WEBHOOKS') === 'true'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const MODEL = Deno.env.get('WHATSAPP_ORGANIZER_MODEL') || Deno.env.get('PARSER_MODEL') || 'claude-haiku-4-5-20251001'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info, x-hub-signature-256',
}

type Cliente = {
  id: string
  nombre: string
  horario: string | null
  tipo_factura: 'HOLDED' | 'DRIVE' | 'NINGUNA'
  repartidor: 'TORRES' | 'GERMAN' | 'RAUL' | 'ALEX'
  notas: string | null
  activo: boolean
}

type PhoneMap = {
  cliente_id: string
}

type StoredMessage = {
  id: string
  wa_message_id: string
  cliente_id: string | null
  fila_id: string | null
  fecha_negocio: string
  texto: string | null
}

type MessageForProcess = {
  wa_message_id: string
  texto: string | null
  received_at: string
}

type OrganizerResult = {
  pedido: string
  faltas: string | null
  estado: 'listo' | 'revisar'
  confianza: number
}

type WhatsappPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string }
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>
        messages?: WhatsappMessage[]
      }
    }>
  }>
}

type WhatsappMessage = {
  id?: string
  from?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  button?: { text?: string }
  interactive?: {
    button_reply?: { title?: string }
    list_reply?: { title?: string; description?: string }
  }
}

type AdminAction = {
  action?: 'process_pending'
  fecha?: string
}

const SYSTEM_PROMPT = `Eres el organizador de pedidos WhatsApp de Frutas Abocados.

Tu trabajo es convertir mensajes de clientes en UNA fila compacta para una hoja operativa.

Devuelve SOLO JSON valido con esta forma:
{
  "pedido": "1 kg tom pera / 1 perejil / 1 ajo pelado",
  "faltas": null,
  "estado": "listo",
  "confianza": 0.92
}

Reglas:
- No respondas al cliente.
- No inventes cantidades, productos ni horarios.
- Mantén formato compacto separado por " / ".
- Si una parte es duda, falta, correccion o excepcion, ponla en "faltas".
- Si falta cantidad o hay conflicto, usa estado="revisar".
- Si el mensaje dice que falta algo, no lo metas como pedido normal: ponlo en "faltas".
- Conserva nombres operativos cortos cuando sean claros: tom pera, pim rojo, pim verde, cherry, mezclum, ajo pelado.
- "c", "caja" y "cajas" pueden mantenerse como "c".
- "medio", "1/2" y "media" deben quedar como "1/2" si aplica.
- confianza debe estar entre 0 y 1.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: 'SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurada' }, 500)
  }

  if (req.method === 'GET') return handleVerify(req)
  if (req.method !== 'POST') return json({ error: 'Metodo no permitido' }, 405)

  const rawBody = await req.text()
  let body: unknown
  try {
    body = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return json({ error: 'Body JSON invalido' }, 400)
  }

  const action = body as AdminAction
  if (action.action === 'process_pending') {
    try {
      await requireAdmin(req)
      const fecha = validDate(action.fecha) ? action.fecha! : businessDateIso(new Date())
      const result = await processPending(fecha)
      return json({ ok: true, ...result })
    } catch (e) {
      return json({ error: errMsg(e) }, 401)
    }
  }

  if (!APP_SECRET && !ALLOW_UNSIGNED_WEBHOOKS) {
    return json({ error: 'WHATSAPP_APP_SECRET no configurada' }, 500)
  }
  if (APP_SECRET) {
    const ok = await verifyMetaSignature(req.headers.get('x-hub-signature-256'), rawBody, APP_SECRET)
    if (!ok) return json({ error: 'Firma Meta invalida' }, 401)
  }

  try {
    const result = await handleWebhook(body as WhatsappPayload)
    return json({ ok: true, ...result })
  } catch (e) {
    return json({ error: errMsg(e) }, 500)
  }
})

function handleVerify(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token && token === VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200, headers: { ...cors, 'content-type': 'text/plain' } })
  }
  return json({ error: 'Verificacion invalida' }, 403)
}

async function handleWebhook(payload: WhatsappPayload) {
  const inbound = extractMessages(payload)
  const processKeys = new Map<string, { clienteId: string; fecha: string }>()
  const saved: StoredMessage[] = []

  for (const msg of inbound) {
    const telefono = normalizePhone(msg.from)
    const waId = msg.id?.trim()
    if (!waId || !telefono) continue

    const contact = findContact(payload, msg.from)
    const receivedAt = whatsappTimestampToIso(msg.timestamp)
    const fechaNegocio = businessDateIso(new Date(receivedAt))
    const texto = extractText(msg)
    const cliente = await lookupClienteByPhone(telefono)
    const estado = !cliente ? 'sin_cliente' : !texto ? 'sin_texto' : 'recibido'

    const row = await upsertMessage({
      wa_message_id: waId,
      phone_number_id: findPhoneNumberId(payload),
      telefono_norm: telefono,
      perfil_nombre: contact?.profile?.name ?? null,
      cliente_id: cliente?.id ?? null,
      fecha_negocio: fechaNegocio,
      received_at: receivedAt,
      message_type: msg.type ?? 'unknown',
      texto,
      raw_payload: msg,
      estado,
      error: null,
    })
    saved.push(row)

    if (cliente && texto) {
      processKeys.set(`${cliente.id}:${fechaNegocio}`, { clienteId: cliente.id, fecha: fechaNegocio })
    }
  }

  const processed = []
  for (const item of processKeys.values()) {
    processed.push(await processClienteFecha(item.clienteId, item.fecha))
  }

  return { received: inbound.length, saved: saved.length, processed }
}

function extractMessages(payload: WhatsappPayload): WhatsappMessage[] {
  const out: WhatsappMessage[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const messages = change.value?.messages ?? []
      out.push(...messages)
    }
  }
  return out
}

function findPhoneNumberId(payload: WhatsappPayload): string | null {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const id = change.value?.metadata?.phone_number_id
      if (id) return id
    }
  }
  return null
}

function findContact(payload: WhatsappPayload, from?: string) {
  const phone = normalizePhone(from)
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const contact of change.value?.contacts ?? []) {
        if (normalizePhone(contact.wa_id) === phone) return contact
      }
    }
  }
  return null
}

function extractText(msg: WhatsappMessage): string | null {
  const text =
    msg.text?.body ??
    msg.button?.text ??
    msg.interactive?.button_reply?.title ??
    msg.interactive?.list_reply?.title ??
    null
  const trimmed = text?.trim()
  return trimmed ? trimmed : null
}

async function lookupClienteByPhone(phone: string): Promise<Cliente | null> {
  const maps = await dbGet<PhoneMap[]>(
    `pedidos_wa_cliente_telefonos?select=cliente_id&telefono_norm=eq.${encodeURIComponent(phone)}&activo=eq.true&limit=1`,
  )
  const clienteId = maps[0]?.cliente_id
  if (!clienteId) return null
  const clientes = await dbGet<Cliente[]>(
    `pedidos_wa_clientes?select=id,nombre,horario,tipo_factura,repartidor,notas,activo&id=eq.${encodeURIComponent(clienteId)}&limit=1`,
  )
  return clientes[0] ?? null
}

async function getCliente(clienteId: string): Promise<Cliente> {
  const clientes = await dbGet<Cliente[]>(
    `pedidos_wa_clientes?select=id,nombre,horario,tipo_factura,repartidor,notas,activo&id=eq.${encodeURIComponent(clienteId)}&limit=1`,
  )
  const cliente = clientes[0]
  if (!cliente) throw new Error(`Cliente no encontrado: ${clienteId}`)
  return cliente
}

async function upsertMessage(row: Record<string, unknown>): Promise<StoredMessage> {
  const rows = await dbJson<StoredMessage[]>(
    'pedidos_wa_whatsapp_mensajes?on_conflict=wa_message_id',
    {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row),
    },
  )
  const saved = rows[0]
  if (!saved) throw new Error('No se pudo guardar mensaje WhatsApp')
  return saved
}

async function processPending(fecha: string) {
  const rows = await dbGet<Array<{ cliente_id: string | null }>>(
    `pedidos_wa_whatsapp_mensajes?select=cliente_id&fecha_negocio=eq.${fecha}&cliente_id=not.is.null`,
  )
  const clienteIds = [...new Set(rows.map(r => r.cliente_id).filter(Boolean))] as string[]
  const processed = []
  for (const clienteId of clienteIds) {
    processed.push(await processClienteFecha(clienteId, fecha))
  }
  return { fecha, clientes: clienteIds.length, processed }
}

async function processClienteFecha(clienteId: string, fecha: string) {
  const cliente = await getCliente(clienteId)
  const messages = await dbGet<MessageForProcess[]>(
    `pedidos_wa_whatsapp_mensajes?select=wa_message_id,texto,received_at&cliente_id=eq.${encodeURIComponent(clienteId)}&fecha_negocio=eq.${fecha}&texto=not.is.null&order=received_at.asc`,
  )
  const usable = messages.filter(m => m.texto?.trim())
  if (usable.length === 0) return { cliente_id: clienteId, fecha, status: 'sin_texto' }

  try {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY no configurada')
    const organized = await organizeWithClaude(cliente, usable)
    const filaRows = await dbJson<Array<{ id: string }>>(
      'pedidos_wa_whatsapp_filas?on_conflict=fecha,cliente_id',
      {
        method: 'POST',
        headers: { prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          fecha,
          cliente_id: clienteId,
          pedido: organized.pedido,
          faltas: organized.faltas,
          estado: organized.estado,
          confianza: clamp01(organized.confianza),
          source_message_ids: usable.map(m => m.wa_message_id),
          raw_respuesta: organized,
          modelo: MODEL,
          error: null,
          generated_at: new Date().toISOString(),
        }),
      },
    )
    const filaId = filaRows[0]?.id ?? null
    await patchMessages(clienteId, fecha, { estado: 'procesado', fila_id: filaId, error: null })
    return { cliente_id: clienteId, fecha, status: organized.estado, fila_id: filaId }
  } catch (e) {
    const message = errMsg(e)
    await dbJson(
      'pedidos_wa_whatsapp_filas?on_conflict=fecha,cliente_id',
      {
        method: 'POST',
        headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          fecha,
          cliente_id: clienteId,
          pedido: '',
          faltas: null,
          estado: 'error',
          source_message_ids: usable.map(m => m.wa_message_id),
          modelo: MODEL,
          error: message,
          generated_at: new Date().toISOString(),
        }),
      },
    )
    await patchMessages(clienteId, fecha, { estado: 'error', error: message })
    return { cliente_id: clienteId, fecha, status: 'error', error: message }
  }
}

async function organizeWithClaude(cliente: Cliente, messages: MessageForProcess[]): Promise<OrganizerResult> {
  const userMsg = `Cliente: ${cliente.nombre}
Horario default: ${cliente.horario ?? ''}
Factura default: ${cliente.tipo_factura}
Reparto default: ${cliente.repartidor}
Notas cliente: ${cliente.notas ?? ''}

Mensajes del dia:
${messages.map((m, i) => `${i + 1}. [${m.received_at}] ${m.texto}`).join('\n')}`

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 900,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    }),
  })
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 240)}`)
  const data = await res.json() as { content?: Array<{ type: string; text?: string }> }
  const text = (data.content ?? [])
    .filter(block => block.type === 'text')
    .map(block => block.text ?? '')
    .join('')
    .trim()
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  let parsed: OrganizerResult
  try {
    parsed = JSON.parse(cleaned) as OrganizerResult
  } catch {
    throw new Error(`Claude devolvio JSON invalido: ${cleaned.slice(0, 180)}`)
  }
  if (!parsed || typeof parsed.pedido !== 'string') {
    throw new Error('Respuesta IA sin pedido')
  }
  const estado = parsed.estado === 'listo' ? 'listo' : 'revisar'
  return {
    pedido: parsed.pedido.trim(),
    faltas: parsed.faltas?.trim() || null,
    estado: parsed.pedido.trim() && estado === 'listo' ? 'listo' : 'revisar',
    confianza: clamp01(Number(parsed.confianza ?? 0)),
  }
}

async function patchMessages(clienteId: string, fecha: string, patch: Record<string, unknown>) {
  await dbJson(
    `pedidos_wa_whatsapp_mensajes?cliente_id=eq.${encodeURIComponent(clienteId)}&fecha_negocio=eq.${fecha}&texto=not.is.null`,
    {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    },
  )
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.toLowerCase().startsWith('bearer ')) throw new Error('Sesion requerida')
  if (!ANON_KEY) throw new Error('SUPABASE_ANON_KEY no configurada')

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, authorization: auth },
  })
  if (!userRes.ok) throw new Error('Sesion invalida')
  const user = await userRes.json() as { id?: string }
  if (!user.id) throw new Error('Usuario no encontrado')

  const profiles = await dbGet<Array<{ role: string }>>(
    `profiles?select=role&id=eq.${encodeURIComponent(user.id)}&limit=1`,
  )
  const role = profiles[0]?.role
  if (role !== 'admin_full' && role !== 'admin_op') throw new Error('Admin requerido')
}

async function dbGet<T>(path: string): Promise<T> {
  return dbJson<T>(path, { method: 'GET' })
}

async function dbJson<T = unknown>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('apikey', SERVICE_KEY)
  headers.set('authorization', `Bearer ${SERVICE_KEY}`)
  if (init.body) headers.set('content-type', 'application/json')
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PostgREST ${res.status}: ${text.slice(0, 260)}`)
  }
  if (res.status === 204) return null as T
  const text = await res.text()
  return text ? JSON.parse(text) as T : null as T
}

async function verifyMetaSignature(header: string | null, body: string, secret: string): Promise<boolean> {
  if (!header?.startsWith('sha256=')) return false
  const expected = await hmacSha256Hex(secret, body)
  return timingSafeEqual(header.slice(7), expected)
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

function normalizePhone(value?: string | null): string {
  return (value ?? '').replace(/\D/g, '').slice(0, 16)
}

function whatsappTimestampToIso(ts?: string): string {
  const seconds = Number(ts)
  if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000).toISOString()
  return new Date().toISOString()
}

function businessDateIso(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  const hour = Number(get('hour'))
  const base = new Date(Date.UTC(year, month - 1, day))
  if (hour < 10) base.setUTCDate(base.getUTCDate() - 1)
  return base.toISOString().slice(0, 10)
}

function validDate(value?: string): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}
