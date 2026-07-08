import { useMemo, useState } from 'react'
import { addMonths, format, startOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Target } from 'lucide-react'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { useMarcarMes, useObjetivosAdmin, useUpdateObjetivo, type ObjetivoAdminRow } from '../lib/objetivos-queries'

const ICON_BTN = 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]'

export function ObjetivosAdminView() {
  const [mesDate, setMesDate] = useState(() => startOfMonth(new Date()))
  const mesISO = format(mesDate, 'yyyy-MM-dd')
  const { data: rows, isLoading } = useObjetivosAdmin(mesISO)

  const totalMes = useMemo(
    () => (rows ?? []).reduce((acc, r) => acc + (r.cumplido ? r.importe : 0), 0),
    [rows],
  )
  const esMesActual = format(startOfMonth(new Date()), 'yyyy-MM-dd') === mesISO

  return (
    <div className="ao-page py-5 md:py-7">
      <header className="mb-5 border-b border-[var(--line)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Trabajadores</p>
        <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">Plus productividad</h1>
        <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
          Objetivo por trabajador. Marca <strong>Cumplido</strong> cada mes para activar su plus.
        </p>
      </header>

      {/* Selector de mes + total */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMesDate(d => subMonths(d, 1))} className={ICON_BTN} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[9rem] text-center text-sm font-semibold capitalize text-[var(--color-ink)]">
            {format(mesDate, 'LLLL yyyy', { locale: es })}
          </span>
          <button
            type="button"
            onClick={() => setMesDate(d => (esMesActual ? d : addMonths(d, 1)))}
            className={`${ICON_BTN} disabled:opacity-40`}
            aria-label="Mes siguiente"
            disabled={esMesActual}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="rounded-lg bg-[var(--color-primary-soft)] px-3 py-1.5 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Plus del mes</div>
          <div className="font-display text-lg font-bold tabular-nums text-[var(--color-primary)]">{euros(totalMes)}</div>
        </div>
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-[var(--color-ink-3)]">Cargando…</p>
      ) : (rows ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-8 text-center text-sm text-[var(--color-ink-3)]">
          No hay objetivos definidos para trabajadores activos.
        </p>
      ) : (
        <div className="space-y-3">
          {(rows ?? []).map(row => (
            <ObjetivoRow key={row.objetivo_id} row={row} mesISO={mesISO} />
          ))}
        </div>
      )}
    </div>
  )
}

function ObjetivoRow({ row, mesISO }: { row: ObjetivoAdminRow; mesISO: string }) {
  const [titulo, setTitulo] = useState(row.titulo)
  const [descripcion, setDescripcion] = useState(row.descripcion ?? '')
  const [importe, setImporte] = useState(String(row.importe))
  const update = useUpdateObjetivo(mesISO)
  const marcar = useMarcarMes(mesISO)

  const guardar = (patch: Parameters<typeof update.mutate>[0]['patch']) => {
    update.mutate(
      { objetivo_id: row.objetivo_id, patch },
      { onError: () => toast({ variant: 'error', title: 'No se pudo guardar' }) },
    )
  }

  const toggleCumplido = () => {
    marcar.mutate(
      { objetivo_id: row.objetivo_id, importe: Number(importe) || 0, cumplido: !row.cumplido },
      {
        onSuccess: () =>
          toast({ variant: 'success', title: !row.cumplido ? `Objetivo cumplido · ${euros(Number(importe) || 0)}` : 'Cumplimiento retirado' }),
        onError: () => toast({ variant: 'error', title: 'No se pudo marcar' }),
      },
    )
  }

  return (
    <section className="ao-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]">
            <Target className="h-4 w-4" />
          </div>
          <div className="text-sm font-semibold text-[var(--color-ink)]">{row.nombre}</div>
        </div>
        <button
          type="button"
          onClick={toggleCumplido}
          disabled={marcar.isPending}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
            row.cumplido
              ? 'bg-[oklch(90%_.1_150_/_0.6)] text-[oklch(38%_.12_150)] dark:bg-[oklch(30%_.09_150_/_0.45)] dark:text-[oklch(80%_.14_150)]'
              : 'bg-[var(--color-surface-2)] text-[var(--color-ink-2)] hover:bg-[var(--color-primary-soft)]'
          }`}
        >
          {row.cumplido ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
          {row.cumplido ? 'Cumplido' : 'Marcar cumplido'}
        </button>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <input
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            onBlur={() => titulo.trim() && titulo !== row.titulo && guardar({ titulo: titulo.trim() })}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-ink)]"
            placeholder="Título del objetivo"
          />
          <textarea
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            onBlur={() => descripcion !== (row.descripcion ?? '') && guardar({ descripcion: descripcion.trim() || null })}
            rows={2}
            className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-ink-2)]"
            placeholder="Descripción (opcional)"
          />
        </div>
        <label className="flex items-center gap-2 self-start md:flex-col md:items-end">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Importe/mes</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.01"
              value={importe}
              onChange={e => setImporte(e.target.value)}
              onBlur={() => Number(importe) !== row.importe && guardar({ importe: Number(importe) || 0 })}
              className="h-9 w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-right text-sm tabular-nums text-[var(--color-ink)]"
            />
            <span className="text-sm text-[var(--color-ink-3)]">€</span>
          </div>
        </label>
      </div>
    </section>
  )
}
