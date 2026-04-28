import { useEffect, useRef, useState } from 'react'
import { Input } from '@/shared/components/ui/input'
import { useCatalogoProductos } from '../lib/queries'
import type { CatalogoProducto } from '../lib/types'

interface Props {
  value: string
  onChange: (v: string) => void
  onPick: (p: CatalogoProducto) => void
  placeholder?: string
}

export function ProductoAutocomplete({ value, onChange, onPick, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { data } = useCatalogoProductos(value)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? 'Producto…'}
        className="h-9"
      />
      {open && (data?.length ?? 0) > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
          {data!.map(p => (
            <li key={p.product_id}>
              <button
                type="button"
                onClick={() => { onPick(p); onChange(p.nombre); setOpen(false) }}
                className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-surface-2,#f8fafc)]"
              >
                <span className="truncate text-[var(--color-ink)]">{p.nombre}</span>
                <span className="shrink-0 text-xs tabular-nums text-[var(--color-ink-3)]">
                  {p.ultimo_precio == null ? '—' : `${Number(p.ultimo_precio).toFixed(2)}€`} · {p.veces_vendido}×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
