import { useState } from 'react'
import { X } from 'lucide-react'
import { Title, Description } from '@radix-ui/react-dialog'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { euros, fmtDate } from '@/shared/lib/format'
import { useSobreMovimientos } from '../lib/queries'
import { CATEGORIA_LABEL, type Movimiento, type SobreResumen } from '../lib/types'

export function SobreDetalle({ sobre, desde, hasta, onClose }: {
  sobre: SobreResumen; desde: string; hasta: string; onClose: () => void
}) {
  const movimientos = useSobreMovimientos(sobre.id)
  const [soloMes, setSoloMes] = useState(false)
  const dias = new Map<string, Movimiento[]>()
  for (const movimiento of movimientos.data ?? []) {
    if (soloMes && (movimiento.fecha < desde || movimiento.fecha > hasta)) continue
    const grupo = dias.get(movimiento.fecha) ?? []
    grupo.push(movimiento)
    dias.set(movimiento.fecha, grupo)
  }
  const ajuste = sobre.acumulado - sobre.salidas_total + sobre.devoluciones_total

  return (
    <Modal onClose={onClose} size="xl" ariaLabel={`Movimientos de ${sobre.nombre}`}>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line-2)] px-4 py-3">
        <Title asChild><h2 className="min-w-0 break-words text-sm font-semibold text-[var(--ink)]">{sobre.nombre} · Movimientos</h2></Title>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar detalle"><X className="h-4 w-4" /></Button>
      </div>
      <div className="grid gap-3 p-4">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--ink-mute)] tabular-nums">
          <span>Acumulado <strong className="text-[var(--mint)]">{euros(sobre.acumulado)}</strong></span>
          <span>Salidas {euros(sobre.salidas_total)}</span>
          <span>Devoluciones {euros(sobre.devoluciones_total)}</span>
          {Math.abs(ajuste) >= 0.005 && <span>Ajuste manual {euros(ajuste)}</span>}
        </div>
        <Description asChild><p className="text-xs text-[var(--ink-mute)]">Las salidas suman al sobre; las entradas son devoluciones y restan. El ajuste manual se muestra aparte.</p></Description>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Periodo del historial">
          <Button size="sm" variant={soloMes ? 'outline' : 'primary'} aria-pressed={!soloMes} onClick={() => setSoloMes(false)}>Todo el historial</Button>
          <Button size="sm" variant={soloMes ? 'primary' : 'outline'} aria-pressed={soloMes} onClick={() => setSoloMes(true)}>Mes seleccionado</Button>
        </div>
        {soloMes && <p className="text-xs text-[var(--ink-mute)] tabular-nums">{fmtDate(desde, 'dd/MM/yyyy')} – {fmtDate(hasta, 'dd/MM/yyyy')} · Neto {euros(sobre.neto_periodo)}</p>}
        {movimientos.isPending ? <p className="text-sm text-[var(--ink-mute)]">Cargando movimientos…</p>
          : movimientos.isError ? <div role="alert" className="text-sm text-[var(--coral)]">No se pudieron cargar los movimientos. <button className="underline" onClick={() => { void movimientos.refetch() }}>Reintentar</button></div>
          : dias.size === 0 ? <p className="text-sm text-[var(--ink-mute)]">Sin movimientos {soloMes ? 'en el mes seleccionado' : 'asignados a este sobre'}.</p>
          : [...dias].map(([fecha, filas]) => (
            <section key={fecha} className="overflow-hidden rounded-md border border-[var(--line-2)]">
              <h3 className="flex items-center justify-between gap-2 bg-[var(--panel)] px-3 py-2 text-xs font-semibold text-[var(--ink)] tabular-nums">
                <span>{fmtDate(fecha, 'dd/MM/yyyy')}</span>
                <span>Neto del día: {euros(filas.reduce((total, m) => total + (m.tipo === 'salida' ? m.importe : -m.importe), 0))}</span>
              </h3>
              <ul className="divide-y divide-[var(--line-2)]">
                {filas.map(m => (
                  <li key={m.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0 break-words">
                      <p className="font-medium text-[var(--ink)]">{m.concepto}</p>
                      <p className="text-[11px] text-[var(--ink-mute)]">{m.tipo === 'salida' ? 'Salida · Aportación al sobre' : 'Entrada · Devolución'}{m.categoria ? ` · ${CATEGORIA_LABEL[m.categoria] ?? m.categoria}` : ''}</p>
                      {m.notas && <p className="whitespace-pre-wrap text-xs text-[var(--ink-mute)]">{m.notas}</p>}
                    </div>
                    <span className={`shrink-0 tabular-nums font-medium ${m.tipo === 'salida' ? 'text-[var(--mint)]' : 'text-[var(--coral)]'}`}>{m.tipo === 'salida' ? '+' : '−'}{euros(m.importe)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </Modal>
  )
}
