import { useMemo, useState } from 'react'
import {
  Clock,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Truck,
  Users,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import {
  REPARTIDOR_COLOR,
  REPARTIDOR_LABEL,
  type ClientePedido,
  type Repartidor,
} from '../lib/types'
import {
  useToggleActivoCliente,
  useTodosLosClientesPedidos,
} from '../lib/queries'
import { ClienteModal } from './ClienteModal'

const REPARTIDOR_ORDER: Repartidor[] = ['TORRES', 'GERMAN', 'RAUL', 'ALEX']

type Filtro = 'todos' | Repartidor

export function ListaClientes() {
  const { data, isLoading, error } = useTodosLosClientesPedidos()
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [editando, setEditando] = useState<ClientePedido | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [mostrarInactivos, setMostrarInactivos] = useState(false)

  const toggle = useToggleActivoCliente()

  const filtrados = useMemo(() => {
    if (!data) return []
    const norm = q.trim().toLowerCase()
    return data.filter(c => {
      if (filtro !== 'todos' && c.repartidor !== filtro) return false
      if (!mostrarInactivos && !c.activo) return false
      if (!norm) return true
      return (
        c.nombre.toLowerCase().includes(norm) ||
        c.nombre_normalizado.includes(norm) ||
        c.repartidor.toLowerCase().includes(norm)
      )
    })
  }, [data, q, filtro, mostrarInactivos])

  const counts = useMemo(() => {
    const map = new Map<Repartidor, number>()
    for (const c of data ?? []) {
      if (!c.activo) continue
      map.set(c.repartidor, (map.get(c.repartidor) ?? 0) + 1)
    }
    return map
  }, [data])

  const inactivosCount = (data ?? []).filter(c => !c.activo).length

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-ink-3)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando clientes…
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Error: {(error as Error).message}
      </div>
    )
  }

  const onToggle = (c: ClientePedido) => {
    toggle.mutate(
      { id: c.id, activo: !c.activo },
      {
        onSuccess: () => toast({
          title: c.activo ? `${c.nombre} desactivado` : `${c.nombre} reactivado`,
          variant: 'success',
        }),
        onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
      },
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
          <Users className="h-4 w-4" />
          Clientes ({(data ?? []).filter(c => c.activo).length} activos
          {inactivosCount > 0 && `, ${inactivosCount} inactivos`})
        </h2>
        <Button
          size="sm"
          onClick={() => { setEditando(null); setModalOpen(true) }}
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo cliente
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <FiltroBtn active={filtro === 'todos'} onClick={() => setFiltro('todos')}>
          Todos
        </FiltroBtn>
        {REPARTIDOR_ORDER.map(r => (
          <FiltroBtn key={r} active={filtro === r} onClick={() => setFiltro(r)}>
            <Truck className="h-3 w-3" />
            {REPARTIDOR_LABEL[r]}
            <span className="text-[10px] text-[var(--color-ink-3)]">
              {counts.get(r) ?? 0}
            </span>
          </FiltroBtn>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-3)]" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente…"
          className="pl-8"
        />
      </div>

      {inactivosCount > 0 && (
        <button
          type="button"
          onClick={() => setMostrarInactivos(v => !v)}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
        >
          <EyeOff className="h-3 w-3" />
          {mostrarInactivos ? 'Ocultar inactivos' : `Mostrar ${inactivosCount} inactivos`}
        </button>
      )}

      {filtrados.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-ink-3)]">
          Sin clientes que coincidan con el filtro.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtrados.map(c => (
            <ClienteRow
              key={c.id}
              cliente={c}
              onEdit={() => { setEditando(c); setModalOpen(true) }}
              onToggle={() => onToggle(c)}
              toggling={toggle.isPending}
            />
          ))}
        </ul>
      )}

      {modalOpen && (
        <ClienteModal
          cliente={editando}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}

function ClienteRow({
  cliente, onEdit, onToggle, toggling,
}: {
  cliente: ClientePedido
  onEdit: () => void
  onToggle: () => void
  toggling: boolean
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-[var(--radius-lg)] border p-3',
        cliente.activo ? REPARTIDOR_COLOR[cliente.repartidor] : 'border-[var(--color-border)] bg-[var(--color-surface-2)] opacity-60',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-[var(--color-ink)]">
            {cliente.nombre}
          </span>
          {!cliente.activo && (
            <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-700">
              inactivo
            </span>
          )}
          {cliente.tipo_factura !== 'HOLDED' && (
            <span className="rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-ink-3)]">
              {cliente.tipo_factura}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--color-ink-2)]">
          <span className="inline-flex items-center gap-1">
            <Truck className="h-3 w-3" />
            {REPARTIDOR_LABEL[cliente.repartidor]}
            {cliente.salida && ` · ${cliente.salida === 'PRIMERA' ? '1ª' : '2ª'}`}
          </span>
          {cliente.horario && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {cliente.horario}
            </span>
          )}
          {cliente.subseccion_default && (
            <span className="text-[var(--color-ink-3)]">
              sub: {cliente.subseccion_default}
            </span>
          )}
        </div>
        {cliente.notas && (
          <div className="mt-1 inline-block rounded-md bg-red-50 px-2 py-0.5 text-[11px] text-red-700">
            ⚠ {cliente.notas}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md p-1.5 text-[var(--color-ink-3)] hover:bg-white hover:text-[var(--color-ink)]"
          title="Editar cliente"
          aria-label="Editar"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          disabled={toggling}
          className={cn(
            'rounded-md p-1.5 disabled:opacity-50',
            cliente.activo
              ? 'text-[var(--color-ink-3)] hover:bg-amber-50 hover:text-amber-700'
              : 'text-emerald-700 hover:bg-emerald-50',
          )}
          title={cliente.activo ? 'Desactivar' : 'Reactivar'}
          aria-label={cliente.activo ? 'Desactivar' : 'Reactivar'}
        >
          {cliente.activo ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
        </button>
      </div>
    </li>
  )
}

function FiltroBtn({
  active, onClick, children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
          : 'border-[var(--color-border)] text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]',
      )}
    >
      {children}
    </button>
  )
}
