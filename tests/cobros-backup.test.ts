import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../supabase/functions/cobros-backup-diario/index.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
const clientes = [{ id: 'cliente-1' }, { id: 'cliente-2' }]
const movimientos = Array.from({ length: 2897 }, (_, i) => ({ id: `mov-${String(i).padStart(5, '0')}`, cliente_id: 'cliente-1', importe: 1 }))

async function backup(mode = 'ok', cap = 500) {
  let handler: (req: Request) => Promise<Response> = async () => { throw new Error('Sin handler') }
  let stored: { counts: { clientes: number; movimientos: number }; movimientos: typeof movimientos } | null = null
  const logs: Array<{ ok: boolean; num_movimientos?: number }> = []
  const offsets: number[] = []
  const token = `e30.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.test`
  const mockFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname.startsWith('/storage/v1/object/cobros-backups/')) {
      stored = JSON.parse(String(init?.body))
      return new Response('{}')
    }
    const table = url.pathname.split('/').pop()
    if (table === 'cobros_backups_log') {
      logs.push(JSON.parse(String(init?.body)))
      return new Response(null, { status: 201 })
    }
    assert.ok(table === 'cobros_clientes' || table === 'cobros_movimientos')
    assert.equal(new Headers(init?.headers).get('prefer'), 'count=exact')
    const all = table === 'cobros_clientes' ? clientes : movimientos
    if (init?.method === 'HEAD') {
      const count = all.length + (mode === 'changed-after-read' ? 1 : 0)
      return new Response(null, { headers: { 'Content-Range': `*/${count}` } })
    }
    assert.equal(url.searchParams.get('order'), 'id.asc')
    const from = Number(url.searchParams.get('offset'))
    const limit = Math.min(Number(url.searchParams.get('limit')), cap)
    if (table === 'cobros_movimientos') offsets.push(from)
    if (mode === 'http-error' && from >= 1000) return new Response('fallo', { status: 503 })
    const page = mode === 'truncated' && from >= 1000 ? [] : all.slice(from, from + limit)
    if (mode === 'duplicate' && from > 0 && page.length) page[0] = all[0]
    const count = all.length + (mode === 'changed-during-read' && from > 0 ? 1 : 0)
    const range = page.length ? `${from}-${from + page.length - 1}/${count}` : `*/${count}`
    return new Response(JSON.stringify(page), {
      headers: mode === 'missing-count' ? {} : { 'Content-Range': range },
    })
  }
  runInNewContext(compiled, {
    Deno: { env: { get: (name: string) => name === 'SUPABASE_URL' ? 'https://test.supabase.co' : token }, serve: (fn: typeof handler) => { handler = fn } },
    fetch: mockFetch, Request, Response, TextEncoder, atob,
  })
  const response = await handler(new Request('https://test.supabase.co/functions/v1/cobros-backup-diario', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ trigger: 'manual' }),
  }))
  return { response, stored, logs, offsets }
}

test('el backup real guarda y verifica todos los movimientos antes de marcar OK', async () => {
  const result = await backup()
  assert.equal(result.response.status, 200)
  const body = await result.response.json() as { num_movimientos: number }
  assert.equal(body.num_movimientos, 2897)
  // La escritura ocurre dentro del handler aislado.
  const stored = result.stored as unknown as { counts: { clientes: number; movimientos: number }; movimientos: typeof movimientos }
  assert.equal(stored.counts.clientes, 2)
  assert.equal(stored.counts.movimientos, 2897)
  assert.deepEqual(stored.movimientos, movimientos)
  assert.deepEqual(result.offsets, [0, 500, 1000, 1500, 2000, 2500])
  assert.deepEqual(result.logs.map((log) => log.ok), [true])
})

test('el backup tolera un límite servidor inferior al tamaño solicitado', async () => {
  const result = await backup('ok', 100)
  assert.equal(result.response.status, 200)
  assert.equal((await result.response.json() as { num_movimientos: number }).num_movimientos, 2897)
})

for (const mode of ['http-error', 'truncated', 'duplicate', 'missing-count', 'changed-during-read', 'changed-after-read']) {
  test(`backup ${mode}: no sube una copia parcial ni registra éxito`, async () => {
    const result = await backup(mode)
    assert.equal(result.response.status, 500)
    assert.equal(result.stored, null)
    assert.deepEqual(result.logs.map((log) => log.ok), [false])
    assert.equal((await result.response.json() as { ok: boolean }).ok, false)
  })
}
