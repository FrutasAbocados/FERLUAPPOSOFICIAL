import { useMemo, useState } from 'react'
import { addMonths, format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Award, ChevronLeft, ChevronRight, Loader2, Plus, Trash2, X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useAuth } from '@/shared/auth/useAuth'
import { confirm } from '@/shared/lib/confirm'
import { errorMessage } from '@/shared/lib/errors'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import {
  type PlusExtra,
  useCrearPlusExtra,
  useEliminarPlusExtra,
  usePlusesExtraMes,
} from '../lib/pluses-extra-queries'

interface EmpleadoOpt {
  id: string
  nombre: string
}

export function PlusesExtraAdminView({ empleados }: { empleados: EmpleadoOpt[] }) {
  const { profile } = useAuth()
  const [mes, setMes] = useState(() => startOfMonth(new Date()))
  const [crearOpen, setCrearOpen] = useState(false)
  const mesISO = format(mes, 'yyyy-MM-dd')
  const isCurrentMonth = mesISO === format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const pluses = usePlusesExtraMes(mesISO)
  const eliminar = useEliminarPlusExtra()
  const canManage = profile?.role === 'admin_full' || profile?.role === 'admin_op'
  const empleadosById = useMemo(
    () => new Map(empleados.map((empleado) => [empleado.id, empleado.nombre])),
    [empleados],
  )
  const total = (pluses.data ?? []).reduce((sum, plus) => sum + plus.importe, 0)

  const handleDelete = async (plus: PlusExtra) => {
    const ok = await confirm({
      title: '¿Eliminar este plus?',
      description: `${empleadosById.get(plus.empleado_id) ?? 'Trabajador'} · ${euros(plus.importe)} · ${plus.concepto}`,
      confirmLabel: 'Eliminar plus',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await eliminar.mutateAsync(plus.id)
      toast({ title: 'Plus eliminado', variant: 'success' })
    } catch (error) {
      toast({ title: 'No se pudo eliminar', description: errorMessage(error), variant: 'error' })
    }
  }

  return (
    <section className="ao-card mb-5 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-[var(--radius)] bg-[var(--mint-glow)] text-[var(--mint)]">
            <Award className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">Pluses extraordinarios</h2>
            <p className="text-[11px] text-[var(--ink-mute)]">Reconocimientos puntuales, separados de comisiones y nómina fija.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-wider text-[var(--ink-mute)]">Total del mes</div>
            <div className="font-display text-base font-bold tabular-nums text-[var(--mint)]">{euros(total)}</div>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setCrearOpen(true)} disabled={empleados.length === 0}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Añadir plus
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] bg-white/[.015] px-4 py-2">
        <Button size="sm" variant="ghost" onClick={() => setMes((value) => subMonths(value, 1))} aria-label="Mes anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-semibold capitalize text-[var(--ink-dim)]">
          {format(mes, 'LLLL yyyy', { locale: es })}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMes((value) => addMonths(value, 1))}
          disabled={isCurrentMonth}
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {pluses.isLoading && (
        <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-[var(--ink-mute)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando pluses…
        </div>
      )}
      {!pluses.isLoading && (pluses.data?.length ?? 0) === 0 && (
        <p className="px-4 py-8 text-center text-sm text-[var(--ink-mute)]">No hay pluses extraordinarios en este mes.</p>
      )}
      {(pluses.data?.length ?? 0) > 0 && (
        <ul className="divide-y divide-[var(--line)]">
          {pluses.data?.map((plus) => (
            <li key={plus.id} className="grid grid-cols-[76px_1fr_auto_auto] items-center gap-3 px-4 py-3 text-sm">
              <span className="text-xs text-[var(--ink-mute)]">{format(parseISO(plus.fecha), 'd MMM', { locale: es })}</span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--ink)]">{empleadosById.get(plus.empleado_id) ?? 'Trabajador'}</p>
                <p className="truncate text-xs text-[var(--ink-dim)]">{plus.concepto}</p>
              </div>
              <span className="font-display text-base font-bold tabular-nums text-[var(--mint)]">{euros(plus.importe)}</span>
              {canManage ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(plus)}
                  disabled={eliminar.isPending}
                  className="h-8 w-8 p-0 text-[var(--ink-mute)] hover:bg-red-500/10 hover:text-red-400"
                  aria-label="Eliminar plus"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : <span className="w-8" />}
            </li>
          ))}
        </ul>
      )}

      {crearOpen && (
        <CrearPlusModal empleados={empleados} onClose={() => setCrearOpen(false)} />
      )}
    </section>
  )
}

function CrearPlusModal({ empleados, onClose }: { empleados: EmpleadoOpt[]; onClose: () => void }) {
  const [empleadoId, setEmpleadoId] = useState(empleados[0]?.id ?? '')
  const [fecha, setFecha] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [importe, setImporte] = useState('')
  const [concepto, setConcepto] = useState('')
  const crear = useCrearPlusExtra()
  const importeNum = Number(importe)

  const handleSubmit = async () => {
    if (!empleadoId || !fecha || !Number.isFinite(importeNum) || importeNum <= 0 || !concepto.trim()) return
    try {
      await crear.mutateAsync({ empleadoId, fecha, importe: importeNum, concepto })
      toast({ title: 'Plus extraordinario añadido', variant: 'success' })
      onClose()
    } catch (error) {
      toast({ title: 'No se pudo añadir', description: errorMessage(error), variant: 'error' })
    }
  }

  return (
    <Modal onClose={onClose} size="sm" ariaLabel="Añadir plus extraordinario">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--ink)]">Nuevo plus extraordinario</h2>
          <p className="text-xs text-[var(--ink-mute)]">Registra el reconocimiento y el motivo.</p>
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
            onChange={(event) => setEmpleadoId(event.target.value)}
            className="h-10 w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--mint)]"
          >
            {empleados.map((empleado) => <option key={empleado.id} value={empleado.id}>{empleado.nombre}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="mb-1 block text-xs font-semibold text-[var(--ink-dim)]">Fecha</span>
            <Input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-[var(--ink-dim)]">Importe</span>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={importe}
              onChange={(event) => setImporte(event.target.value)}
              placeholder="50,00"
              className="tabular-nums"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-[var(--ink-dim)]">Motivo</span>
          <Input value={concepto} onChange={(event) => setConcepto(event.target.value)} placeholder="Ej. Reconocimiento por su buen trabajo" />
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--line)] px-4 py-3">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button
          onClick={handleSubmit}
          disabled={!empleadoId || !fecha || importeNum <= 0 || !concepto.trim() || crear.isPending}
        >
          {crear.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Guardar plus
        </Button>
      </div>
    </Modal>
  )
}
