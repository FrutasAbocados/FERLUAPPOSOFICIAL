import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { useClientesResumen } from '../lib/queries'
import { eur } from '../lib/utils'
import { FORMA_PAGO_LABEL } from '../lib/types'
import type { ClienteResumen, Estado, FormaPago } from '../lib/types'

type Props = {
  onSelectCliente: (id: string) => void
  onNuevaPizarra: (clienteId: string) => void
  onNuevaFactura: (clienteId: string) => void
}

const ESTADOS: Estado[] = ['Vencido', 'Próximo', 'Pendiente', 'Cobrado']

export function ClientesView({ onSelectCliente, onNuevaFactura, onNuevaPizarra }: Props) {
  const { resumen, isLoading } = useClientesResumen()
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState<Estado | 'Todos'>('Todos')
  const [forma, setForma] = useState<FormaPago | 'Todas'>('Todas')

  const filtrados = useMemo(() => {
    return resumen
      .filter((c) => c.activo)
      .filter((c) =>
        q.trim() ? c.nombre.toLowerCase().includes(q.toLowerCase()) : true,
      )
      .filter((c) => (estado === 'Todos' ? true : c.estado === estado))
      .filter((c) => (forma === 'Todas' ? true : c.forma_pago === forma))
      .sort((a, b) => b.total_pendiente - a.total_pendiente)
  }, [resumen, q, estado, forma])

  if (isLoading) {
    return <div className="p-6 text-sm text-[var(--color-ink-3)]">Cargando…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-3)]" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente…"
            className="pl-9"
          />
        </div>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as Estado | 'Todos')}
          className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
        >
          <option value="Todos">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          value={forma}
          onChange={(e) => setForma(e.target.value as FormaPago | 'Todas')}
          className="h-10 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
        >
          <option value="Todas">Todas las formas</option>
          {(Object.keys(FORMA_PAGO_LABEL) as FormaPago[]).map((k) => (
            <option key={k} value={k}>
              {FORMA_PAGO_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtrados.map((c) => (
          <ClienteCard
            key={c.id}
            cliente={c}
            onOpen={() => onSelectCliente(c.id)}
            onPizarra={() => onNuevaPizarra(c.id)}
            onFactura={() => onNuevaFactura(c.id)}
          />
        ))}
        {filtrados.length === 0 && (
          <div className="col-span-full p-8 text-center text-sm text-[var(--color-ink-3)]">
            No hay clientes que coincidan.
          </div>
        )}
      </div>
    </div>
  )
}

function ClienteCard({
  cliente,
  onOpen,
  onPizarra,
  onFactura,
}: {
  cliente: ClienteResumen
  onOpen: () => void
  onPizarra: () => void
  onFactura: () => void
}) {
  const estadoTone = {
    Vencido: 'bg-red-100 text-red-700 ring-red-200',
    Próximo: 'bg-amber-100 text-amber-700 ring-amber-200',
    Pendiente: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    Cobrado: 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)] ring-[var(--color-border)]',
  }[cliente.estado]

  const dot = {
    Vencido: 'bg-red-500',
    Próximo: 'bg-amber-500',
    Pendiente: 'bg-emerald-500',
    Cobrado: 'bg-[var(--color-ink-3)]',
  }[cliente.estado]

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onOpen}
          className="text-left font-display text-lg font-bold text-[var(--color-ink)] hover:text-[var(--color-primary)]"
        >
          <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" >
            <span className={`block h-2 w-2 rounded-full ${dot}`} />
          </span>
          {cliente.nombre}
        </button>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${estadoTone}`}
        >
          {cliente.estado}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-[var(--color-ink-2)]">
        <span>{FORMA_PAGO_LABEL[cliente.forma_pago]}</span>
        {cliente.metodo_cobro_preferido && <span>{cliente.metodo_cobro_preferido}</span>}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">
          Deuda total
        </div>
        <div className="font-display text-2xl font-bold text-[var(--color-ink)]">
          {eur(cliente.total_pendiente)}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[11px]">
        <Mini label="Vencido" v={cliente.total_vencido} tone="text-red-700" />
        <Mini label="Próximo" v={cliente.total_proximo} tone="text-amber-700" />
        <Mini label="Pizarra" v={cliente.total_pizarra} tone="text-[var(--color-ink-2)]" />
      </div>
      <div className="mt-1 flex gap-2">
        <Button size="sm" variant="outline" onClick={onPizarra} className="flex-1">
          + Pizarra
        </Button>
        <Button size="sm" variant="outline" onClick={onFactura} className="flex-1">
          + Factura
        </Button>
      </div>
    </Card>
  )
}

function Mini({ label, v, tone }: { label: string; v: number; tone: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1">
      <div className="text-[9px] uppercase text-[var(--color-ink-3)]">{label}</div>
      <div className={`font-medium ${tone}`}>{eur(v)}</div>
    </div>
  )
}
