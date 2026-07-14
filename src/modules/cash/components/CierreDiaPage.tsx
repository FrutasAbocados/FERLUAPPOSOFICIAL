import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { euros } from '../lib/format'
import {
  useEmpleadosActivos,
  useEmpleadosSiempreCierre,
  useJornadaGastos,
  useJornadaLineas,
  useJornadasDia,
  useResumenDia,
} from '../lib/repartos-queries'
import type { Jornada } from '../lib/repartos-types'
import { JornadaModal } from './JornadaModal'

export function CierreDiaPage() {
  const [fecha, setFecha] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'))
  const [editing, setEditing] = useState<Jornada | null>(null)
  const [creating, setCreating] = useState<boolean>(false)
  const [creatingEmpleadoId, setCreatingEmpleadoId] = useState<string | undefined>(undefined)

  const empleados = useEmpleadosActivos()
  const siempreCierre = useEmpleadosSiempreCierre()
  const jornadas = useJornadasDia(fecha)

  const empleadoNombre = (id: string) =>
    empleados.data?.find((e) => e.id === id)?.nombre ?? '— sin nombre —'

  const fechaLabel = useMemo(
    () =>
      format(new Date(`${fecha}T00:00:00`), "EEEE d 'de' MMMM yyyy", { locale: es }),
    [fecha],
  )

  return (
    <div>
      <div className="ao-card mb-4 flex flex-wrap items-end justify-between gap-3 p-4">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
            Fecha del cierre
          </label>
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-44"
          />
          <p className="mt-1 text-xs capitalize text-[var(--color-ink-2)]">{fechaLabel}</p>
        </div>
        <Button onClick={() => { setCreating(true); setCreatingEmpleadoId(undefined) }}>
          <Plus className="mr-1 h-4 w-4" />
          Nueva jornada
        </Button>
      </div>

      {jornadas.isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-sm text-[var(--color-ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando jornadas…
        </div>
      ) : (
        (() => {
          const jornadasDelDia = jornadas.data ?? []
          const idsConJornada = new Set(jornadasDelDia.map(j => j.empleado_id))
          const sinJornada = (siempreCierre.data ?? []).filter(e => !idsConJornada.has(e.id))
          const hayAlgo = jornadasDelDia.length > 0 || sinJornada.length > 0
          if (!hayAlgo) {
            return (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center text-sm text-[var(--color-ink-3)]">
                Aún no hay jornadas registradas para este día.
              </div>
            )
          }
          return (
            <div className="space-y-3">
              {jornadasDelDia.map((j) => (
                <JornadaCard
                  key={j.id}
                  jornada={j}
                  empleadoNombre={empleadoNombre(j.empleado_id)}
                  onClick={() => setEditing(j)}
                />
              ))}
              {sinJornada.map((e) => (
                <button
                  key={e.id}
                  onClick={() => { setCreating(true); setCreatingEmpleadoId(e.id) }}
                  className="ao-card-hover block w-full rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition hover:border-[var(--color-primary)]"
                >
                  <p className="text-base font-semibold text-[var(--color-ink)]">{e.nombre}</p>
                  <p className="text-xs text-[var(--color-ink-3)]">Sin jornada — pulsa para registrar horas</p>
                </button>
              ))}
              <ResumenDia fecha={fecha} />
            </div>
          )
        })()
      )}

      {creating && (
        <JornadaModal
          fecha={fecha}
          jornada={null}
          empleadoIdInicial={creatingEmpleadoId}
          onClose={() => { setCreating(false); setCreatingEmpleadoId(undefined) }}
        />
      )}
      {editing && (
        <JornadaModal
          fecha={fecha}
          jornada={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function JornadaCard({
  jornada,
  empleadoNombre,
  onClick,
}: {
  jornada: Jornada
  empleadoNombre: string
  onClick: () => void
}) {
  const lineas = useJornadaLineas(jornada.id)
  const gastos = useJornadaGastos(jornada.id)
  const stats = useMemo(() => {
    const list = lineas.data ?? []
    const total = list.reduce((s, l) => s + Number(l.importe), 0)
    const efectivo = list
      .filter((l) => l.forma_pago === 'efectivo')
      .reduce((s, l) => s + Number(l.importe), 0)
    const tarjeta = list
      .filter((l) => l.forma_pago === 'tarjeta')
      .reduce((s, l) => s + Number(l.importe), 0)
    const deuda = list
      .filter((l) => l.forma_pago === 'deuda')
      .reduce((s, l) => s + Number(l.importe), 0)
    const totalGastos = (gastos.data ?? []).reduce((s, g) => s + Number(g.importe), 0)
    const monedas = Number(jornada.efectivo_monedas ?? 0)
    return {
      count: list.length,
      total,
      efectivo,
      gastos: totalGastos,
      efectivoNeto: efectivo - totalGastos,
      monedas,
      efectivoNetoSinMonedas: efectivo - totalGastos - monedas,
      tarjeta,
      deuda,
    }
  }, [lineas.data, gastos.data, jornada.efectivo_monedas])

  const horas =
    jornada.hora_inicio && jornada.hora_fin
      ? `${jornada.hora_inicio.slice(0, 5)} – ${jornada.hora_fin.slice(0, 5)}`
      : 'sin horario'

  return (
    <button
      onClick={onClick}
      className="ao-card-hover block w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition hover:border-[var(--color-primary)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink)]">
            {empleadoNombre}
            {jornada.origen === 'empleado' && (
              jornada.revisado ? (
                <span className="rounded-full bg-[var(--mint)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--mint)]">✓ Revisado</span>
              ) : (
                <span className="rounded-full bg-[var(--coral)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--coral)]">⏳ Pendiente revisar</span>
              )
            )}
          </p>
          <p className="text-xs text-[var(--color-ink-3)]">
            {horas} · {stats.count} reparto{stats.count === 1 ? '' : 's'}
          </p>
        </div>
        <div
          className={`grid grid-cols-3 gap-3 text-right text-xs tabular-nums ${
            stats.monedas > 0 ? 'md:grid-cols-8' : 'md:grid-cols-6'
          }`}
        >
          <Mini label="Total" value={euros(stats.total)} />
          <Mini label="Efectivo bruto" value={euros(stats.efectivo)} />
          <Mini label="Gastos" value={stats.gastos > 0 ? `−${euros(stats.gastos)}` : euros(0)} tone="danger" />
          <Mini label="Efectivo neto" value={euros(stats.efectivoNeto)} tone="success" />
          {stats.monedas > 0 && (
            <>
              <Mini label="Monedas" value={`−${euros(stats.monedas)}`} tone="danger" />
              <Mini label="Neto sin monedas" value={euros(stats.efectivoNetoSinMonedas)} tone="success" />
            </>
          )}
          <Mini label="Tarjeta" value={euros(stats.tarjeta)} />
          <Mini label="Deuda" value={euros(stats.deuda)} />
        </div>
      </div>
      {jornada.notas && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[rgba(255,255,255,.025)] p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Nota</p>
          <p className="whitespace-pre-wrap text-base leading-relaxed text-[var(--color-ink)]">{jornada.notas}</p>
        </div>
      )}
    </button>
  )
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'success' | 'danger'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-[var(--mint)]'
      : tone === 'danger'
        ? 'text-[var(--coral)]'
        : 'text-[var(--color-ink)]'
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
        {label}
      </p>
      <p className={`mono text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  )
}

function ResumenDia({ fecha }: { fecha: string }) {
  const resumen = useResumenDia(fecha)
  if (resumen.isLoading || !resumen.data) return null
  const { total, efectivo, gastos, efectivoNeto, monedas, efectivoNetoSinMonedas, tarjeta, deuda, count } = resumen.data
  if (count === 0) return null
  return (
    <div className="ao-card p-4">
      <p className="label-caps mb-2">
        Total del día
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Mini label="Repartos" value={String(count)} />
        <Mini label="Total" value={euros(total)} />
        <Mini label="Tarjeta" value={euros(tarjeta)} />
        <Mini label="Deuda" value={euros(deuda)} />
      </div>
      <div
        className={`mt-3 grid grid-cols-3 gap-3 border-t border-[var(--color-border)] pt-3 ${
          monedas > 0 ? 'md:grid-cols-5' : ''
        }`}
      >
        <Mini label="Efectivo bruto" value={euros(efectivo)} />
        <Mini label="Gastos" value={gastos > 0 ? `−${euros(gastos)}` : euros(0)} tone="danger" />
        <Mini label="Efectivo neto" value={euros(efectivoNeto)} tone="success" />
        {monedas > 0 && (
          <>
            <Mini label="Monedas" value={`−${euros(monedas)}`} tone="danger" />
            <Mini label="Neto sin monedas" value={euros(efectivoNetoSinMonedas)} tone="success" />
          </>
        )}
      </div>
    </div>
  )
}
