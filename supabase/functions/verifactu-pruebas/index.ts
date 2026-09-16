import { endpoints, gateReasons, selfTest, sendSoap, sha256, soapEnvelope } from './transport.ts'

const cors = {
  'Access-Control-Allow-Origin': 'https://abocadosos.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})
const url = Deno.env.get('SUPABASE_URL')!
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function rpc(name: string, args: unknown, authorization: string): Promise<unknown> {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: key, authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(args), signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('Operacion de base de datos bloqueada o no disponible')
  return response.json()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Metodo no permitido' }, 405)
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Autenticacion requerida' }, 401)
  try {
    // Validate the token with Auth, never trust decoded JWT claims or caller-supplied actor IDs.
    const auth = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, authorization }, signal: AbortSignal.timeout(10000),
    })
    if (!auth.ok) return json({ error: 'Sesion no valida' }, 401)
    if (await rpc('is_admin', {}, authorization) !== true) return json({ error: 'Solo administracion' }, 403)
    const text = await req.text()
    if (text.length > 2048) return json({ error: 'Peticion demasiado grande' }, 413)
    let input: { action?: string; xml_id?: number; confirmation?: string }
    try { input = JSON.parse(text) } catch { return json({ error: 'JSON no valido' }, 400) }
    const cert = Deno.env.get('AEAT_PRUEBAS_CERT_PEM')
    const privateKey = Deno.env.get('AEAT_PRUEBAS_KEY_PEM')
    const dbEnabled = await rpc('facturacion_verifactu_pruebas_habilitado', {}, authorization) === true
    const reasons = gateReasons(dbEnabled, Deno.env.get('AEAT_PRUEBAS_TRANSPORT_ENABLED'), cert, privateKey, typeof Deno.createHttpClient === 'function')
    const certType = Deno.env.get('AEAT_PRUEBAS_CERT_TYPE') ?? 'representante'
    if (certType !== 'representante' && certType !== 'sello') reasons.push('Tipo de certificado no valido')
    const endpoint = certType === 'sello' ? endpoints.sello : endpoints.representante
    if (input.action === 'status') return json({ enabled: reasons.length === 0, reasons, endpoint, environment: 'pruebas' })
    if (input.action === 'selftest') return json(await selfTest())
    if (input.action !== 'send' || !Number.isSafeInteger(input.xml_id) || Number(input.xml_id) <= 0 || input.confirmation !== 'ENVIAR SOLO A PRUEBAS AEAT') {
      return json({ error: 'Accion o confirmacion no valida' }, 400)
    }
    if (reasons.length) return json({ error: 'Envio bloqueado', reasons }, 409)
    // Read immutable XML using the user's RLS, not browser-provided content.
    const response = await fetch(`${url}/rest/v1/facturacion_verifactu_xml_simulaciones?id=eq.${input.xml_id}&select=xml_payload,xml_sha256`, {
      headers: { apikey: key, authorization }, signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error('XML no disponible')
    const rows = await response.json() as Array<{ xml_payload: string; xml_sha256: string }>
    const xml = rows[0]
    if (!xml || await sha256(xml.xml_payload) !== xml.xml_sha256) return json({ error: 'XML ausente o integridad incorrecta' }, 409)
    const body = soapEnvelope(xml.xml_payload)
    // Construct first: unsupported runtime / invalid PEM must not reserve or send anything.
    const client = Deno.createHttpClient({ cert: cert!, key: privateKey! })
    try {
      const attempt = await rpc('facturacion_verifactu_prueba_reservar', {
        p_xml_id: input.xml_id, p_endpoint: endpoint, p_soap_sha256: await sha256(body),
      }, authorization)
      let result: { status: number; body: string } | null = null
      try {
        result = await sendSoap(endpoint, body, (target, options) => fetch(target, { ...options, client }))
      } catch { /* No retries. TLS, timeout, oversized response and redirects are uncertain. */ }
      try {
        return json(await rpc('facturacion_verifactu_prueba_finalizar', {
          p_intento_id: attempt, p_http_status: result?.status ?? null, p_respuesta: result?.body ?? null,
        }, `Bearer ${key}`))
      } catch {
        return json({ error: 'Resultado incierto; intento registrado. No repetir el envio.', intento_id: attempt }, 503)
      }
    } finally { client.close() }
  } catch {
    // Never reflect certificate material, raw TLS exceptions, XML, tokens or DB internals.
    return json({ error: 'Operacion bloqueada o servicio no disponible. Consulte el historial antes de repetir.' }, 503)
  }
})
