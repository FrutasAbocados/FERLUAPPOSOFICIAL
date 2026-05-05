import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { useCategorias } from '../lib/hooks'
import { CategoriasModal } from './CategoriasModal'

type Props = {
  value: string | null
  onChange: (id: string | null) => void
  allowEmpty?: boolean
  emptyLabel?: string
  className?: string
  /** Muestra botón de gestión de categorías al lado del select. Default: true. */
  showManage?: boolean
}

export function CategoriaPicker({
  value,
  onChange,
  allowEmpty = true,
  emptyLabel = '— Sin categoría —',
  className = '',
  showManage = true,
}: Props) {
  const { data: categorias = [] } = useCategorias()
  const [openMgr, setOpenMgr] = useState(false)

  return (
    <div className="flex items-center gap-1">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className={`flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none ${className}`}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {categorias.filter((c) => c.activo).map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      {showManage && (
        <button
          type="button"
          onClick={() => setOpenMgr(true)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          title="Gestionar categorías"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      )}
      {openMgr && <CategoriasModal onClose={() => setOpenMgr(false)} />}
    </div>
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
