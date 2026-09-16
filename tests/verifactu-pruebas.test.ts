import test from 'node:test'
import assert from 'node:assert/strict'
import { boundedText, endpoints, gateReasons, selfTest, sendSoap, sha256, soapEnvelope } from '../supabase/functions/verifactu-pruebas/transport.ts'

test('A9 defaults closed and each gate independently blocks', () => {
  assert.equal(gateReasons(false, undefined, undefined, undefined, true).length, 3)
  assert.equal(gateReasons(true, 'true', 'cert', 'key', true).length, 0)
  for (const args of [[false,'true','c','k',true], [true,'false','c','k',true], [true,'true',undefined,'k',true], [true,'true','c','k',false]] as const) {
    assert.ok(gateReasons(args[0], args[1], args[2], args[3], args[4]).length)
  }
})
test('SOAP wrapping preserves payload and rejects DTD and unrelated XML', () => {
  const payload = '<sum:RegFactuSistemaFacturacion xmlns:sum="urn:test">á &amp;</sum:RegFactuSistemaFacturacion>'
  assert.ok(soapEnvelope('<?xml version="1.0"?>\n' + payload).includes('<soapenv:Body>' + payload + '</soapenv:Body>'))
  assert.throws(() => soapEnvelope('<!DOCTYPE x><x/>'))
  assert.throws(() => soapEnvelope('<other/>'))
})
test('transport allowlists exact test URLs before any fetch', async () => {
  let calls = 0
  const fake: typeof fetch = async () => { calls++; return new Response('ok') }
  for (const target of ['https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP', endpoints.sello + '/evil', 'http://localhost']) {
    await assert.rejects(sendSoap(target, 'xml', fake))
  }
  assert.equal(calls, 0)
})
test('SOAP uses POST, empty action, bounded timeout and refuses redirects without retry', async () => {
  let calls = 0
  await assert.rejects(sendSoap(endpoints.sello, 'xml', async (_url, init) => {
    calls++
    assert.equal(init?.method, 'POST')
    assert.equal(init?.redirect, 'manual')
    assert.equal(new Headers(init?.headers).get('SOAPAction'), '""')
    assert.ok(init?.signal)
    return new Response(null, { status: 302, headers: { Location: 'https://example.com' } })
  }))
  assert.equal(calls, 1)
})
test('HTTP failure is retained; network failure is not retried', async () => {
  assert.deepEqual(await sendSoap(endpoints.representante, 'xml', async () => new Response('<Fault/>', {status:500})), { status:500, body:'<Fault/>' })
  let calls = 0
  await assert.rejects(sendSoap(endpoints.representante, 'xml', async () => { calls++; throw new Error('timeout') }))
  assert.equal(calls, 1)
})
test('response size limits use bytes and reject invalid UTF8', async () => {
  await assert.rejects(boundedText(new Response('áá'), 3))
  await assert.rejects(boundedText(new Response(new Uint8Array([255]))))
  assert.equal(await boundedText(new Response('á'), 2), 'á')
})
test('hash is exact UTF8 and selftest makes no real network request', async () => {
  assert.equal(await sha256('abc'), 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD')
  assert.deepEqual(await selfTest(), {ok:true, network_requests:0})
})
