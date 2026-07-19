// Edge Function: notificaciones-ia
// ----------------------------------------------------------------------------
// Genera un mensaje motivador / penalizador / neutral por empleado activo
// a partir de su snapshot 7d (puntos, vacaciones, sábados, crédito).
// Pensada para ejecutarse 1 vez al día via cron (Supabase scheduler / pg_cron).
//
// Body (opcional): { force?: boolean }   — si true, ignora dedupe diaria
// Devuelve: { generadas: number, omitidas: number, errores: number, detalle: [...] }
// ----------------------------------------------------------------------------

const ANTHROPIC_URL  = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_KEY  = Deno.env.get('ANTHROPIC_API_KEY') || ''
const MODEL          = Deno.env.get('NOTIF_MODEL') || 'claude-haiku-4-5-20251001'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
}

const dbHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
}

function isServiceRequest(req: Request): boolean {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  try {
    const part = token.split('.')[1]
    if (!part) return false
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const pad = (4 - b64.length % 4) % 4
    const payload = JSON.parse(atob(b64 + '='.repeat(pad))) as { role?: string }
    return payload.role === 'service_role'
  } catch { return false }
}

type Empleado = { id: string; nombre: string; pack: number }
type Snapshot = {
  empleado: { id: string; nombre: string; pack: number; limite_credito_mensual: number; tarifa_sabado: number }
  puntos_7d: { pts_7d: number | null; dias_puntuados_7d: number; pts_puntualidad: number | null; pts_reparto: number | null; pts_responsabilidad: number | null }
  vacaciones_proximas_14d: number
  credito_gastado_mes: number
  sabados_trabajados_mes: number
}
type IADecision = {
  emit: boolean
  tono: 'motivar' | 'avisar' | 'neutral'
  titulo: string
  cuerpo: string
}

async function rpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: dbHeaders,
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`RPC ${name} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return await res.json() as T
}

async function existeNotifIaHoy(empleadoId: string): Promise<boolean> {
  const url = `${SUPABASE_URL}/rest/v1/notificaciones`
    + `?audience=eq.empleado&empleado_id=eq.${empleadoId}`
    + `&tipo=in.(motivacion_ia,penalizacion_ia,neutral_ia)`
    + `&created_at=gte.${new Date(new Date().setUTCHours(0,0,0,0)).toISOString()}`
    + `&select=id&limit=1`
  const res = await fetch(url, { headers: dbHeaders })
  if (!res.ok) return false
  const rows = await res.json() as unknown[]
  return rows.length > 0
}

async function decideMensaje(snapshot: Snapshot): Promise<IADecision> {
  const system = `Eres el asistente de RRHH de Frutas Abocados (distribución mayorista frutas/verduras en Málaga). Cada día revisas el desempeño reciente de un trabajador y decides si vale la pena enviarle un mensaje corto y personal. Tu tono es CERCANO, español de la calle, motivador o de toque amistoso (NO formal, NO corporativo). Trato de tú.

Reglas:
- Si los datos no merecen mensaje (sin actividad relevante / nada destacable), pon emit=false.
- Tono "motivar": cuando lleva >= 10 puntos en 7d con buena puntualidad.
- Tono "avisar": cuando lleva 0 puntos puntualidad, o gasta MUCHO crédito (> 80% del límite ya), o cero actividad puntuada.
- Tono "neutral": informativo sin juicio (ej. recordar vacaciones próximas).
- NO menciones cifras crudas a saco — habla como un compañero ("vas top esta semana", "ojo con las llegadas tarde").
- Cuerpo MAX 2 líneas, 200 caracteres total.
- Título MAX 50 caracteres, puede llevar 1 emoji al inicio.

Responde SOLO con JSON válido sin markdown:
{"emit": bool, "tono": "motivar"|"avisar"|"neutral", "titulo": "...", "cuerpo": "..."}`

  const userMsg = `Datos del trabajador (últimos 7 días + mes en curso):
${JSON.stringify(snapshot, null, 2)}

¿Le envías mensaje? Si sí, qué tono y qué texto. Responde con el JSON.`

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  })
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { content: Array<{ type: string; text?: string }> }
  const text = data.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('').trim()

  // Intentar parsear (a veces el modelo añade markdown a pesar de la instrucción)
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(cleaned) as IADecision
  } catch {
    return { emit: false, tono: 'neutral', titulo: '', cuerpo: '' }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  if (!isServiceRequest(req)) return json({ error: 'forbidden' }, 403)
  if (!ANTHROPIC_KEY) return json({ error: 'ANTHROPIC_API_KEY no configurada' }, 500)

  let body: { force?: boolean } = {}
  try { body = await req.json() } catch { /* ok */ }
  const force = !!body.force

  const empleados = await rpc<Empleado[]>('notif_empleados_activos')

  let generadas = 0, omitidas = 0, errores = 0
  const detalle: Array<{ empleado: string; estado: string; tono?: string }> = []

  for (const emp of empleados) {
    try {
      if (!force && await existeNotifIaHoy(emp.id)) {
        omitidas++
        detalle.push({ empleado: emp.nombre, estado: 'ya_emitida_hoy' })
        continue
      }
      const snap = await rpc<Snapshot>('notif_snapshot_empleado', { p_empleado_id: emp.id })
      const decision = await decideMensaje(snap)
      if (!decision.emit || !decision.titulo || !decision.cuerpo) {
        omitidas++
        detalle.push({ empleado: emp.nombre, estado: 'sin_mensaje', tono: decision.tono })
        continue
      }
      const tipo = decision.tono === 'motivar' ? 'motivacion_ia'
                 : decision.tono === 'avisar'  ? 'penalizacion_ia'
                 :                                'neutral_ia'
      await rpc('notif_emit', {
        p_audience: 'empleado',
        p_empleado_id: emp.id,
        p_tipo: tipo,
        p_titulo: decision.titulo.slice(0, 80),
        p_cuerpo: decision.cuerpo.slice(0, 280),
        p_payload: { tono: decision.tono, generado: 'ia' },
      })
      generadas++
      detalle.push({ empleado: emp.nombre, estado: 'emitida', tono: decision.tono })
    } catch (e) {
      errores++
      const msg = e instanceof Error ? e.message : String(e)
      detalle.push({ empleado: emp.nombre, estado: `error: ${msg.slice(0, 100)}` })
    }
  }

  // Purga de paso (no falla si no hay nada)
  try { await rpc<number>('notificaciones_purgar_antiguas') } catch { /* ignore */ }

  return json({ generadas, omitidas, errores, detalle })
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}
