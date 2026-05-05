import { useCategorias } from '../lib/hooks'

type Props = {
  value: string | null
  onChange: (id: string | null) => void
  allowEmpty?: boolean
  emptyLabel?: string
  className?: string
}

export function CategoriaPicker({ value, onChange, allowEmpty = true, emptyLabel = '— Sin categoría —', className = '' }: Props) {
  const { data: categorias = [] } = useCategorias()

  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={`w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none ${className}`}
    >
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {categorias.filter((c) => c.activo).map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </select>
  )
}

export function CategoriaBadge({ id, color, nombre }: { id?: string | null; color?: string | null; nombre?: string | null }) {
  if (!id || !nombre) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-ink-3)]">
        Sin categoría
      </span>
    )
  }
  const bg = color ?? '#64748b'
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${bg}22`, color: bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: bg }} />
      {nombre}
    </span>
  )
}
