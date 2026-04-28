import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import type { Period } from '../lib/period'
import { useAbuelo, useAddAbuelo, useDeleteAbuelo } from '../lib/queries'

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL yyyy', { locale: es })

interface Props {
  period: Period
}

export function AbueloView({ period }: Props) {
  const { data, isLoading } = useAbuelo(period)
  const add = useAddAbuelo()
  const del = useDeleteAbuelo()

  const today = format(new Date(), 'yyyy-MM-dd')
  const [fecha, setFecha] = useState(today)
  const [importe, setImporte] = useState('')
  const [nota, setNota] = useState('')

  const total = useMemo(() => (data ?? []).reduce((s, r) => s + Number(r.importe ?? 0), 0), [data])

  const submit = async () => {
    const v = Number(importe.replace(',', '.'))
    if (!fecha || !Number.isFinite(v) || v === 0) return
    try {
      await add.mutateAsync({ fecha, importe: v, nota: nota.trim() || null })
      setImporte('')
      setNota('')
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : 'No se pudo guardar'}`)
    }
  }

  return (
    <div className="space-y-3">
      <header className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">Frutería propia (El Abuelo)</h2>
        <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
          Ventas que no pasan por Holded. Se suman aparte para análisis interno.
        </p>
      </header>

      {/* Form */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">Añadir venta</h3>
        <div className="mt-2 grid gap-2 md:grid-cols-[160px_140px_1fr_auto]">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Fecha</label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Importe €</label>
            <Input
              type="number" step="0.01" placeholder="0.00"
              value={importe} onChange={(e) => setImporte(e.target.value)}
              className="h-9 tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Nota (opcional)</label>
            <Input
              value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="ej. cierre lunes 28-abr"
              className="h-9"
            />
          </div>
          <div className="flex items-end">
            <Button size="sm" onClick={submit} disabled={!importe || add.isPending}>
              {add.isPending ? 'Guardando…' : 'Añadir'}
            </Button>
          </div>
        </div>
      </section>

      {/* Lista + total */}
      <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">Ventas del periodo</h3>
          <span className="text-sm font-medium tabular-nums text-emerald-700">Total: {eur(total)}</span>
        </div>
        {isLoading && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {data?.length === 0 && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Sin ventas en este periodo</p>}
        <ul className="divide-y divide-[var(--color-border)]">
          {data?.map(r => (
            <li key={r.id} className="grid grid-cols-[100px_1fr_auto_auto] items-center gap-3 px-4 py-2 text-sm">
              <span className="text-[var(--color-ink-3)]">{fmt(r.fecha)}</span>
              <span className="truncate text-[var(--color-ink)]">{r.nota ?? '—'}</span>
              <span className="font-medium tabular-nums text-[var(--color-ink)]">{eur(Number(r.importe))}</span>
              <Button size="sm" variant="ghost" onClick={() => del.mutate(r.id)} disabled={del.isPending} title="Eliminar">
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
