import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, Plus } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { toast } from '@/shared/lib/toast'
import {
  useActualizarEstadoIncidencia,
  useClientesIncidencias,
  useCrearIncidencia,
  useIncidencias,
  usePuedeGestionarIncidencias,
  type Incidencia,
  type IncidenciaEstado,
  type IncidenciaTipo,
} from '../lib/incidencias-queries'

const TIPOS: Array<{ k: IncidenciaTipo; l: string }> = [
  { k: 'incidencia', l: 'Incidencia' },
  { k: 'falta', l: 'Falta' },
  { k: 'abono', l: 'Abono' },
  { k: 'otro', l: 'Otro' },
]

const TIPO_COLOR: Record<IncidenciaTipo, string> = {
  incidencia: 'bg-[oklch(89%_.1_45_/_0.8)] text-[oklch(38%_.12_45)] dark:bg-[oklch(30%_.09_45_/_0.45)] dark:text-[oklch(80%_.13_45)]',
  falta: 'bg-[oklch(89%_.11_25_/_0.8)] text-[oklch(40%_.14_25)] dark:bg-[oklch(30%_.1_25_/_0.45)] dark:text-[oklch(80%_.14_25)]',
  abono: 'bg-[oklch(90%_.1_250_/_0.7)] text-[oklch(42%_.13_255)] dark:bg-[oklch(30%_.09_255_/_0.45)] dark:text-[oklch(80%_.12_255)]',
  otro: 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)]',
}

const FILTROS: Array<{ k: IncidenciaEstado | 'todas'; l: string }> = [
  { k: 'pendiente', l: 'Pendientes' },
  { k: 'en_proceso', l: 'En proceso' },
  { k: 'resuelta', l: 'Resueltas' },
  { k: 'todas', l: 'Todas' },
]

export function IncidenciasView({ autorEmpleadoId }: { autorEmpleadoId: string | null }) {
  const [filtro, setFiltro] = useState<IncidenciaEstado | 'todas'>('pendiente')
  const [showForm, setShowForm] = useState(false)
  const { data: incidencias, isLoading } = useIncidencias(filtro)
  const { data: puedeGestionar } = usePuedeGestionarIncidencias()

  return (
    <div className="ao-page py-5 pb-28 md:py-7">
      <header className="mb-4 flex items-start justify-between gap-3 border-b border-[var(--line)] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Trabajadores</p>
          <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">Incidencias</h1>
          <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">Faltas, abonos e incidencias por cliente. Seguimiento del equipo.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nueva
        </button>
      </header>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map(f => (
          <button
            key={f.k}
            type="button"
            onClick={() => setFiltro(f.k)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtro === f.k
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)] hover:bg-[var(--color-primary-soft)]'
            }`}
          >
            {f.l}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-[var(--color-ink-3)]">Cargando…</p>
      ) : (incidencias ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-10 text-center">
          <ClipboardList className="mx-auto mb-2 h-6 w-6 text-[var(--color-ink-3)]" />
          <p className="text-sm text-[var(--color-ink-3)]">No hay incidencias en este filtro.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {(incidencias ?? []).map(inc => (
            <IncidenciaCard key={inc.id} inc={inc} puedeGestionar={!!puedeGestionar} />
          ))}
        </div>
      )}

      {showForm && <NuevaIncidenciaModal autorEmpleadoId={autorEmpleadoId} onClose={() => setShowForm(false)} />}
    </div>
  )
}

function IncidenciaCard({ inc, puedeGestionar }: { inc: Incidencia; puedeGestionar: boolean }) {
  const [resolviendo, setResolviendo] = useState(false)
  const [nota, setNota] = useState('')
  const actualizar = useActualizarEstadoIncidencia()

  const cambiarEstado = (estado: IncidenciaEstado, resolucion_nota?: string | null) => {
    actualizar.mutate(
      { id: inc.id, estado, resolucion_nota },
      {
        onSuccess: () => {
          setResolviendo(false)
          setNota('')
          toast({ variant: 'success', title: estado === 'resuelta' ? 'Incidencia resuelta' : 'Estado actualizado' })
        },
        onError: () => toast({ variant: 'error', title: 'No se pudo actualizar' }),
      },
    )
  }

  return (
    <section className="ao-card p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TIPO_COLOR[inc.tipo]}`}>{inc.tipo}</span>
        <span className="text-sm font-semibold text-[var(--color-ink)]">{inc.contact_name_canon}</span>
        <span className="text-xs text-[var(--color-ink-3)]">· {format(new Date(inc.fecha), "d 'de' LLLL", { locale: es })}</span>
        {inc.estado === 'resuelta' && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-[oklch(45%_.12_150)] dark:text-[oklch(78%_.14_150)]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Resuelta
          </span>
        )}
        {inc.estado === 'en_proceso' && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-primary-2)]">
            <Loader2 className="h-3.5 w-3.5" /> En proceso
          </span>
        )}
        {inc.estado === 'pendiente' && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-[oklch(50%_.13_45)] dark:text-[oklch(78%_.13_45)]">
            <AlertTriangle className="h-3.5 w-3.5" /> Pendiente
          </span>
        )}
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-ink)]">{inc.descripcion}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-ink-3)]">
        {inc.autor_nombre && <span>Anotada por {inc.autor_nombre}</span>}
        {inc.resolucion_nota && <span className="text-[var(--color-ink-2)]">· Resolución: {inc.resolucion_nota}</span>}
      </div>

      {puedeGestionar && inc.estado !== 'resuelta' && (
        <div className="mt-3 border-t border-[var(--line)] pt-3">
          {resolviendo ? (
            <div className="space-y-2">
              <textarea
                value={nota}
                onChange={e => setNota(e.target.value)}
                rows={2}
                placeholder="Nota de resolución (opcional)"
                className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-ink)]"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => cambiarEstado('resuelta', nota.trim() || null)} disabled={actualizar.isPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  <CheckCircle2 className="h-4 w-4" /> Confirmar resuelta
                </button>
                <button type="button" onClick={() => { setResolviendo(false); setNota('') }}
                  className="rounded-md bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-2)]">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {inc.estado === 'pendiente' && (
                <button type="button" onClick={() => cambiarEstado('en_proceso')} disabled={actualizar.isPending}
                  className="rounded-md bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-primary-soft)] disabled:opacity-50">
                  Marcar en proceso
                </button>
              )}
              <button type="button" onClick={() => setResolviendo(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[oklch(90%_.1_150_/_0.6)] px-3 py-1.5 text-xs font-semibold text-[oklch(38%_.12_150)] hover:opacity-90 dark:bg-[oklch(30%_.09_150_/_0.45)] dark:text-[oklch(80%_.14_150)]">
                <CheckCircle2 className="h-4 w-4" /> Resolver
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function NuevaIncidenciaModal({ autorEmpleadoId, onClose }: { autorEmpleadoId: string | null; onClose: () => void }) {
  const { data: clientes } = useClientesIncidencias()
  const crear = useCrearIncidencia()
  const [cliente, setCliente] = useState('')
  const [fecha, setFecha] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [tipo, setTipo] = useState<IncidenciaTipo>('incidencia')
  const [descripcion, setDescripcion] = useState('')

  const nombresValidos = new Set((clientes ?? []).map(c => c.nombre_canon))
  const clienteOk = cliente.trim().length > 0 && nombresValidos.has(cliente.trim())
  const puedeGuardar = clienteOk && descripcion.trim().length > 0

  const guardar = () => {
    if (!puedeGuardar) return
    crear.mutate(
      { contact_name_canon: cliente.trim(), fecha, tipo, descripcion: descripcion.trim(), autor_empleado_id: autorEmpleadoId },
      {
        onSuccess: () => { toast({ variant: 'success', title: 'Incidencia anotada' }); onClose() },
        onError: () => toast({ variant: 'error', title: 'No se pudo guardar' }),
      },
    )
  }

  return (
    <Modal onClose={onClose} size="lg">
      <div className="p-4 md:p-5">
        <h2 className="mb-4 font-display text-lg font-bold text-[var(--color-ink)]">Nueva incidencia</h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-ink-2)]">Cliente</label>
            <input
              list="incidencias-clientes"
              value={cliente}
              onChange={e => setCliente(e.target.value)}
              placeholder="Escribe para buscar…"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]"
            />
            <datalist id="incidencias-clientes">
              {(clientes ?? []).map(c => (
                <option key={c.nombre_canon} value={c.nombre_canon}>{c.poblacion ?? ''}</option>
              ))}
            </datalist>
            {cliente.trim() && !clienteOk && (
              <p className="mt-1 text-[11px] text-[oklch(50%_.14_25)]">Selecciona un cliente de la lista.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--color-ink-2)]">Día</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--color-ink-2)]">Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value as IncidenciaTipo)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]">
                {TIPOS.map(t => <option key={t.k} value={t.k}>{t.l}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-ink-2)]">Descripción</label>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={4}
              placeholder="Qué ha pasado, qué falta, qué abono hay que hacer…"
              className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)]" />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md bg-[var(--color-surface-2)] px-4 py-2 text-sm font-semibold text-[var(--color-ink-2)]">Cancelar</button>
          <button type="button" onClick={guardar} disabled={!puedeGuardar || crear.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {crear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Anotar
          </button>
        </div>
      </div>
    </Modal>
  )
}
