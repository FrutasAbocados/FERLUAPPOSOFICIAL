import { useEffect, useRef, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import {
  useCreateProveedorManual,
  useProveedoresHoldedSearch,
  useProveedoresManuales,
  useProveedorHoldedById,
} from '../lib/hooks'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'

export type ProveedorValue = {
  holded_id: string | null
  manual_id: string | null
  libre: string | null
}

type Props = {
  value: ProveedorValue
  onChange: (v: ProveedorValue) => void
  allowLibre?: boolean
  className?: string
}

export function ProveedorPicker({ value, onChange, allowLibre = false, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const { data: holdedResults = [], isFetching } = useProveedoresHoldedSearch(q)
  const { data: manuales = [] } = useProveedoresManuales()
  const { data: holdedSelected } = useProveedorHoldedById(value.holded_id)
  const createManual = useCreateProveedorManual()

  const selectedManual = manuales.find((m) => m.id === value.manual_id) ?? null

  const display =
    holdedSelected?.nombre ??
    selectedManual?.nombre ??
    value.libre ??
    ''

  // Cerrar al click fuera
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const filteredManuales = q.trim().length === 0
    ? manuales
    : manuales.filter((m) => m.nombre.toLowerCase().includes(q.toLowerCase()))

  const showCreateNew = q.trim().length >= 2 &&
    !filteredManuales.some((m) => m.nombre.toLowerCase() === q.trim().toLowerCase()) &&
    !holdedResults.some((h) => h.nombre.toLowerCase() === q.trim().toLowerCase())

  const handleSelectHolded = (id: string) => {
    onChange({ holded_id: id, manual_id: null, libre: null })
    setOpen(false)
    setQ('')
  }
  const handleSelectManual = (id: string) => {
    onChange({ holded_id: null, manual_id: id, libre: null })
    setOpen(false)
    setQ('')
  }
  const handleCreateManual = async () => {
    const nombre = q.trim()
    if (nombre.length < 2) return
    try {
      const nuevo = await createManual.mutateAsync({ nombre })
      onChange({ holded_id: null, manual_id: nuevo.id, libre: null })
      toast({ title: 'Proveedor manual creado', variant: 'success' })
      setOpen(false)
      setQ('')
    } catch (e: unknown) {
      toast({ title: 'Error al crear proveedor', description: errorMessage(e), variant: 'error' })
    }
  }
  const handleSetLibre = () => {
    if (!q.trim()) return
    onChange({ holded_id: null, manual_id: null, libre: q.trim() })
    setOpen(false)
    setQ('')
  }
  const handleClear = () => {
    onChange({ holded_id: null, manual_id: null, libre: null })
    setQ('')
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5">
        <Search className="h-4 w-4 shrink-0 text-[var(--color-ink-3)]" />
        <input
          type="text"
          value={open ? q : display}
          onChange={(e) => {
            setQ(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={allowLibre ? 'Buscar / crear / texto libre…' : 'Buscar proveedor…'}
          className="flex-1 bg-transparent text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-3)] focus:outline-none"
        />
        {(value.holded_id || value.manual_id || value.libre) && (
          <button type="button" onClick={handleClear} className="text-[var(--color-ink-3)] hover:text-[var(--color-ink)]">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
          {/* Holded */}
          {q.trim().length >= 2 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                Holded {isFetching ? '…' : `(${holdedResults.length})`}
              </div>
              {holdedResults.length === 0 && !isFetching ? (
                <div className="px-3 py-1.5 text-xs text-[var(--color-ink-3)]">Sin resultados</div>
              ) : (
                holdedResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectHolded(p.id)}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-surface-2)]"
                  >
                    <span className="text-[var(--color-ink)]">{p.nombre}</span>
                    {p.nif && <span className="ml-2 text-[10px] text-[var(--color-ink-3)]">{p.nif}</span>}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Manuales */}
          {filteredManuales.length > 0 && (
            <div className="border-t border-[var(--color-border)]">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                Manuales ({filteredManuales.length})
              </div>
              {filteredManuales.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectManual(p.id)}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-surface-2)]"
                >
                  <span className="text-[var(--color-ink)]">{p.nombre}</span>
                  {p.nif && <span className="ml-2 text-[10px] text-[var(--color-ink-3)]">{p.nif}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Acciones */}
          {(showCreateNew || allowLibre) && (
            <div className="border-t border-[var(--color-border)]">
              {showCreateNew && (
                <button
                  type="button"
                  onClick={handleCreateManual}
                  disabled={createManual.isPending}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--color-primary-2)] hover:bg-[var(--color-surface-2)]"
                >
                  <Plus className="h-4 w-4" />
                  Crear manual “{q.trim()}”
                </button>
              )}
              {allowLibre && q.trim().length >= 2 && (
                <button
                  type="button"
                  onClick={handleSetLibre}
                  className="block w-full px-3 py-2 text-left text-sm text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]"
                >
                  Usar “{q.trim()}” como texto libre
                </button>
              )}
            </div>
          )}

          {/* Estado vacío inicial */}
          {q.trim().length < 2 && filteredManuales.length === 0 && (
            <div className="px-3 py-2 text-xs text-[var(--color-ink-3)]">
              Escribe al menos 2 letras para buscar en Holded
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ProveedorLabel({ value, holdedNombre, manualNombre }: { value: ProveedorValue; holdedNombre?: string | null; manualNombre?: string | null }) {
  const text = holdedNombre ?? manualNombre ?? value.libre ?? '—'
  const tag = value.holded_id ? 'Holded' : value.manual_id ? 'Manual' : value.libre ? 'Libre' : ''
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-sm text-[var(--color-ink)]">{text}</span>
      {tag && <span className="rounded-sm bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--color-ink-3)]">{tag}</span>}
    </span>
  )
}
