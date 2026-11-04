import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../supabase/functions/pedido-a-holded/index.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText

async function invoke(mode: string, dryRun = false) {
  let handler!: (req: Request) => Promise<Response>
  const logs: Array<{ ok: boolean; error_msg?: string; status: number }> = []
  const holdedCalls: Array<{ method: string; body: Record<string, unknown> | null }> = []
  const token = `e30.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.test`
  const mockFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const payload = init?.body ? JSON.parse(String(init.body)) : null
    if (url.hostname === 'api.holded.com') {
      holdedCalls.push({ method: init?.method ?? 'GET', body: payload })
      return Response.json(init?.method === 'POST' ? { id: 'holded-1', docNumber: 'F100' } : [{ docNumber: 'F99' }])
    }
    if (url.pathname.endsWith('/pedidos_wa_holded_log')) {
      logs.push(payload)
      return new Response(null, { status: 201 })
    }
    if (url.pathname.endsWith('/pedidos_wa_resolver_completo')) {
      if (mode === 'network') throw new Error('connection reset')
      if (mode === 'timeout') return Response.json({ code: '57014', message: 'canceling statement due to statement timeout' }, { status: 500 })
      return Response.json(mode === 'empty' ? [] : [{ linea_id: 'l1', orden: 1, producto_normalizado: 'tomate', cantidad: 2, unidad: 'kg', es_gratis: false, iva_pct: 4, precio_resuelto: 3, precio_fuente: 'historico_cliente', total_estimado: 6 }])
    }
    assert.ok(url.pathname.endsWith('/pedidos_wa'))
    if (init?.method === 'PATCH') return new Response(null, { status: 204 })
    if (url.searchParams.has('cliente_id')) return Response.json([])
    return Response.json([{ id: 'p1', cliente_id: 'c1', fecha: '2026-11-04', estado: 'confirmado', holded_invoice_id: mode === 'already' ? 'existing-1' : null, holded_invoice_num: null, holded_invoice_doc_type: 'invoice', cliente: { id: 'c1', nombre: 'Cliente de prueba', holded_contact_id: 'contact-1', tipo_factura: 'HOLDED', holded_doc_type: 'invoice' } }])
  }
  runInNewContext(compiled, {
    Deno: { env: { get: (name: string) => name === 'SUPABASE_URL' ? 'https://test.supabase.co' : name === 'SUPABASE_SERVICE_ROLE_KEY' ? token : name === 'HOLDED_API_KEY' ? 'test-key' : '' }, serve: (fn: typeof handler) => { handler = fn } },
    fetch: mockFetch, Request, Response, atob, crypto, console,
  })
  const response = await handler(new Request('https://test.supabase.co/functions/v1/pedido-a-holded', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ pedido_id: 'p1', auto: true, dry_run: dryRun }),
  }))
  const body = await response.json() as { ok?: boolean; already?: boolean; dry_run?: boolean; summary: { total_estimado: number } }
  return { response, body, logs, holdedCalls }
}

test('un timeout de precios queda registrado y no envía nada a Holded', async () => {
  const r = await invoke('timeout')
  assert.equal(r.response.status, 500)
  assert.equal(r.logs.length, 1)
  assert.equal(r.logs[0].ok, false)
  assert.match(r.logs[0].error_msg!, /statement timeout/)
  assert.equal(r.holdedCalls.length, 0)
})

test('un corte de red al resolver precios también queda visible', async () => {
  const r = await invoke('network')
  assert.equal(r.response.status, 502)
  assert.match(r.logs[0].error_msg!, /connection reset/)
  assert.equal(r.holdedCalls.length, 0)
})

test('un pedido sin líneas queda registrado sin enviar documentos', async () => {
  const r = await invoke('empty')
  assert.equal(r.response.status, 422)
  assert.equal(r.logs[0].error_msg, 'pedido sin líneas')
  assert.equal(r.holdedCalls.length, 0)
})

test('la vista previa de factura no consulta ni modifica Holded', async () => {
  const r = await invoke('ok', true)
  assert.equal(r.body.dry_run, true)
  assert.equal(r.body.summary.total_estimado, 6)
  assert.equal(r.holdedCalls.length, 0)
  assert.equal(r.logs.length, 0)
})

test('la subida mantiene precio unitario, contacto fiscal y numeración existentes', async () => {
  const r = await invoke('ok')
  assert.equal(r.body.ok, true)
  const body = r.holdedCalls.find(c => c.method === 'POST')!.body!
  assert.equal(body.numFactura, 'F100')
  assert.equal(body.contactId, 'contact-1')
  assert.equal('contactName' in body, false)
  assert.equal(body.approveDoc, 0)
  assert.equal((body.items as Array<{ subtotal: number }>)[0].subtotal, 3)
  assert.equal(r.logs[0].ok, true)
})

test('un pedido ya subido no vuelve a crear documento', async () => {
  const r = await invoke('already')
  assert.equal(r.body.already, true)
  assert.equal(r.holdedCalls.length, 0)
})
