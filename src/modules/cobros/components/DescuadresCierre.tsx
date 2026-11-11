import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { useClientes } from '../lib/queries'
import {
  MOTIVO_LABEL,
  useCuadrarDescuadre,
  useDescuadresCierre,
  useEnlazarClienteCobros,
  type DescuadreCierre,
} from '../lib/descuadres'

const fmt = (d: string) => format(parseISO(d), 'EEE d LLL', { locale: es })
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Aviso de deuda de cierres aprobados que no ha llegado a Cobros.
 * No pinta nada si todo cuadra.
 */
export function DescuadresCierre() {
  const q = useDescuadresCierre()
  const [abierto, setAbierto] = useState(true)
  const filas = q.data ?? []
  if (q.isError) {
    return (
      <div role="alert" className="ao-panel mb-4 p-3 text-sm text-[var(--coral)]">
        No se pudo comprobar la deuda de los cierres: {errMsg(q.error)}
      </div>
    )
  }
  if (filas.length === 0) return null
  const total = filas.reduce((s, f) => s + f.importe, 0)

  return (
    <section className="mb-4 rounded-[var(--radius-md)] border border-[var(--coral)] bg-[var(--color-surface)]">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--coral)]" />
        <span className="flex-1 text-sm font-semibold text-[var(--color-ink)]">
          Deuda de cierres sin cuadrar con Cobros: {filas.length} · <span className="tabular-nums">{euros(total)}</span>
        </span>
        {abierto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {abierto && (
        <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
          {filas.map((d) => (
            <FilaDescuadre key={`${d.jornada_id}|${d.contact_key}|${d.importe}`} d={d} />
          ))}
        </ul>
      )}
    </section>
  )
}

function FilaDescuadre({ d }: { d: DescuadreCierre }) {
  const clientes = useClientes()
  const cuadrar = useCuadrarDescuadre()
  const enlazar = useEnlazarClienteCobros()
  const [clienteId, setClienteId] = useState<string>(d.cliente_id ?? '')
  const [nota, setNota] = useState('')
  const ocupado = cuadrar.isPending || enlazar.isPending
  const necesitaFicha = !d.cliente_id && !!d.contact_id

  const elegirFicha = async (id: string) => {
    setClienteId(id)
    // Solo falta la ficha: al enlazarla se pasa sola, y queda para siempre.
    if (id && d.motivo === 'cliente_sin_enlace' && d.contact_id) {
      try {
        const n = await enlazar.mutateAsync({ contact_id: d.contact_id, cliente_id: id })
        toast({ title: 'Cliente enlazado', description: `${n} deuda${n === 1 ? '' : 's'} pasada${n === 1 ? '' : 's'} a Cobros`, variant: 'success' })
      } catch (e) {
        toast({ title: 'No se pudo enlazar', description: errMsg(e), variant: 'error' })
      }
    }
  }

  const usarFactura = async (doc: string) => {
    if (necesitaFicha && !clienteId) {
      toast({ title: 'Elige primero la ficha de Cobros', variant: 'error' })
      return
    }
    try {
      await cuadrar.mutateAsync({ d, numero_factura: doc, cliente_id: necesitaFicha ? clienteId : null, nota: nota.trim() || null })
      toast({ title: 'Cuadrado', description: `${doc} en Cobros`, variant: 'success' })
    } catch (e) {
      toast({ title: 'No se pudo cuadrar', description: errMsg(e), variant: 'error' })
    }
  }

  const marcarCuadrado = async () => {
    if (!nota.trim()) {
      toast({ title: 'Escribe una nota', description: 'Explica por qué cuadra sin factura.', variant: 'error' })
      return
    }
    try {
      await cuadrar.mutateAsync({ d, nota: nota.trim() })
    } catch (e) {
      toast({ title: 'No se pudo marcar', description: errMsg(e), variant: 'error' })
    }
  }

  return (
    <li className="space-y-1.5 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-medium text-[var(--color-ink)]">{d.contact_nombre || 'Sin nombre'}</span>
        <span className="font-semibold tabular-nums text-[var(--color-ink)]">{euros(d.importe)}</span>
        <span className="text-xs text-[var(--color-ink-3)]">
          {fmt(d.fecha)}{d.repartidor ? ` · ${d.repartidor}` : ''}
        </span>
        <span className="rounded-full border border-[var(--coral)] px-1.5 text-[11px] font-semibold text-[var(--coral)]">
          {MOTIVO_LABEL[d.motivo]}
        </span>
        {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-ink-3)]" />}
      </div>

      {necesitaFicha && (
        <select
          value={clienteId}
          disabled={ocupado}
          onChange={(e) => void elegirFicha(e.target.value)}
          className="h-8 w-full max-w-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-ink)]"
        >
          <option value="">Ficha de Cobros para este cliente…</option>
          {(clientes.data ?? []).filter((c) => c.activo).map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      )}

      {d.candidatas.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-xs text-[var(--color-ink-3)]">Facturas Holded ±3 días:</span>
          {d.candidatas.map((c) => (
            <button
              key={c.doc_number}
              type="button"
              disabled={ocupado}
              onClick={() => void usarFactura(c.doc_number)}
              title={c.en_cobros ? 'Ya está en Cobros: solo se marca como cuadrada' : 'Pasar esta factura a Cobros'}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-2 py-1 text-xs tabular-nums text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
            >
              {c.doc_number} · {format(parseISO(c.fecha), 'd/MM')} · {euros(c.total)}
              {c.en_cobros && <Check className="ml-1 inline h-3 w-3 text-[var(--color-primary)]" />}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--color-ink-3)]">No hay facturas de este cliente en Holded en ±3 días.</p>
      )}

      <div className="flex gap-1.5">
        <Input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (p. ej. error del repartidor, ya cobrado…)"
          className="h-8 max-w-sm text-xs"
        />
        <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => void marcarCuadrado()}>
          Marcar cuadrado
        </Button>
      </div>
    </li>
  )
}
