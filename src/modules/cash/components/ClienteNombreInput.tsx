import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { useBuscarContactos } from '../lib/repartos-queries'
import type { ContactoOpt } from '../lib/repartos-types'

/**
 * Nombre de una línea manual de reparto: se puede escribir libre, pero sugiere
 * clientes igual que ClienteBuscador y, al elegir uno, la línea queda enlazada.
 */
export function ClienteNombreInput({
  value,
  onChange,
  onSelect,
  className,
}: {
  value: string
  onChange: (nombre: string) => void
  onSelect: (contacto: ContactoOpt) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const resultados = useBuscarContactos(open ? value : '')

  useEffect(() => {
    const handler = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [])

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <Input
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Nombre del cliente"
        autoComplete="off"
        className={className}
      />
      {open && value.trim().length >= 2 && (
        <div className="absolute left-0 z-20 mt-1 max-h-60 w-max min-w-full max-w-[18rem] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-lg">
          {resultados.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-[var(--color-ink-3)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Buscando…
            </div>
          ) : (resultados.data ?? []).length === 0 ? (
            <p className="p-3 text-xs text-[var(--color-ink-3)]">Sin resultados — se guarda como texto libre.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {(resultados.data ?? []).map((contacto) => (
                <li key={contacto.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(contacto)
                      setOpen(false)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-[var(--color-ink)] hover:bg-[rgba(255,255,255,.035)]"
                  >
                    {contacto.nombre}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
