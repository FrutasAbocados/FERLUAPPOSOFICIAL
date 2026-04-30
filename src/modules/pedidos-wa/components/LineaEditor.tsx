import { Gift, Trash2 } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'
import { UNIDAD_LABEL, type LineaParseada, type Unidad } from '../lib/types'
import { BadgeMetodo } from './BadgeMetodo'

const UNIDADES: Unidad[] = [
  'caja', 'caja_pequena', 'kg', 'saco', 'bolsa',
  'manojo', 'bandeja', 'lecho', 'carton', 'unidad',
]

type Props = {
  linea: LineaParseada
  onChange: (next: LineaParseada) => void
  onRemove: () => void
}

export function LineaEditor({ linea, onChange, onRemove }: Props) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-md)] border bg-[var(--color-surface)] p-2.5',
        linea.metodo === 'manual'
          ? 'border-amber-300 bg-amber-50/40'
          : 'border-[var(--color-border)]',
      )}
    >
      <div className="flex items-start gap-2">
        <Input
          inputMode="decimal"
          value={String(linea.cantidad)}
          onChange={(e) => {
            const next = parseFloat(e.target.value.replace(',', '.'))
            onChange({ ...linea, cantidad: Number.isFinite(next) ? next : 0 })
          }}
          className="h-9 w-16 text-center"
          aria-label="Cantidad"
        />

        <select
          value={linea.unidad}
          onChange={(e) => onChange({ ...linea, unidad: e.target.value as Unidad })}
          className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
          aria-label="Unidad"
        >
          {UNIDADES.map(u => (
            <option key={u} value={u}>{UNIDAD_LABEL[u]}</option>
          ))}
        </select>

        <Input
          value={linea.producto}
          onChange={(e) => onChange({ ...linea, producto: e.target.value })}
          className="h-9 min-w-0 flex-1"
          placeholder="Producto"
        />

        <button
          type="button"
          onClick={() => onChange({ ...linea, esGratis: !linea.esGratis })}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border transition-colors',
            linea.esGratis
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-[var(--color-border)] text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]',
          )}
          title={linea.esGratis ? 'Marcado como gratis' : 'Marcar gratis'}
          aria-pressed={linea.esGratis}
        >
          <Gift className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onRemove}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-ink-3)] transition-colors hover:bg-red-50 hover:text-red-600"
          title="Eliminar línea"
          aria-label="Eliminar línea"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-ink-3)]">
        <BadgeMetodo metodo={linea.metodo} />
        {linea.subseccion && (
          <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 font-semibold text-[var(--color-primary-2)]">
            {linea.subseccion}
          </span>
        )}
        <span className="truncate">
          raw: <span className="font-mono">{linea.productoRaw}</span>
        </span>
      </div>

      <Input
        value={linea.notas ?? ''}
        onChange={(e) => onChange({ ...linea, notas: e.target.value || null })}
        className="mt-1.5 h-8 text-xs"
        placeholder="Notas (opcional, ej. BUENO, o rosa?)"
      />
    </div>
  )
}
