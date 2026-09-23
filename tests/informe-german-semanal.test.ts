import test from 'node:test';
import assert from 'node:assert/strict';
import { crearHandler, horario, mensaje } from '../supabase/functions/informe-german-semanal/index.ts';

const key = 'test-service-key';
const now = new Date('2026-09-27T18:00:00Z');
const clientes = ['Alma 1', 'Alma 2', 'Family', 'La Ranita', 'Bar Betis'].map(nombre => ({
  nombre, semana: 100, anterior: 80, mes: 300, documentos: 2,
  comision_semana: 5, comision_mes: 15, ultima_venta: '2026-09-26',
}));
const informe = {
  fecha: '2026-09-27', inicio: '2026-09-21', mes_inicio: '2026-09-01',
  generado_at: '2026-09-27T18:00:00Z', ultima_sync: '2026-09-27T17:30:00Z', comision_pct: 5,
  clientes, total_semana: 500, total_anterior: 400, total_mes: 1500,
  comision_semana: 25, comision_mes: 75,
  documentos: [{ cliente: 'Alma 1', fecha: '2026-09-26', numero: 'F-1', tipo: 'invoice', subtotal: 100, comision: 5 }],
};
function req(body: object, token = key) {
  return new Request('https://example.test', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
}
function harness(options: { missingKey?: boolean; stale?: boolean; duplicate?: boolean; timeout?: boolean; reply?: string; uploadFails?: boolean } = {}) {
  const calls: string[] = [];
  const patches: string[] = [];
  const pdfCalls: unknown[] = [];
  const http: typeof fetch = async (input, init) => {
    const url = String(input); calls.push(url);
    // El enlace del PDF viaja dentro de la URL del proveedor: distinguir por origen, no por substring.
    if (new URL(url).host === 'db.test' && new Headers(init?.headers).get('authorization') !== `Bearer ${key}`) return new Response(null, { status: 401 });
    if (url.endsWith('/rpc/informe_german_semanal')) return Response.json({ ...informe, ultima_sync: options.stale ? '2026-09-26T12:00:00Z' : informe.ultima_sync });
    if (url.endsWith('/rpc/informe_german_callmebot_config')) return Response.json({ phone: '+34690712449', apikey: options.missingKey ? null : 'test-provider-key' });
    if (url.endsWith('/informe_german_envios')) return new Response(null, { status: options.duplicate ? 409 : 201 });
    if (url.includes('/storage/v1/object/')) return new Response(null, { status: options.uploadFails ? 500 : 200 });
    if (url.endsWith('/informe_margen_links')) return new Response(null, { status: 201 });
    if (url.includes('api.callmebot.com')) {
      if (options.timeout) throw new Error('timeout with secret URL');
      return new Response(options.reply ?? 'Message queued.');
    }
    if (init?.method === 'PATCH') { patches.push(String(init.body)); return new Response(null, { status: 204 }); }
    throw new Error('unexpected request');
  };
  const pdf = async (inf: unknown) => { pdfCalls.push(inf); return new Uint8Array([37, 80, 68, 70]); };
  return { calls, patches, pdfCalls, handler: crearHandler('https://db.test', key, http, () => now, pdf as never) };
}
type Resultado = { enviado: boolean; informe: { comision_semana: number }; link: string; storage_path: string; mensaje: string };
const subidas = (calls: string[]) => calls.filter(u => u.includes('/storage/v1/object/'));
const proveedor = (calls: string[]) => calls.filter(u => u.includes('callmebot.com'));

test('20h Madrid remains correct over both DST transitions', () => {
  for (const date of ['2026-03-22T19:00:00Z', '2026-03-29T18:00:00Z', '2026-10-18T18:00:00Z', '2026-10-25T19:00:00Z']) {
    assert.equal(horario(new Date(date)).permitido, true, date);
  }
  for (const date of ['2026-09-27T19:00:00Z', '2026-10-25T18:00:00Z', '2026-09-26T18:00:00Z']) {
    assert.equal(horario(new Date(date)).permitido, false, date);
  }
});
test('message is a title, the week and the link, and never leaks report figures', () => {
  const text = mensaje('https://db.test/functions/v1/informe-german-pdf?t=abc', informe);
  assert.ok(text.includes('https://db.test/functions/v1/informe-german-pdf?t=abc'));
  assert.ok(text.startsWith('*'));
  assert.ok(text.includes('21') && text.includes('27'));
  assert.ok(!text.includes('500') && !text.includes('25,00'));
  assert.ok(text.split('\n').length <= 3);
});
test('preview returns the report without building a PDF or claiming the week', async () => {
  const h = harness();
  const response = await h.handler(req({ fecha: '2026-09-27' }));
  assert.equal(response.status, 200);
  const result = await response.json() as Resultado;
  assert.equal(result.enviado, false);
  assert.equal(result.informe.comision_semana, 25);
  assert.equal(h.pdfCalls.length, 0);
  assert.equal(h.calls.length, 1);
});
test('publish builds the PDF and the private link without contacting the provider', async () => {
  const h = harness();
  const response = await h.handler(req({ fecha: '2026-09-27', publish: true }));
  assert.equal(response.status, 200);
  const result = await response.json() as Resultado;
  assert.equal(result.enviado, false);
  assert.ok(result.link.includes('informe-german-pdf?t='));
  assert.match(result.storage_path, /^german\/2026-09-27\/[a-f0-9]{32}\.pdf$/);
  assert.ok(result.mensaje.includes(result.link));
  assert.equal(h.pdfCalls.length, 1);
  assert.equal(subidas(h.calls).length, 1);
  assert.equal(proveedor(h.calls).length, 0);
  assert.equal(h.calls.filter(u => u.endsWith('/informe_german_envios')).length, 0);
});
test('forged token is forwarded to database verification and cannot read or send report', async () => {
  const h = harness();
  assert.equal((await h.handler(req({ send: true }, 'forged-jwt'))).status, 401);
  assert.equal(h.calls.length, 1);
  assert.ok(h.calls[0].endsWith('/rpc/informe_german_semanal'));
});
test('invalid or future dates and out-of-window sends are rejected before data access', async () => {
  const h = harness();
  for (const fecha of ['2026-02-30', '2026-09-28', 'invalid']) assert.equal((await h.handler(req({ fecha }))).status, 400);
  assert.equal((await h.handler(req({ fecha: '2026-09-20', send: true }))).status, 409);
  assert.equal(h.calls.length, 0);
});
test('a past date is previewable but never sendable', async () => {
  const h = harness();
  assert.equal((await h.handler(req({ fecha: '2026-09-22' }))).status, 200);
  assert.equal((await h.handler(req({ fecha: '2026-09-22', send: true }))).status, 409);
  assert.equal(proveedor(h.calls).length, 0);
});
test('missing recipient activation or stale sync never claims, builds or sends', async () => {
  for (const options of [{ missingKey: true }, { stale: true }]) {
    const h = harness(options);
    assert.equal((await h.handler(req({ send: true }))).status, 409);
    assert.ok(h.calls.every(url => url.includes('/rpc/')));
    assert.equal(h.pdfCalls.length, 0);
  }
});
test('duplicate claim never builds a PDF nor contacts the provider', async () => {
  const h = harness({ duplicate: true });
  assert.equal((await h.handler(req({ send: true }))).status, 200);
  assert.equal(h.pdfCalls.length, 0);
  assert.equal(proveedor(h.calls).length, 0);
});
test('accepted request uses the correct phone and sends only the title and the link', async () => {
  const h = harness();
  assert.equal((await h.handler(req({ send: true }))).status, 200);
  const sent = new URL(proveedor(h.calls)[0]);
  assert.equal(sent.searchParams.get('phone'), '+34690712449');
  const text = sent.searchParams.get('text')!;
  assert.ok(text.includes('informe-german-pdf?t='));
  assert.equal(text.split('\n').length <= 3, true);
  const patch = JSON.parse(h.patches[0]);
  assert.equal(patch.estado, 'aceptado');
  assert.match(patch.storage_path, /^german\/2026-09-27\/[a-f0-9]{32}\.pdf$/);
});
test('a failed upload after the claim is recorded as uncertain and never sent', async () => {
  const h = harness({ uploadFails: true });
  assert.equal((await h.handler(req({ send: true }))).status, 500);
  assert.equal(JSON.parse(h.patches[0]).estado, 'incierto');
  assert.equal(proveedor(h.calls).length, 0);
});
test('HTTP 200 rejection and ambiguous responses are not reported as accepted', async () => {
  for (const [reply, estado] of [['Error: message not sent', 'rechazado'], ['Unknown response', 'incierto']]) {
    const h = harness({ reply });
    assert.equal((await h.handler(req({ send: true }))).status, 502);
    assert.equal(JSON.parse(h.patches[0]).estado, estado);
  }
});
test('timeout records uncertainty without exposing secrets or retrying', async () => {
  const h = harness({ timeout: true });
  const response = await h.handler(req({ send: true }));
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes('secret'));
  assert.equal(JSON.parse(h.patches[0]).estado, 'incierto');
  assert.equal(proveedor(h.calls).length, 1);
});
