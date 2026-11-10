import { useState } from 'react'
import { Description, Title } from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { confirm } from '@/shared/lib/confirm'
import { euros, fmtDate } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { useRestaurarMovimiento, useTesoreriaHistorial } from '../lib/queries'
import { CATEGORIA_LABEL, type EventoTesoreria, type Movimiento } from '../lib/types'

const ACCION = { inicio: 'Estado al activar historial', alta: 'Alta', edicion: 'Edición', borrado: 'Eliminado' }
const FECHA = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Madrid' })
const firmado = (m: Movimiento | null) => m ? (m.tipo === 'entrada' ? 1 : -1) * Number(m.importe) : 0

function DatosMovimiento({ movimiento, nombresSobres }: { movimiento: Movimiento; nombresSobres: Map<string, string> }) {
  return <div className="grid gap-0.5 break-words text-xs text-[var(--ink-mute)]">
    <p className="tabular-nums">Fecha del movimiento: {fmtDate(movimiento.fecha, 'dd/MM/yyyy')} · {movimiento.tipo === 'entrada' ? 'Entrada' : 'Salida'} · {euros(Number(movimiento.importe))}</p>
    <p>{movimiento.concepto}</p>
    {movimiento.categoria && <p>Categoría: {CATEGORIA_LABEL[movimiento.categoria] ?? movimiento.categoria}</p>}
    {movimiento.sobre_id && <p>Sobre: {nombresSobres.get(movimiento.sobre_id) ?? 'Sobre eliminado'}</p>}
    {movimiento.notas && <p className="whitespace-pre-wrap">Notas: {movimiento.notas}</p>}
  </div>
}

export function HistorialTesoreria({ nombresSobres, onClose }: { nombresSobres: Map<string, string>; onClose: () => void }) {
  const historial = useTesoreriaHistorial()
  const restaurar = useRestaurarMovimiento()
  const [seleccionado, setSeleccionado] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')
  const eventos = historial.data?.pages.flat() ?? []
  const ultimos = new Map<string, number>()
  for (const e of eventos) if (!ultimos.has(e.movimiento_id)) ultimos.set(e.movimiento_id, e.id)

  async function recuperar(e: EventoTesoreria) {
    if (!e.antes || motivo.trim().length < 5 || restaurar.isPending) return
    const impacto = firmado(e.antes)
    if (!await confirm({ title: 'Restaurar movimiento', description: `Recuperar «${e.antes.concepto}» ${impacto >= 0 ? 'aumentará' : 'reducirá'} la caja en ${euros(Math.abs(impacto))}. La restauración quedará en el historial.`, confirmLabel: 'Restaurar' })) return
    try {
      await restaurar.mutateAsync({ evento: e.id, motivo: motivo.trim() })
      setSeleccionado(null)
      setMotivo('')
      toast({ title: 'Movimiento restaurado' })
    } catch (err) {
      const error = err as { message?: string; code?: string }
      toast({ variant: 'error', title: 'No se pudo restaurar', description: error.code === '23503' ? 'El sobre o cierre vinculado ya no existe. Revisa el movimiento antes de recuperarlo.' : error.message ?? String(err) })
    }
  }

  return <Modal onClose={onClose} size="xl" ariaLabel="Historial de Tesorería">
    <div className="flex items-center justify-between gap-2 border-b border-[var(--line-2)] px-4 py-3">
      <Title asChild><h2 className="text-sm font-semibold text-[var(--ink)]">Historial de Tesorería</h2></Title>
      <Button size="icon" variant="ghost" onClick={onClose} aria-label="Cerrar historial"><X className="h-4 w-4" /></Button>
    </div>
    <div className="grid gap-3 p-4">
      <Description asChild><p className="text-xs text-[var(--ink-mute)]">Altas, ediciones y borrados desde la activación del historial. Hora de Madrid. El estado inicial conserva los movimientos existentes; los borrados anteriores no se pueden reconstruir con este historial.</p></Description>
      {historial.isPending ? <p className="text-sm text-[var(--ink-mute)]">Cargando historial…</p>
        : historial.isError && eventos.length === 0 ? <div role="alert" className="text-sm text-[var(--coral)]">No se pudo cargar el historial. <button className="underline" onClick={() => { void historial.refetch() }}>Reintentar</button></div>
        : eventos.length === 0 ? <p className="text-sm text-[var(--ink-mute)]">Sin eventos registrados.</p>
        : eventos.map(e => {
          const impacto = firmado(e.despues) - firmado(e.antes)
          return <article key={e.id} className="grid gap-2 rounded-md border border-[var(--line-2)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
              <span className="font-semibold text-[var(--ink)]">{ACCION[e.accion]}</span>
              <time className="tabular-nums text-[var(--ink-mute)]">{FECHA.format(new Date(e.registrado_at))}</time>
            </div>
            <p className="break-words text-[11px] text-[var(--ink-mute)]">{e.actor_nombre}</p>
            {e.accion !== 'inicio' && <p className={`tabular-nums text-xs font-medium ${impacto < 0 ? 'text-[var(--coral)]' : 'text-[var(--mint)]'}`}>Cambio en caja: {impacto > 0 ? '+' : ''}{euros(impacto)}</p>}
            <div className={e.accion === 'edicion' ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-2'}>
              {e.antes && <div><p className="mb-1 text-[11px] font-medium text-[var(--ink)]">{e.accion === 'borrado' ? 'Movimiento eliminado' : 'Antes'}</p><DatosMovimiento movimiento={e.antes} nombresSobres={nombresSobres} /></div>}
              {e.despues && <div>{e.accion === 'edicion' && <p className="mb-1 text-[11px] font-medium text-[var(--ink)]">Después</p>}<DatosMovimiento movimiento={e.despues} nombresSobres={nombresSobres} /></div>}
            </div>
            {e.accion === 'borrado' && ultimos.get(e.movimiento_id) === e.id && (
              seleccionado === e.id ? <form className="grid gap-2" onSubmit={event => { event.preventDefault(); void recuperar(e) }}>
                <Input aria-label="Motivo de restauración" placeholder="Motivo de restauración" value={motivo} minLength={5} maxLength={500} onChange={event => setMotivo(event.target.value)} required />
                <div className="flex gap-2"><Button size="sm" disabled={motivo.trim().length < 5 || restaurar.isPending}>{restaurar.isPending ? 'Restaurando…' : 'Confirmar restauración'}</Button><Button size="sm" variant="ghost" type="button" disabled={restaurar.isPending} onClick={() => setSeleccionado(null)}>Cancelar</Button></div>
              </form> : <Button size="sm" variant="outline" className="justify-self-start" disabled={restaurar.isPending} onClick={() => { setSeleccionado(e.id); setMotivo('') }}>Restaurar movimiento</Button>
            )}
          </article>
        })}
      {historial.isFetchNextPageError && <p role="alert" className="text-xs text-[var(--coral)]">No se pudieron cargar los eventos anteriores. Vuelve a intentarlo.</p>}
      {historial.hasNextPage && <Button variant="outline" size="sm" disabled={historial.isFetchingNextPage} onClick={() => { void historial.fetchNextPage() }}>{historial.isFetchingNextPage ? 'Cargando…' : 'Cargar anteriores'}</Button>}
    </div>
  </Modal>
}
