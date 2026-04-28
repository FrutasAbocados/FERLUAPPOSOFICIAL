import { useMemo } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { useClientes, useMovimientos } from '../lib/queries'
import { eur, estadoMovimiento, importePendiente } from '../lib/utils'
import type { Movimiento } from '../lib/types'

type Bucket = 'Pizarra' | 'Vencido' | 'Próximo' | 'Pendiente'

const BUCKETS: { key: Bucket; label: string; tone: string }[] = [
  { key: 'Pizarra', label: 'Pizarra', tone: 'border-purple-300 bg-purple-50' },
  { key: 'Vencido', label: 'Vencido', tone: 'border-red-300 bg-red-50' },
  { key: 'Próximo', label: 'Próximo (≤7d)', tone: 'border-amber-300 bg-amber-50' },
  { key: 'Pendiente', label: 'Pendiente', tone: 'border-emerald-300 bg-emerald-50' },
]

type Props = {
  onCobrar: (movimientoId: string) => void
  onVerCliente: (clienteId: string) => void
}

export function Tablero({ onCobrar, onVerCliente }: Props) {
  const movs = useMovimientos()
  const clientes = useClientes()

  const grouped = useMemo(() => {
    const groups: Record<Bucket, Movimiento[]> = {
      Pizarra: [],
      Vencido: [],
      Próximo: [],
      Pendiente: [],
    }
    for (const m of movs.data ?? []) {
      if (m.pagado) continue
      if (m.tipo === 'Pizarra') {
        groups.Pizarra.push(m)
        continue
      }
      const e = estadoMovimiento(m)
      if (e === 'Vencido') groups.Vencido.push(m)
      else if (e === 'Próximo') groups.Próximo.push(m)
      else groups.Pendiente.push(m)
    }
    // ordenar cada bucket por más antiguo primero
    for (const k of Object.keys(groups) as Bucket[]) {
      groups[k].sort((a, b) => a.fecha_factura.localeCompare(b.fecha_factura))
    }
    return groups
  }, [movs.data])

  const nombrePorId = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of clientes.data ?? []) m.set(c.id, c.nombre)
    return m
  }, [clientes.data])

  if (movs.isLoading || clientes.isLoading) {
    return <div className="p-6 text-sm text-[var(--color-ink-3)]">Cargando…</div>
  }

  return (
    <div className="grid gap-3 lg:grid-cols-4">
      {BUCKETS.map(({ key, label, tone }) => {
        const items = grouped[key]
        const total = items.reduce((s, m) => s + importePendiente(m), 0)
        return (
          <div key={key} className={`rounded-[var(--radius-md)] border ${tone} p-3`}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-2)]">
                {label}
              </h3>
              <span className="text-xs font-semibold text-[var(--color-ink)]">
                {items.length} · {eur(total)}
              </span>
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                <p className="px-1 text-[11px] text-[var(--color-ink-3)]">Vacío</p>
              ) : (
                items.map((m) => {
                  const dias = differenceInCalendarDays(new Date(), parseISO(m.fecha_factura))
                  return (
                    <Card key={m.id} className="bg-white p-3 shadow-sm">
                      <button
                        onClick={() => onVerCliente(m.cliente_id)}
                        className="block w-full text-left text-sm font-semibold text-[var(--color-ink)] hover:text-[var(--color-primary)]"
                      >
                        {nombrePorId.get(m.cliente_id) ?? '—'}
                      </button>
                      <div className="mt-1 flex items-center justify-between text-xs text-[var(--color-ink-2)]">
                        <span>
                          {m.numero_factura ?? (m.tipo === 'Pizarra' ? 'Pizarra' : '—')}
                        </span>
                        <span>{dias}d</span>
                      </div>
                      {m.concepto && (
                        <div className="mt-1 truncate text-[11px] text-[var(--color-ink-3)]">
                          {m.concepto}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-display text-base font-bold text-[var(--color-ink)]">
                          {eur(importePendiente(m))}
                        </span>
                        <Button size="sm" onClick={() => onCobrar(m.id)}>
                          Cobrar
                        </Button>
                      </div>
                    </Card>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
