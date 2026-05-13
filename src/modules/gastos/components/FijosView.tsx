import { useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { cn } from '@/shared/lib/utils'
import {
  type CalendarioRow,
  type Fijo,
  useCalendarioMes,
  useDesmarcarPagado,
  useFijos,
  useMarcarPagado,
} from '../lib/hooks'
import { CategoriaBadge } from './CategoriaPicker'
import { FijoModal } from './FijoModal'

type Props = {
  anio: number
  mes: number
  CalendarioComp: React.ComponentType<{ anio: number; mes: number; rows: CalendarioRow[]; onTogglePagado: (r: CalendarioRow) => void }>
}

export function FijosView({ anio, mes, CalendarioComp }: Props) {
  const { data: fijos = [], isLoading } = useFijos()
  const { data: cal = [] } = useCalendarioMes(anio, mes)
  const [editing, setEditing] = useState<Fijo | null | 'new'>(null)

  const calByFijo = useMemo(() => {
    const m = new Map<string, CalendarioRow>()
    for (const r of cal) m.set(r.fijo_id, r)
    return m
  }, [cal])

  const marcar    = useMarcarPagado()
  const desmarcar = useDesmarcarPagado()

  const onTogglePagado = async (row: CalendarioRow) => {
    try {
      if (row.pagado_at) {
        const ok = await confirm({
          title: `¿Desmarcar “${row.nombre}” como pagado?`,
          variant: 'danger',
          confirmLabel: 'Desmarcar',
        })
        if (!ok) return
        await desmarcar.mutateAsync({ fijo_id: row.fijo_id, anio, mes })
        toast({ title: 'Desmarcado', variant: 'success' })
      } else {
        await marcar.mutateAsync({ fijo_id: row.fijo_id, anio, mes })
        toast({ title: 'Marcado como pagado', variant: 'success' })
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'error' })
    }
  }

  const totalActivos = fijos.filter((f) => f.activo).length
  const totalImporteMes = useMemo(
    () => cal.reduce((acc, r) => acc + r.total, 0),
    [cal],
  )

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">Fijos</h2>
          <span className="text-xs text-[var(--color-ink-3)] tabular-nums">
            {totalActivos} activos · {euros(totalImporteMes)} mes total
          </span>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="mr-1 h-4 w-4" />
          Nuevo fijo
        </Button>
      </div>

      {/* Calendario visual */}
      <CalendarioComp anio={anio} mes={mes} rows={cal} onTogglePagado={onTogglePagado} />

      {/* Tabla */}
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Día</th>
                <th className="px-3 py-2 text-right">Importe</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Categoría</th>
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-3 py-2">Estado mes</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[var(--color-ink-3)]">Cargando…</td></tr>
              )}
              {!isLoading && fijos.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[var(--color-ink-3)]">
                    Sin fijos todavía. Crea el primero con “Nuevo fijo”.
                  </td>
                </tr>
              )}
              {fijos.map((f) => {
                const c = calByFijo.get(f.id)
                const total = Math.round(f.importe * (1 + f.iva_pct / 100) * 100) / 100
                return (
                  <tr key={f.id} className={cn('border-t border-[var(--color-border)]', !f.activo && 'opacity-50')}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-[var(--color-ink)]">{f.nombre}</div>
                      {f.notas && <div className="text-[11px] text-[var(--color-ink-3)]">{f.notas}</div>}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{f.dia_cargo}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{euros(f.importe)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{euros(total)}</td>
                    <td className="px-3 py-2">
                      <CategoriaBadge id={c?.categoria_id ?? f.categoria_id} color={c?.categoria_color} nombre={c?.categoria_nombre} />
                    </td>
                    <td className="px-3 py-2 text-[var(--color-ink-2)]">{c?.proveedor ?? '—'}</td>
                    <td className="px-3 py-2">{c ? <EstadoTag estado={c.estado} /> : <span className="text-[var(--color-ink-3)]">—</span>}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(f)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <FijoModal
          fijo={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function EstadoTag({ estado }: { estado: CalendarioRow['estado'] }) {
  const map: Record<CalendarioRow['estado'], string> = {
    pagado:  'bg-[#10b98122] text-[#047857]',
    vencido: 'bg-[#ef444422] text-[#b91c1c]',
    proximo: 'bg-[#f59e0b22] text-[#92400e]',
    futuro:  'bg-[var(--color-surface-2)] text-[var(--color-ink-2)]',
  }
  const label: Record<CalendarioRow['estado'], string> = {
    pagado: 'Pagado', vencido: 'Vencido', proximo: '≤7d', futuro: 'Futuro',
  }
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', map[estado])}>{label[estado]}</span>
}
