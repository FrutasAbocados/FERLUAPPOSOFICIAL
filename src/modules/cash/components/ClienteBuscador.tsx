import { useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { useBuscarContactos } from '../lib/repartos-queries'
import type { ContactoOpt } from '../lib/repartos-types'

export function ClienteBuscador({ onSelect }: { onSelect: (contacto: ContactoOpt) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const resultados = useBuscarContactos(query)

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-3)]" />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar cliente (mín. 2 letras)…"
          className="pl-8"
        />
      </div>
      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-lg">
          {resultados.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-[var(--color-ink-3)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Buscando…
            </div>
          ) : (resultados.data ?? []).length === 0 ? (
            <p className="p-3 text-xs text-[var(--color-ink-3)]">Sin resultados.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {(resultados.data ?? []).map((contacto) => (
                <li key={contacto.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(contacto)
                      setQuery('')
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
