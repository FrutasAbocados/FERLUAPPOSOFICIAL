// Edge Function: pedido-foto
// ----------------------------------------------------------------------------
// Lee la foto de un pedido (lista a mano, nota de cocina o captura de WhatsApp)
// y la devuelve como texto compacto para la Box manual de WA auto.
// - Solo admin.
// - No guarda nada ni crea pedidos: el texto vuelve a la caja y la persona lo
//   revisa antes de enviarlo al organizador de siempre.
//
// Body: { imagen: { b64: string, media_type: string }, cliente_nombre?: string }
// Devuelve: { texto: string, ilegible: boolean }
// ----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const MODEL = Deno.env.get('PEDIDO_FOTO_MODEL') || 'claude-sonnet-4-6'

// Claude solo acepta estos formatos; el cliente convierte HEIC a JPEG antes.
const MEDIA_TYPES_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_B64 = 5_000_000

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
}

type Body = {
  imagen?: { b64?: string; media_type?: string }
  cliente_nombre?: string
}

const SYSTEM_PROMPT = `Eres quien transcribe pedidos de Frutas Abocados (mayorista de frutas y verduras).

Te llega la foto de un pedido: una lista escrita a mano, una nota de cocina o una captura de un chat de WhatsApp.

Devuelve SOLO JSON valido:
{ "texto": "1 kg tom pera / 2 c banana / 1 saco patata", "ilegible": false }

Reglas:
- Transcribe solo productos y cantidades del pedido, separados por " / ".
- No inventes cantidades, productos ni unidades. Si una cantidad no se lee, escribe el producto con "?" delante.
- Si es una captura de chat, usa solo los mensajes del cliente que piden mercancia; ignora saludos, horas y respuestas nuestras.
- Si hay tachones, no incluyas lo tachado.
- Abreviaturas operativas cortas cuando sean claras: c (caja), kg, tom pera, pim rojo, pim verde, cherry, ajo pelado.
- Si dice que algo falta, no lo pidas, o es una duda, añadelo al final como "(nota: ...)".
- Si la foto no se puede leer con seguridad, devuelve "texto": "" e "ilegible": true.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Metodo no permitido' }, 405)
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) return json({ error: 'Supabase no configurado' }, 500)
  if (!ANTHROPIC_KEY) return json({ error: 'ANTHROPIC_API_KEY no configurada' }, 500)

  try {
    await requireAdmin(req)
  } catch (e) {
    return json({ error: errMsg(e) }, 401)
  }

  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return json({ error: 'Body JSON invalido' }, 400)
  }

  const b64 = body.imagen?.b64 ?? ''
  const mediaType = body.imagen?.media_type ?? ''
  if (!b64 || b64.length < 100) return json({ error: 'Falta la imagen' }, 400)
  if (b64.length > MAX_B64) return json({ error: 'Imagen demasiado grande' }, 413)
  if (!MEDIA_TYPES_OK.includes(mediaType)) return json({ error: `Formato no soportado: ${mediaType}` }, 400)

  const cliente = body.cliente_nombre?.trim()
  try {
    const result = await leerFoto(b64, mediaType, cliente)
    return json(result)
  } catch (e) {
    return json({ error: errMsg(e) }, 502)
  }
})

async function leerFoto(b64: string, mediaType: string, cliente?: string) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: cliente ? `Cliente: ${cliente}. Transcribe el pedido.` : 'Transcribe el pedido.' },
        ],
      }],
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
  let parsed: { texto?: unknown; ilegible?: unknown }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Claude devolvio JSON invalido: ${cleaned.slice(0, 180)}`)
  }
  const texto = typeof parsed.texto === 'string' ? parsed.texto.trim() : ''
  return { texto, ilegible: parsed.ilegible === true || !texto }
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.toLowerCase().startsWith('bearer ')) throw new Error('Sesion requerida')

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, authorization: auth },
  })
  if (!userRes.ok) throw new Error('Sesion invalida')
  const user = await userRes.json() as { id?: string }
  if (!user.id) throw new Error('Usuario no encontrado')

  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(user.id)}&limit=1`,
    { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
  )
  if (!profRes.ok) throw new Error('No se pudo leer el perfil')
  const profiles = await profRes.json() as Array<{ role: string }>
  const role = profiles[0]?.role
  if (role !== 'admin_full' && role !== 'admin_op') throw new Error('Admin requerido')
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
