import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Banknote, Check, CreditCard, Loader2, LockKeyhole, Search, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { euros } from '@/shared/lib/format'
import { errorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/lib/toast'
import {
  type FacturaHoldedTarde,
  type MetodoCobroTarde,
  useBuscarFacturasHoldedTarde,
  useCrearPedidoTarde,
  useMargenFacturaTarde,
} from '../lib/pedidos-tarde-queries'

interface Props {
  existingFacturaIds: Set<string>
  onClose: () => void
}

export function PedidosTardeCrearModal({ existingFacturaIds, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selected, setSelected] = useState<FacturaHoldedTarde | null>(null)
  const [metodo, setMetodo] = useState<MetodoCobroTarde | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const buscar = useBuscarFacturasHoldedTarde(debouncedQuery)
  const margen = useMargenFacturaTarde(selected?.id ?? null)
  const crear = useCrearPedidoTarde()
  const yaAnadida = !!selected && existingFacturaIds.has(selected.id)
  const saldo = useMemo(() => {
    if (!selected || !margen.data || !metodo) return null
    const parteRaul = margen.data.beneficio * 0.8
    return metodo === 'tarjeta' ? parteRaul : selected.total - parteRaul
  }, [margen.data, metodo, selected])

  const handleCrear = async () => {
    if (!selected || !margen.data || !metodo || yaAnadida) return
    try {
      await crear.mutateAsync({ factura: selected, margen: margen.data, metodoCobro: metodo })
      toast({ title: `Factura ${selected.doc_number} confirmada`, variant: 'success' })
      onClose()
    } catch (error) {
      const message = errorMessage(error) ?? 'Error desconocido'
      toast({
        title: 'No se pudo añadir la factura',
        description: message.includes('duplicate key')
          ? 'Esta factura ya está en Pedidos Tarde.'
          : message,
        variant: 'error',
      })
    }
  }

  return (
    <Modal onClose={onClose} size="xl" ariaLabel="Crear factura de pedidos de tarde">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--ink)]">Crear factura</h2>
          <p className="text-xs text-[var(--ink-dim)]">Busca una factura de venta ya sincronizada desde Holded.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-[var(--radius)] text-[var(--ink-dim)] hover:bg-white/5 hover:text-[var(--ink)]"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <label htmlFor="pedidos-tarde-factura" className="mb-1.5 block text-xs font-semibold text-[var(--ink-dim)]">
            Número de factura
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-mute)]" />
            <Input
              id="pedidos-tarde-factura"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setSelected(null)
              }}
              placeholder="Ej. F263589"
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        {debouncedQuery.length < 2 && (
          <p className="rounded-[var(--radius)] border border-dashed border-[var(--line)] px-3 py-5 text-center text-sm text-[var(--ink-mute)]">
            Escribe al menos 2 caracteres del número.
          </p>
        )}

        {buscar.isFetching && (
          <div className="flex items-center justify-center gap-2 py-5 text-sm text-[var(--ink-dim)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando en Manager…
          </div>
        )}

        {!buscar.isFetching && debouncedQuery.length >= 2 && buscar.data?.length === 0 && (
          <p className="rounded-[var(--radius)] border border-dashed border-[var(--line)] px-3 py-5 text-center text-sm text-[var(--ink-mute)]">
            No hay facturas con ese número.
          </p>
        )}

        {!selected && !buscar.isFetching && (buscar.data?.length ?? 0) > 0 && (
          <div className="max-h-64 overflow-y-auto rounded-[var(--radius)] border border-[var(--line)]">
            {buscar.data?.map((factura) => {
              const disabled = existingFacturaIds.has(factura.id)
              return (
                <button
                  key={factura.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelected(factura)}
                  className="grid w-full grid-cols-[88px_1fr_auto] items-center gap-2 border-b border-[var(--line)] px-3 py-2.5 text-left last:border-0 hover:bg-white/[.03] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="font-semibold text-[var(--mint)]">{factura.doc_number}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-[var(--ink)]">{factura.contact_name}</span>
                    <span className="block text-xs text-[var(--ink-mute)]">
                      {format(parseISO(factura.fecha), 'd MMM yyyy', { locale: es })}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {disabled ? 'Ya añadida' : euros(factura.total)}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {selected && (
          <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--line-2)] bg-white/[.02] p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg font-bold text-[var(--mint)]">{selected.doc_number}</span>
                  <Check className="h-4 w-4 text-[var(--mint)]" />
                </div>
                <p className="text-sm text-[var(--ink)]">{selected.contact_name}</p>
                <p className="text-xs text-[var(--ink-mute)]">
                  {format(parseISO(selected.fecha), 'd MMMM yyyy', { locale: es })}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Cambiar</Button>
            </div>

            {margen.isLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-[var(--ink-dim)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Calculando beneficio real…
              </div>
            ) : margen.isError ? (
              <p className="text-sm text-red-400">No se pudo calcular el beneficio de esta factura.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Dato label="Importe total" value={euros(selected.total)} />
                <Dato label="Subtotal" value={euros(selected.subtotal)} />
                <Dato label="Coste" value={euros(margen.data?.coste)} />
                <Dato label="Beneficio" value={euros(margen.data?.beneficio)} accent />
              </div>
            )}
          </div>
        )}

        {selected && margen.data && (
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--ink-dim)]">¿Quién recibe el cobro?</p>
            <div className="grid grid-cols-2 gap-2">
              <MetodoButton
                active={metodo === 'tarjeta'}
                onClick={() => setMetodo('tarjeta')}
                icon={<CreditCard className="h-4 w-4" />}
                title="Tarjeta"
                subtitle="Cobra la empresa"
              />
              <MetodoButton
                active={metodo === 'efectivo'}
                onClick={() => setMetodo('efectivo')}
                icon={<Banknote className="h-4 w-4" />}
                title="Efectivo"
                subtitle="Cobra Raúl"
              />
            </div>
          </div>
        )}

        {saldo != null && metodo && (
          <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--mint-glow)] px-3 py-2 text-sm text-[var(--ink-dim)]">
            Al cobrarla, {metodo === 'tarjeta' ? 'la empresa deberá a Raúl' : 'Raúl deberá a la empresa'}{' '}
            <strong className="tabular-nums text-[var(--ink)]">{euros(saldo)}</strong>.
          </div>
        )}

        {selected && margen.data && metodo && (
          <div className="flex items-start gap-2 rounded-[var(--radius)] border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Al confirmar, la factura quedará protegida: no se podrá eliminar ni cambiar sus importes.</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-4 py-3">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button
          onClick={handleCrear}
          disabled={!selected || !margen.data || !metodo || yaAnadida || crear.isPending}
        >
          {crear.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Confirmar factura
        </Button>
      </div>
    </Modal>
  )
}

function Dato({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[var(--ink-mute)]">{label}</p>
      <p className={`mt-0.5 font-semibold tabular-nums ${accent ? 'text-[var(--mint)]' : 'text-[var(--ink)]'}`}>{value}</p>
    </div>
  )
}

function MetodoButton({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  title: string
  subtitle: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-[var(--radius)] border px-3 py-2.5 text-left transition-colors ${
        active
          ? 'border-[var(--mint)] bg-[var(--mint-glow)] text-[var(--mint)]'
          : 'border-[var(--line)] bg-white/[.02] text-[var(--ink-dim)] hover:border-[var(--line-2)]'
      }`}
    >
      {icon}
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-[10px] opacity-75">{subtitle}</span>
      </span>
    </button>
  )
}
