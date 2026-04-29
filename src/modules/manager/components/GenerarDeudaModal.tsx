import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, HandCoins, Sparkles, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import type { FacturaListItem } from '../lib/types'

interface CobrosCliente {
  id: string
  nombre: string
  activo: boolean
}

const eur = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL', { locale: es })

const norm = (s: string) =>
  s.toLowerCase()
   .normalize('NFD').replace(/\p{Diacritic}/gu, '')
   .replace(/[(),.\-_]/g, ' ')
   .replace(/\s+/g, ' ')
   .trim()

function findBestMatch(nombreManager: string, clientes: CobrosCliente[]): CobrosCliente | null {
  const needle = norm(nombreManager)
  if (!needle) return null
  // 1. Match exacto normalizado
  const exact = clientes.find(c => norm(c.nombre) === needle)
  if (exact) return exact
  // 2. Substring en cualquier sentido
  const subs = clientes.filter(c => {
    const n = norm(c.nombre)
    return needle.includes(n) || n.includes(needle)
  })
  if (subs.length === 1) return subs[0]
  if (subs.length > 1) {
    // El más largo (más específico)
    return subs.sort((a, b) => norm(b.nombre).length - norm(a.nombre).length)[0]
  }
  // 3. Buscar palabras clave (>=4 chars) que coincidan
  const palabrasNeedle = needle.split(' ').filter(w => w.length >= 4)
  for (const pal of palabrasNeedle) {
    const m = clientes.find(c => norm(c.nombre).includes(pal))
    if (m) return m
  }
  return null
}

interface Mapping {
  facturaId: string
  cliente_id: string | null   // si es null, se crea nuevo
  nombreNuevo: string         // sugerido para crear
  incluir: boolean
}

interface Props {
  facturas: FacturaListItem[]
  onClose: () => void
  onSuccess: () => void
}

export function GenerarDeudaModal({ facturas, onClose, onSuccess }: Props) {
  const qc = useQueryClient()
  const clientesQ = useQuery({
    queryKey: ['cobros', 'clientes', 'all'] as const,
    queryFn: async (): Promise<CobrosCliente[]> => {
      const { data, error } = await supabase
        .from('cobros_clientes')
        .select('id, nombre, activo')
        .order('nombre')
      if (error) throw error
      return (data ?? []) as CobrosCliente[]
    },
  })
  const movsExistentesQ = useQuery({
    queryKey: ['cobros', 'movs-num', facturas.map(f => f.doc_number).filter(Boolean).sort().join(',')] as const,
    enabled: facturas.length > 0,
    queryFn: async (): Promise<Set<string>> => {
      const numeros = facturas.map(f => f.doc_number).filter((n): n is string => !!n)
      if (numeros.length === 0) return new Set()
      const { data, error } = await supabase
        .from('cobros_movimientos')
        .select('numero_factura')
        .in('numero_factura', numeros)
      if (error) throw error
      return new Set((data ?? []).map((r: { numero_factura: string | null }) => r.numero_factura).filter((n): n is string => !!n))
    },
  })

  const [mappings, setMappings] = useState<Mapping[]>([])

  // Inicializar mappings cuando los clientes carguen
  useEffect(() => {
    if (!clientesQ.data) return
    setMappings(facturas.map(f => {
      const nombreManager = f.contact_name_canon ?? '(sin contacto)'
      const match = findBestMatch(nombreManager, clientesQ.data!)
      return {
        facturaId: f.id,
        cliente_id: match?.id ?? null,
        nombreNuevo: match?.nombre ?? nombreManager,
        incluir: true,
      }
    }))
  }, [clientesQ.data, facturas])

  const generar = useMutation({
    mutationFn: async () => {
      const aProcesar = mappings.filter(m => m.incluir)
      // 1. Crear clientes nuevos (los que no tienen cliente_id)
      const nuevosNombres = Array.from(new Set(aProcesar.filter(m => m.cliente_id == null).map(m => m.nombreNuevo)))
      const idsCreados = new Map<string, string>()
      if (nuevosNombres.length > 0) {
        const inserts = nuevosNombres.map(nombre => ({ nombre, activo: true }))
        const { data, error } = await supabase
          .from('cobros_clientes')
          .insert(inserts)
          .select('id, nombre')
        if (error) throw error
        for (const r of (data ?? []) as { id: string; nombre: string }[]) idsCreados.set(r.nombre, r.id)
      }
      // 2. Insertar movimientos
      const movs = aProcesar.map(m => {
        const factura = facturas.find(f => f.id === m.facturaId)!
        const clienteId = m.cliente_id ?? idsCreados.get(m.nombreNuevo)
        if (!clienteId) throw new Error(`Sin cliente para ${factura.doc_number}`)
        return {
          cliente_id: clienteId,
          tipo: 'Factura' as const,
          numero_factura: factura.doc_number,
          fecha_factura: factura.fecha,
          importe: factura.total,
          pagado: false,
          concepto: `Importado desde Manager · ${factura.subtipo ?? ''}`,
        }
      })
      // Insertar de uno en uno para reportar errores individuales (UNIQUE puede fallar)
      const errores: Array<{ doc: string; msg: string }> = []
      let ok = 0
      for (const mov of movs) {
        const { error } = await supabase.from('cobros_movimientos').insert(mov)
        if (error) errores.push({ doc: mov.numero_factura ?? '?', msg: error.message })
        else ok++
      }
      return { ok, errores, nuevos: nuevosNombres.length }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cobros'] }),
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !generar.isPending) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, generar.isPending])

  const facsById = useMemo(() => new Map(facturas.map(f => [f.id, f])), [facturas])
  const totalIncluido = useMemo(() =>
    mappings.filter(m => m.incluir).reduce((s, m) => s + Number(facsById.get(m.facturaId)?.total ?? 0), 0),
    [mappings, facsById])
  const numIncluidas = mappings.filter(m => m.incluir).length
  const numNuevos = new Set(mappings.filter(m => m.incluir && m.cliente_id == null).map(m => m.nombreNuevo)).size

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 md:p-8"
      onClick={(e) => { if (e.target === e.currentTarget && !generar.isPending) onClose() }}
    >
      <div className="w-full max-w-4xl rounded-2xl bg-[var(--color-surface)] shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary-soft)]">
              <HandCoins className="h-5 w-5 text-[var(--color-primary-2)]" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">Generar deuda en Cobros</h2>
              <p className="text-xs text-[var(--color-ink-3)]">Revisa el cliente al que se vinculará cada factura. Marca/desmarca para excluir.</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={generar.isPending}><X className="h-4 w-4" /></Button>
        </div>

        {!generar.data && (
          <>
            <div className="px-5 py-3">
              {clientesQ.isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando clientes Cobros…</p>}
              {clientesQ.data && (
                <ul className="divide-y divide-[var(--color-border)]">
                  {mappings.map((m, i) => {
                    const f = facsById.get(m.facturaId)!
                    const yaExiste = movsExistentesQ.data?.has(f.doc_number ?? '')
                    return (
                      <li key={m.facturaId} className={`grid grid-cols-1 gap-2 py-2 md:grid-cols-[24px_1fr_1fr_auto] md:items-center ${!m.incluir || yaExiste ? 'opacity-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={m.incluir && !yaExiste}
                          disabled={yaExiste}
                          onChange={(e) => setMappings(prev => prev.map((mm, j) => j === i ? { ...mm, incluir: e.target.checked } : mm))}
                          className="h-4 w-4"
                        />
                        <div className="min-w-0 text-sm">
                          <div className="truncate text-[var(--color-ink)]">{f.doc_number ?? '—'} · {fmt(f.fecha)}</div>
                          <div className="truncate text-xs text-[var(--color-ink-3)]">{f.contact_name_canon}</div>
                          {yaExiste && <div className="text-xs text-amber-700">⚠️ ya existe en Cobros</div>}
                        </div>
                        <div className="min-w-0">
                          <select
                            value={m.cliente_id ?? '__nuevo__'}
                            onChange={(e) => {
                              const v = e.target.value
                              setMappings(prev => prev.map((mm, j) => j === i ? {
                                ...mm,
                                cliente_id: v === '__nuevo__' ? null : v,
                              } : mm))
                            }}
                            className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
                          >
                            <option value="__nuevo__">+ Crear nuevo: {m.nombreNuevo}</option>
                            {clientesQ.data!.map(c => (
                              <option key={c.id} value={c.id}>{c.nombre}{!c.activo ? ' (inactivo)' : ''}</option>
                            ))}
                          </select>
                          {m.cliente_id == null && (
                            <Input
                              value={m.nombreNuevo}
                              onChange={(e) => setMappings(prev => prev.map((mm, j) => j === i ? { ...mm, nombreNuevo: e.target.value } : mm))}
                              className="mt-1 h-8 text-xs"
                              placeholder="Nombre cliente nuevo"
                            />
                          )}
                        </div>
                        <div className="text-right text-sm font-medium tabular-nums text-[var(--color-ink)]">{eur(f.total)}</div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-b-2xl border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3">
              <div className="text-xs text-[var(--color-ink-3)]">
                <span className="font-medium text-[var(--color-ink)]">{numIncluidas} factura(s)</span>
                {numNuevos > 0 && <span> · {numNuevos} cliente(s) nuevo(s)</span>}
                <span className="ml-2 font-medium tabular-nums text-emerald-700">{eur(totalIncluido)}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={generar.isPending}>Cancelar</Button>
                <Button onClick={() => generar.mutate()} disabled={generar.isPending || numIncluidas === 0}>
                  <Sparkles className="mr-1 h-4 w-4" /> {generar.isPending ? 'Generando…' : 'Generar deuda'}
                </Button>
              </div>
            </div>
          </>
        )}

        {generar.data && (
          <div className="px-5 py-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-7 w-7 text-emerald-700" />
            </div>
            <h3 className="font-display text-xl font-bold text-[var(--color-ink)]">¡Hecho!</h3>
            <p className="mt-1 text-sm text-[var(--color-ink-2)]">
              {generar.data.ok} movimiento(s) creado(s) en Cobros.
              {generar.data.nuevos > 0 && <> · {generar.data.nuevos} cliente(s) nuevo(s).</>}
            </p>
            {generar.data.errores.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-left text-xs">
                <div className="mb-1 font-semibold text-amber-800">{generar.data.errores.length} error(es):</div>
                <ul className="space-y-0.5 text-amber-900">
                  {generar.data.errores.map((e, i) => (
                    <li key={i}>· <strong>{e.doc}</strong>: {e.msg}</li>
                  ))}
                </ul>
              </div>
            )}
            <Button className="mt-4" onClick={() => { onSuccess(); onClose() }}>Cerrar</Button>
          </div>
        )}
      </div>
    </div>
  )
}
