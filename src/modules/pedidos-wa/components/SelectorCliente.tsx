import { useMemo, useState } from 'react'
import { Check, Plus, Search, Truck } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'
import { useClientesPedidosWa } from '../lib/queries'
import { REPARTIDOR_LABEL, type ClientePedido } from '../lib/types'
import { ClienteModal } from './ClienteModal'

type Props = {
  value: ClientePedido | null
  onChange: (c: ClientePedido) => void
}

export function SelectorCliente({ value, onChange }: Props) {
  const { data: clientes, isLoading } = useClientesPedidosWa()
  const [q, setQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  const filtrados = useMemo(() => {
    if (!clientes) return []
    const norm = q.trim().toLowerCase()
    if (!norm) return clientes
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(norm) ||
      c.nombre_normalizado.includes(norm) ||
      c.repartidor.toLowerCase().includes(norm),
    )
  }, [clientes, q])

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-3)]" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente…"
            className="pl-8"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="md"
          onClick={() => setModalOpen(true)}
        >
          <Plus className="h-4 w-4" /> Nuevo
        </Button>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading && (
          <div className="p-3 text-center text-xs text-[var(--color-ink-3)]">Cargando clientes…</div>
        )}
        {!isLoading && filtrados.length === 0 && (
          <div className="p-3 text-center text-xs text-[var(--color-ink-3)]">
            Sin resultados.{' '}
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="font-medium text-[var(--color-primary-2)] underline-offset-2 hover:underline"
            >
              ¿Crear nuevo?
            </button>
          </div>
        )}
        {filtrados.map((c) => {
          const selected = value?.id === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c)}
              className={cn(
                'flex w-full items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2 text-left text-sm transition-colors last:border-b-0',
                selected
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                  : 'hover:bg-[var(--color-surface-2)]',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{c.nombre}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]">
                  <Truck className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {REPARTIDOR_LABEL[c.repartidor]}
                    {c.horario && ` · ${c.horario}`}
                    {c.tipo_factura !== 'HOLDED' && ` · ${c.tipo_factura}`}
                  </span>
                </div>
              </div>
              {selected && <Check className="h-4 w-4 shrink-0 text-[var(--color-primary-2)]" />}
            </button>
          )
        })}
      </div>

      {modalOpen && (
        <ClienteModal
          cliente={null}
          onClose={() => setModalOpen(false)}
          onSaved={(c) => onChange(c)}
        />
      )}
    </div>
  )
}
