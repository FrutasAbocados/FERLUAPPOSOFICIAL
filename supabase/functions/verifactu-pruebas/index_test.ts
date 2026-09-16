import { endpoints, sha256 } from './transport.ts'

const originalFetch = globalThis.fetch
const originalServe = Deno.serve
const originalClient = Deno.createHttpClient
let handler: (req: Request) => Promise<Response>
let admin = true
let validAuth = true
let enabled = false
let calls: string[] = []
let reserved = false
let finalized = false
let soapStatus = 200
const payload = '<sum:RegFactuSistemaFacturacion xmlns:sum="urn:fixture"/>'
const hash = await sha256(payload)
Deno.env.set('SUPABASE_URL', 'https://fixture.supabase.co')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fixture-key')
Deno.env.delete('AEAT_PRUEBAS_TRANSPORT_ENABLED')
Deno.env.delete('AEAT_PRUEBAS_CERT_PEM')
Deno.env.delete('AEAT_PRUEBAS_KEY_PEM')
Object.defineProperty(Deno, 'serve', { value: (callback: typeof handler) => { handler = callback } })
Object.defineProperty(Deno, 'createHttpClient', { value: () => ({ close() {} }) })
globalThis.fetch = async (input, init) => {
  const target = String(input)
  calls.push(target)
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
  if (target.endsWith('/auth/v1/user')) return json({ id: 'fixture' }, validAuth ? 200 : 401)
  if (target.endsWith('/rpc/is_admin')) return json(admin)
  if (target.endsWith('/rpc/facturacion_verifactu_pruebas_habilitado')) return json(enabled)
  if (target.includes('/facturacion_verifactu_xml_simulaciones?')) return json([{xml_payload:payload, xml_sha256:hash}])
  if (target.endsWith('/rpc/facturacion_verifactu_prueba_reservar')) { reserved = true; return json('00000000-0000-0000-0000-000000000009') }
  if (target.endsWith('/rpc/facturacion_verifactu_prueba_finalizar')) {
    finalized = true
    const args = JSON.parse(String(init?.body))
    if (soapStatus === 0 && args.p_http_status !== null) throw new Error('Timeout must remain uncertain')
    return json({ estado: 'incierto' })
  }
  if (target === endpoints.representante) {
    if (!reserved) throw new Error('No reservation before network')
    if (soapStatus === 0) throw new Error('fixture timeout')
    return new Response('<fixture/>', {status:soapStatus})
  }
  throw new Error('Unexpected network target')
}
await import('./index.ts')
const assert = (value: unknown, label: string) => { if (!value) throw new Error(label) }
const request = (action: string, token = 'fixture') => handler(new Request('https://edge.test', {
  method:'POST', headers: token ? {Authorization:`Bearer ${token}`} : {},
  body:JSON.stringify({action, xml_id:1, confirmation:'ENVIAR SOLO A PRUEBAS AEAT'}),
}))

Deno.test('Edge authentication, gates, selftest, reservation and uncertain timeout (no network)', async () => {
  try {
    assert((await request('status','')).status === 401, 'missing auth')
    validAuth = false
    assert((await request('status')).status === 401, 'invalid token')
    validAuth = true; admin = false
    assert((await request('status')).status === 403, 'non-admin')
    admin = true
    const status = await (await request('status')).json()
    assert(status.enabled === false && status.reasons.length === 3, 'closed defaults')
    assert((await request('send')).status === 409, 'send blocked')
    assert(!reserved && !calls.includes(endpoints.representante), 'no reserve or AEAT call while blocked')
    const selftest = await (await request('selftest')).json()
    assert(selftest.ok && selftest.network_requests === 0, 'offline selftest')
    Deno.env.set('AEAT_PRUEBAS_TRANSPORT_ENABLED','true')
    Deno.env.set('AEAT_PRUEBAS_CERT_PEM','fixture'); Deno.env.set('AEAT_PRUEBAS_KEY_PEM','fixture')
    assert((await request('send')).status === 409, 'DB gate independent of backend gate')
    enabled = true; soapStatus = 0; calls = []
    const result = await (await request('send')).json()
    assert(result.estado === 'incierto' && reserved && finalized, 'timeout persisted')
    assert(calls.filter(u => u === endpoints.representante).length === 1,'never retry')
  } finally {
    globalThis.fetch = originalFetch
    Object.defineProperty(Deno,'serve',{value:originalServe})
    Object.defineProperty(Deno,'createHttpClient',{value:originalClient})
  }
})
