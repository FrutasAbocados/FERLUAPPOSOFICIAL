import { useMemo, useState } from 'react'
import {
  Clock,
  EyeOff,
  FileText,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Truck,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
import {
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

const PALETA: Record<Repartidor, {
  text:    string
  bgSoft:  string
  ring:    string
  border:  string
  accent:  string
}> = {
  TORRES: {
    text:   'text-[oklch(42%_.12_224)] dark:text-[oklch(76%_.12_224)]',
    bgSoft: 'bg-[oklch(93%_.06_220_/_0.75)] dark:bg-[oklch(30%_.08_224_/_0.42)]',
    ring:   'ring-[oklch(78%_.11_224_/_0.45)]',
    border: 'border-[oklch(78%_.11_224_/_0.45)]',
    accent: 'bg-[oklch(61%_.15_224)]',
  },
  GERMAN: {
    text:   'text-[var(--mint)]',
    bgSoft: 'bg-[var(--mint-glow)]',
    ring:   'ring-[oklch(72%_.14_156_/_0.35)]',
    border: 'border-[oklch(72%_.14_156_/_0.35)]',
    accent: 'bg-[var(--mint)]',
  },
  RAUL: {
    text:   'text-orange-700 dark:text-orange-300',
    bgSoft: 'bg-orange-50 dark:bg-orange-950/40',
    ring:   'ring-orange-200 dark:ring-orange-900/60',
    border: 'border-orange-200 dark:border-orange-900/60',
    accent: 'bg-orange-500',
  },
  ALEX: {
    text:   'text-[oklch(42%_.12_295)] dark:text-[oklch(78%_.11_295)]',
    bgSoft: 'bg-[oklch(93%_.06_295_/_0.75)] dark:bg-[oklch(30%_.08_295_/_0.42)]',
    ring:   'ring-[oklch(78%_.11_295_/_0.45)]',
    border: 'border-[oklch(78%_.11_295_/_0.45)]',
    accent: 'bg-[oklch(62%_.16_295)]',
  },
}

type Filtro = 'todos' | Repartidor
type Vista = 'cards' | 'lista'

export function ListaClientes() {
  const { data, isLoading, error } = useTodosLosClientesPedidos()
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [editando, setEditando] = useState<ClientePedido | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [mostrarInactivos, setMostrarInactivos] = useState(false)
  const [vista, setVista] = useState<Vista>('cards')

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

  const totalActivos = (data ?? []).filter(c => c.activo).length
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
      <div className="rounded-[var(--radius-lg)] border border-[oklch(72%_.16_25_/_0.35)] bg-[oklch(30%_.12_25_/_0.12)] p-4 text-sm text-[var(--coral)]">
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
    <div className="space-y-4">
      {/* Header con KPIs por repartidor */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--color-ink)]">
          <Users className="h-4 w-4" />
          Clientes
          <span className="text-sm font-normal text-[var(--color-ink-3)]">
            ({totalActivos} activos{inactivosCount > 0 && `, ${inactivosCount} inactivos`})
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setVista('cards')}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 text-xs',
                vista === 'cards'
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                  : 'text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]',
              )}
              title="Vista en tarjetas"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setVista('lista')}
              className={cn(
                'inline-flex items-center gap-1 border-l border-[var(--color-border)] px-2 py-1 text-xs',
                vista === 'lista'
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                  : 'text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]',
              )}
              title="Vista en lista compacta"
            >
              <ListIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button
            size="sm"
            onClick={() => { setEditando(null); setModalOpen(true) }}
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo cliente
          </Button>
        </div>
      </div>

      {/* KPIs por repartidor — chips clicables como filtro */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <KpiChip
          label="Todos"
          value={totalActivos}
          color="bg-[var(--color-ink)]"
          active={filtro === 'todos'}
          onClick={() => setFiltro('todos')}
        />
        {REPARTIDOR_ORDER.map(r => (
          <KpiChip
            key={r}
            label={REPARTIDOR_LABEL[r]}
            value={counts.get(r) ?? 0}
            color={PALETA[r].accent}
            active={filtro === r}
            onClick={() => setFiltro(r)}
          />
        ))}
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-3)]" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente…"
          className="pl-8 pr-8"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink-2)]"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
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
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-ink-3)]">
          Sin clientes que coincidan con el filtro.
        </div>
      ) : vista === 'cards' ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtrados.map(c => (
            <ClienteCard
              key={c.id}
              cliente={c}
              onEdit={() => { setEditando(c); setModalOpen(true) }}
              onToggle={() => onToggle(c)}
              toggling={toggle.isPending}
            />
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]">
          {filtrados.map(c => (
            <ClienteRowCompacta
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

function KpiChip({
  label, value, color, active, onClick,
}: {
  label: string
  value: number
  color: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-between rounded-[var(--radius-lg)] border p-2.5 transition-all',
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] shadow-sm'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)]',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', color)} />
        <span className="truncate text-xs font-medium text-[var(--color-ink-2)]">
          {label}
        </span>
      </div>
      <span className="tabular-nums text-lg font-bold text-[var(--color-ink)]">
        {value}
      </span>
    </button>
  )
}

function inicialDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[1][0]).toUpperCase()
}

function ClienteCard({
  cliente, onEdit, onToggle, toggling,
}: {
  cliente: ClientePedido
  onEdit: () => void
  onToggle: () => void
  toggling: boolean
}) {
  const p = PALETA[cliente.repartidor]
  return (
    <li
      className={cn(
        'group relative flex min-h-[120px] flex-col gap-2 overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--color-surface)] p-3 shadow-sm transition-shadow hover:shadow-md',
        cliente.activo ? p.border : 'border-[var(--color-border)] opacity-60',
      )}
    >
      <span className={cn('absolute left-0 top-0 h-full w-1', p.accent)} />

      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-2',
            p.bgSoft, p.text, p.ring,
          )}
        >
          {inicialDe(cliente.nombre)}
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-sm font-bold text-[var(--color-ink)]"
            title={cliente.nombre}
          >
            {cliente.nombre}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[var(--color-ink-3)]">
            <span className={cn('inline-flex items-center gap-0.5 font-medium', p.text)}>
              <Truck className="h-3 w-3" />
              {REPARTIDOR_LABEL[cliente.repartidor]}
              {cliente.salida && ` · ${cliente.salida === 'PRIMERA' ? '1ª' : '2ª'}`}
            </span>
            {cliente.horario && (
              <span className="inline-flex items-center gap-0.5">
                <Clock className="h-3 w-3" />
                <span className="tabular-nums">{cliente.horario}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1 text-[var(--color-ink-3)] opacity-0 transition-opacity hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] group-hover:opacity-100"
            title="Editar cliente"
            aria-label="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            disabled={toggling}
            className={cn(
              'rounded-md p-1 opacity-0 transition-opacity disabled:opacity-50 group-hover:opacity-100',
              cliente.activo
                ? 'text-[var(--color-ink-3)] hover:bg-[oklch(92%_.08_82_/_0.85)] hover:text-[oklch(39%_.11_72)] dark:hover:bg-[oklch(28%_.08_72_/_0.42)]'
                : 'text-[var(--mint)] hover:bg-[var(--mint-glow)]',
            )}
            title={cliente.activo ? 'Desactivar' : 'Reactivar'}
            aria-label={cliente.activo ? 'Desactivar' : 'Reactivar'}
          >
            {cliente.activo ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 text-[10px]">
        {!cliente.activo && (
          <Badge color="bg-zinc-200 text-zinc-700">Inactivo</Badge>
        )}
        {cliente.tipo_factura !== 'HOLDED' && (
          <Badge color="bg-[var(--color-surface-2)] text-[var(--color-ink-2)] border border-[var(--color-border)]">
            <FileText className="mr-0.5 inline h-2.5 w-2.5" />
            {cliente.tipo_factura}
          </Badge>
        )}
        {cliente.subseccion_default && (
          <Badge color="bg-[oklch(93%_.06_220_/_0.75)] text-[oklch(39%_.11_224)] dark:bg-[oklch(30%_.08_224_/_0.42)] dark:text-[oklch(76%_.12_224)]">
            sub: {cliente.subseccion_default}
          </Badge>
        )}
      </div>

      {cliente.notas && (
        <div className="rounded-md bg-[oklch(30%_.12_25_/_0.12)] px-2 py-1 text-[11px] leading-snug text-[var(--coral)]">
          ⚠ {cliente.notas}
        </div>
      )}
    </li>
  )
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 font-medium', color)}>
      {children}
    </span>
  )
}

function ClienteRowCompacta({
  cliente, onEdit, onToggle, toggling,
}: {
  cliente: ClientePedido
  onEdit: () => void
  onToggle: () => void
  toggling: boolean
}) {
  const p = PALETA[cliente.repartidor]
  return (
    <li className={cn(
      'flex items-center gap-3 bg-[var(--color-surface)] px-3 py-2 hover:bg-[var(--color-surface-2)]',
      !cliente.activo && 'opacity-60',
    )}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', p.accent)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-[var(--color-ink)]">
            {cliente.nombre}
          </span>
          {!cliente.activo && (
            <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zinc-700">
              inactivo
            </span>
          )}
          {cliente.tipo_factura !== 'HOLDED' && (
            <span className="rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[9px] uppercase text-[var(--color-ink-3)]">
              {cliente.tipo_factura}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--color-ink-3)]">
          <span className={cn('inline-flex items-center gap-0.5', p.text)}>
            <Truck className="h-3 w-3" />
            {REPARTIDOR_LABEL[cliente.repartidor]}
            {cliente.salida && ` · ${cliente.salida === 'PRIMERA' ? '1ª' : '2ª'}`}
          </span>
          {cliente.horario && (
            <span className="inline-flex items-center gap-0.5 tabular-nums">
              <Clock className="h-3 w-3" /> {cliente.horario}
            </span>
          )}
          {cliente.subseccion_default && (
            <span>sub: {cliente.subseccion_default}</span>
          )}
          {cliente.notas && (
            <span className="text-[var(--coral)]">⚠ {cliente.notas}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md p-1.5 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          title="Editar"
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
              ? 'text-[var(--color-ink-3)] hover:bg-[oklch(92%_.08_82_/_0.85)] hover:text-[oklch(39%_.11_72)] dark:hover:bg-[oklch(28%_.08_72_/_0.42)]'
              : 'text-[var(--mint)] hover:bg-[var(--mint-glow)]',
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
