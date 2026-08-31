import { useMemo, useState } from 'react'
import { addMonths, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useAuth } from '@/shared/auth/useAuth'
import { confirm } from '@/shared/lib/confirm'
import { errorMessage } from '@/shared/lib/errors'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import {
  type DisciplinaResumen,
  type Gravedad,
  type ParteDisciplinario,
  useCrearParte,
  useDisciplinaPartesMes,
  useDisciplinaResumenMes,
  useEliminarParte,
} from '../lib/disciplina-queries'

const REGLA = '3 leves = 1 grave · 3 graves = 1 falta · cada falta descuenta 100 € de ese mes.'

export function DisciplinaView({ modoEmpleado = false }: { modoEmpleado?: boolean }) {
  const { profile } = useAuth()
  const canManage = !modoEmpleado && (profile?.role === 'admin_full' || profile?.role === 'admin_op')
  const [mes, setMes] = useState(() => startOfMonth(new Date()))
  const [crearOpen, setCrearOpen] = useState(false)
  const [abierto, setAbierto] = useState<string | null>(null)

  const mesISO = format(mes, 'yyyy-MM-dd')
  const isCurrentMonth = mesISO === format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const resumen = useDisciplinaResumenMes(mesISO)
  const partes = useDisciplinaPartesMes(mesISO)
  const eliminar = useEliminarParte()

  const filas = resumen.data ?? []
  const partesPorEmpleado = useMemo(() => {
    const mapa = new Map<string, ParteDisciplinario[]>()
    for (const parte of partes.data ?? []) {
      const lista = mapa.get(parte.empleado_id)
      if (lista) lista.push(parte)
      else mapa.set(parte.empleado_id, [parte])
    }
    return mapa
  }, [partes.data])

  const descuentoTotal = filas.reduce((sum, fila) => sum + Number(fila.descuento), 0)
  const sancionados = filas.filter(fila => fila.faltas > 0).length

  const handleDelete = async (parte: ParteDisciplinario, nombre: string) => {
    const ok = await confirm({
      title: '¿Eliminar este parte?',
      description: `${nombre} · ${parte.gravedad === 'grave' ? 'Grave' : 'Leve'} · ${parte.motivo}`,
      confirmLabel: 'Eliminar parte',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await eliminar.mutateAsync(parte.id)
      toast({ title: 'Parte eliminado', variant: 'success' })
    } catch (error) {
      toast({ title: 'No se pudo eliminar', description: errorMessage(error), variant: 'error' })
    }
  }

  return (
    <div className={modoEmpleado ? 'mx-auto max-w-3xl px-4 py-5 pb-28 md:px-6 md:py-8' : 'px-4 py-5 md:px-6'}>
      <section className="ao-card overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-[var(--radius)] bg-amber-500/10 text-amber-400">
              <ShieldAlert className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink)]">Disciplina</h2>
              <p className="text-[11px] text-[var(--ink-mute)]">{REGLA}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!modoEmpleado && (
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-wider text-[var(--ink-mute)]">Descuento del mes</div>
                <div className={`font-display text-base font-bold tabular-nums ${descuentoTotal > 0 ? 'text-red-400' : 'text-[var(--ink-dim)]'}`}>
                  {euros(descuentoTotal)}
                </div>
              </div>
            )}
            {canManage && (
              <Button size="sm" onClick={() => setCrearOpen(true)} disabled={filas.length === 0}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Añadir parte
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] bg-white/[.015] px-4 py-2">
          <Button size="sm" variant="ghost" onClick={() => setMes(v => subMonths(v, 1))} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-semibold capitalize text-[var(--ink-dim)]">
            {format(mes, 'LLLL yyyy', { locale: es })}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMes(v => addMonths(v, 1))}
            disabled={isCurrentMonth}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {!modoEmpleado && sancionados > 0 && (
          <div className="flex items-start gap-2 border-b border-[var(--line)] bg-red-500/[.07] px-4 py-2.5 text-xs text-red-400">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
            <span>
              {sancionados === 1 ? '1 trabajador acumula falta' : `${sancionados} trabajadores acumulan falta`} este mes.
              Descuento total a aplicar en nómina: <strong className="tabular-nums">{euros(descuentoTotal)}</strong>.
            </span>
          </div>
        )}

        {resumen.isLoading && (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-[var(--ink-mute)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando disciplina…
          </div>
        )}

        {resumen.isError && (
          <p className="px-4 py-8 text-center text-sm text-red-400">
            No se pudo cargar: {errorMessage(resumen.error)}
          </p>
        )}

        {!resumen.isLoading && !resumen.isError && filas.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-[var(--ink-mute)]">
            No hay trabajadores activos que mostrar.
          </p>
        )}

        {filas.length > 0 && (
          <ul className="divide-y divide-[var(--line)]">
            {filas.map(fila => (
              <FilaTrabajador
                key={fila.empleado_id}
                fila={fila}
                partes={partesPorEmpleado.get(fila.empleado_id) ?? []}
                abierto={modoEmpleado || abierto === fila.empleado_id}
                onToggle={() => setAbierto(prev => (prev === fila.empleado_id ? null : fila.empleado_id))}
                plegable={!modoEmpleado}
                canManage={canManage}
                onEliminar={parte => handleDelete(parte, fila.nombre)}
                eliminando={eliminar.isPending}
              />
            ))}
          </ul>
        )}
      </section>

      {crearOpen && (
        <CrearParteModal
          empleados={filas.map(({ empleado_id, nombre }) => ({ id: empleado_id, nombre }))}
          onClose={() => setCrearOpen(false)}
        />
      )}
    </div>
  )
}

function FilaTrabajador({
  fila, partes, abierto, onToggle, plegable, canManage, onEliminar, eliminando,
}: {
  fila: DisciplinaResumen
  partes: ParteDisciplinario[]
  abierto: boolean
  onToggle: () => void
  plegable: boolean
  canManage: boolean
  onEliminar: (parte: ParteDisciplinario) => void
  eliminando: boolean
}) {
  const sancionado = fila.faltas > 0

  return (
    <li>
      <div
        className={`flex flex-wrap items-center gap-3 px-4 py-3 ${plegable ? 'cursor-pointer hover:bg-white/[.02]' : ''}`}
        onClick={plegable ? onToggle : undefined}
        role={plegable ? 'button' : undefined}
        tabIndex={plegable ? 0 : undefined}
        onKeyDown={plegable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } } : undefined}
        aria-expanded={plegable ? abierto : undefined}
      >
        {plegable && (
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-mute)] transition-transform ${abierto ? '' : '-rotate-90'}`} />
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ink)]">{fila.nombre}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          <Contador label="Leves" valor={fila.leves} tono={fila.leves > 0 ? 'amber' : 'mute'} />
          <Contador
            label="Graves"
            valor={fila.graves_totales}
            tono={fila.graves_totales > 0 ? 'red' : 'mute'}
            detalle={fila.graves_por_leves > 0 ? `${fila.graves_directos} + ${fila.graves_por_leves} por leves` : undefined}
          />
          {sancionado && (
            <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-bold text-red-400">
              {fila.faltas === 1 ? '1 falta' : `${fila.faltas} faltas`} · −{euros(Number(fila.descuento))}
            </span>
          )}
        </div>
      </div>

      <p className="px-4 pb-2 text-[11px] text-[var(--ink-mute)]">
        {fila.leves_para_grave === 3 && fila.leves === 0
          ? 'Sin leves este mes.'
          : `${fila.leves_para_grave} leve${fila.leves_para_grave === 1 ? '' : 's'} más → 1 grave.`}
        {' · '}
        {`${fila.graves_para_falta} grave${fila.graves_para_falta === 1 ? '' : 's'} más → falta de ${euros(Number(fila.importe_falta))}.`}
      </p>

      {abierto && (
        <div className="border-t border-[var(--line)] bg-white/[.015] px-4 py-2">
          {partes.length === 0 ? (
            <p className="py-3 text-center text-xs text-[var(--ink-mute)]">Sin partes registrados este mes.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {partes.map(parte => (
                <li key={parte.id} className="flex items-start gap-3 py-2.5 text-sm">
                  <span className="w-16 shrink-0 pt-0.5 text-xs text-[var(--ink-mute)]">
                    {format(parseISO(parte.fecha), 'd MMM', { locale: es })}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      parte.gravedad === 'grave'
                        ? 'bg-red-500/15 text-red-400'
                        : 'bg-amber-500/15 text-amber-400'
                    }`}
                  >
                    {parte.gravedad}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words text-[var(--ink)]">{parte.motivo}</p>
                    {parte.nota && (
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-[var(--ink-dim)]">{parte.nota}</p>
                    )}
                  </div>
                  {canManage ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onEliminar(parte)}
                      disabled={eliminando}
                      className="h-8 w-8 shrink-0 p-0 text-[var(--ink-mute)] hover:bg-red-500/10 hover:text-red-400"
                      aria-label="Eliminar parte"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : <span className="w-8 shrink-0" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

function Contador({
  label, valor, tono, detalle,
}: {
  label: string
  valor: number
  tono: 'amber' | 'red' | 'mute'
  detalle?: string
}) {
  const clases = tono === 'red'
    ? 'bg-red-500/10 text-red-400'
    : tono === 'amber'
      ? 'bg-amber-500/10 text-amber-400'
      : 'bg-white/[.04] text-[var(--ink-mute)]'
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${clases}`} title={detalle}>
      {label} <span className="tabular-nums">{valor}</span>
      {detalle && <span className="ml-1 font-normal opacity-80">({detalle})</span>}
    </span>
  )
}

function CrearParteModal({
  empleados, onClose,
}: {
  empleados: Array<{ id: string; nombre: string }>
  onClose: () => void
}) {
  const [empleadoId, setEmpleadoId] = useState(empleados[0]?.id ?? '')
  const [fecha, setFecha] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [gravedad, setGravedad] = useState<Gravedad>('leve')
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const crear = useCrearParte()

  const valido = !!empleadoId && !!fecha && motivo.trim().length > 0

  const handleSubmit = async () => {
    if (!valido) return
    try {
      await crear.mutateAsync({ empleadoId, fecha, gravedad, motivo, nota })
      toast({ title: gravedad === 'grave' ? 'Parte grave registrado' : 'Parte leve registrado', variant: 'success' })
      onClose()
    } catch (error) {
      toast({ title: 'No se pudo registrar', description: errorMessage(error), variant: 'error' })
    }
  }

  return (
    <Modal onClose={onClose} size="sm" ariaLabel="Añadir parte disciplinario">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--ink)]">Nuevo parte</h2>
          <p className="text-xs text-[var(--ink-mute)]">{REGLA}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3 p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--ink-dim)]">Trabajador</span>
          <select
            value={empleadoId}
            onChange={e => setEmpleadoId(e.target.value)}
            className="h-10 w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--mint)]"
          >
            {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </label>

        <div>
          <span className="mb-1 block text-xs font-semibold text-[var(--ink-dim)]">Gravedad</span>
          <div className="grid grid-cols-2 gap-2">
            {(['leve', 'grave'] as const).map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGravedad(g)}
                aria-pressed={gravedad === g}
                className={`h-10 rounded-[var(--radius)] border text-sm font-semibold capitalize transition-colors ${
                  gravedad === g
                    ? g === 'grave'
                      ? 'border-red-400 bg-red-500/15 text-red-400'
                      : 'border-amber-400 bg-amber-500/15 text-amber-400'
                    : 'border-[var(--line)] bg-white/[.02] text-[var(--ink-dim)] hover:text-[var(--ink)]'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--ink-dim)]">Fecha</span>
          <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--ink-dim)]">Motivo</span>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={3}
            placeholder="Qué ha pasado. Ej. Llega 25 min tarde sin avisar."
            className="w-full resize-y rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--mint)]"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--ink-dim)]">Nota interna (opcional)</span>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            rows={2}
            placeholder="Contexto, testigos, acuerdo alcanzado…"
            className="w-full resize-y rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--mint)]"
          />
        </label>
      </div>

      <div className="flex justify-end gap-2 border-t border-[var(--line)] px-4 py-3">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={!valido || crear.isPending}>
          {crear.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Guardar parte
        </Button>
      </div>
    </Modal>
  )
}
