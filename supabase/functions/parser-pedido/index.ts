// Edge Function: parser-pedido
// ----------------------------------------------------------------------------
// Fallback IA para líneas de pedido WhatsApp que el regex del frontend no
// pudo resolver. Recibe SOLO las líneas ambiguas y devuelve JSON estructurado.
// Single-shot Haiku 4.5 (barato, rápido, sin tools).
//
// Body: {
//   lineas_pendientes: string[],
//   cliente_nombre: string,
//   abreviaturas_extra?: { abreviatura: string, producto: string }[]
// }
// Devuelve: { lineas: ParsedLinea[] }
// ----------------------------------------------------------------------------

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const MODEL         = Deno.env.get('PARSER_MODEL') || 'claude-haiku-4-5-20251001'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, apikey',
}

type ParsedLinea = {
  orden: number
  cantidad: number
  unidad: 'caja' | 'caja_pequena' | 'kg' | 'saco' | 'bolsa' | 'manojo' | 'bandeja' | 'lecho' | 'carton' | 'unidad'
  producto: string
  productoRaw: string
  subseccion: string | null
  notas: string | null
  esGratis: boolean
}

type Body = {
  lineas_pendientes: string[]
  cliente_nombre: string
  abreviaturas_extra?: { abreviatura: string; producto: string }[]
}

const SYSTEM_BASE = `Eres el parser de pedidos de un distribuidor de fruta y verdura en Málaga, España (Frutas Abocados / Ferlu). Tu ÚNICA función es convertir líneas de pedido en JSON estructurado.

REGLAS ABSOLUTAS:
1. Devuelve SOLO JSON válido. Sin texto antes ni después. Sin markdown ni \`\`\`.
2. Usa el diccionario de abreviaturas SIEMPRE.
3. "GRATIS" / "regalo" → esGratis=true, no afecta cantidad.
4. "BUENO" / "BUENAS" / "o rosa?" / calificadores de calidad → añadir a notas.
5. Si una línea es notas administrativas (ej. "COBRAR FACT ANTERIOR", "HABLAR CON SALVIO") → IGNORARLA, no es producto. Esa fase ya la maneja el frontend.
6. "NOMBRE:" en mayúsculas → la siguiente línea/s pertenecen a esa subseccion. Si recibes una línea ya marcada como subseccion, mantén ese valor.
7. "1/2 c" = cantidad 0.5 unidad caja. "2,5 kg" = cantidad 2.5. "0,5kg" sin espacio = igual. "1peti" sin espacio = cantidad 1, unidad caja_pequena.
8. Si no hay unidad explícita → unidad="unidad".

DICCIONARIO BASE:
- pim = pimiento | pim rojo = pimiento rojo california | pim verde = pimiento verde california
- pim italiano = pimiento italiano | pim padron = pimiento de padrón
- tom = tomate | daniela = tomate daniela | cherry = tomate cherry
- tom pera / tomate pera = tomate pera | huevo toro = tomate huevo de toro | rosa = tomate rosa
- iceberg = lechuga iceberg | romana = lechuga romana
- champi = champiñón entero | champi laminado = champiñón laminado
- rucula = rúcula | canonigos = canónigos | mezclum = mezclum | micromezclum = micromezclum
- baby leaf = baby leaf | escarola = escarola
- ajo pelado = ajo pelado | cogollo / cogollos / cogollo corto = cogollos cortos | cogollos largos = cogollos largos
- nueva = patata nueva | torcal = patata torcal | monalisa = patata monalisa
- agria / agria negra / agria negro = patata agria negra
- judia bobby = judía bobby | judia = judía | platanos = plátano canario | bananas = banana

UNIDADES (devuelve EXACTAMENTE estos strings):
- "caja" (c, caja) | "caja_pequena" (peti) | "kg" | "saco" (saco/sacos) | "bolsa" (bolsa/bolsas)
- "manojo" | "bandeja" | "lecho" (lecho/lechos) | "carton" (carton/cartón/cartones) | "unidad" (sin unidad / "u")

FORMATO RESPUESTA (sin nada más):
{
  "lineas": [
    {
      "orden": 1,
      "cantidad": 2,
      "unidad": "caja",
      "producto": "Naranja zumo",
      "productoRaw": "naranja",
      "subseccion": null,
      "notas": null,
      "esGratis": false
    }
  ]
}`

function buildSystem(abreviaturasExtra?: Body['abreviaturas_extra']) {
  if (!abreviaturasExtra || abreviaturasExtra.length === 0) return SYSTEM_BASE
  const extra = abreviaturasExtra
    .map(a => `- ${a.abreviatura} = ${a.producto}`)
    .join('\n')
  return `${SYSTEM_BASE}\n\nDICCIONARIO ADICIONAL DEL USUARIO:\n${extra}`
}

async function parseConClaude(body: Body): Promise<ParsedLinea[]> {
  const system = buildSystem(body.abreviaturas_extra)
  const userMsg = `Cliente: ${body.cliente_nombre}

Líneas pendientes a parsear (cada una es UN producto a estructurar; mantén el orden recibido):
${body.lineas_pendientes.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Devuelve el JSON con exactamente ${body.lineas_pendientes.length} elementos en "lineas" (uno por línea recibida, en el mismo orden).`

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  })
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { content: Array<{ type: string; text?: string }> }
  const text = data.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('').trim()
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()

  let parsed: { lineas?: ParsedLinea[] }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Claude devolvió JSON inválido: ${cleaned.slice(0, 150)}`)
  }
  return parsed.lineas ?? []
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!ANTHROPIC_KEY) return json({ error: 'ANTHROPIC_API_KEY no configurada' }, 500)
  if (req.method !== 'POST') return json({ error: 'Solo POST' }, 405)

  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return json({ error: 'Body JSON inválido' }, 400)
  }
  if (!Array.isArray(body.lineas_pendientes) || body.lineas_pendientes.length === 0) {
    return json({ error: 'lineas_pendientes vacío' }, 400)
  }
  if (typeof body.cliente_nombre !== 'string' || !body.cliente_nombre.trim()) {
    return json({ error: 'cliente_nombre requerido' }, 400)
  }
  if (body.lineas_pendientes.length > 50) {
    return json({ error: 'máximo 50 líneas por llamada' }, 400)
  }

  try {
    const lineas = await parseConClaude(body)
    return json({ lineas })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, 500)
  }
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}
