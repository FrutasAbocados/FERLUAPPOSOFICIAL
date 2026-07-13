import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Loader2, Plus, Receipt, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { confirm } from '@/shared/lib/confirm'
import { toast } from '@/shared/lib/toast'
import { supabase } from '@/shared/lib/supabase'
import { euros, fmtDate } from '../lib/format'
import {
  useActualizarJornada,
  useBorrarJornada,
  useBuscarContactos,
  useCrearJornada,
  useEmpleadosActivos,
  useGuardarGastos,
  useGuardarLineas,
  useJornadaGastos,
  useJornadaLineas,
  useRevisarCierre,
} from '../lib/repartos-queries'
import type {
  ContactoOpt,
  FormaPago,
  GastoInput,
  GastoTipo,
  Jornada,
  JornadaGasto,
  JornadaLinea,
  LineaInput,
} from '../lib/repartos-types'

type LineaUI = LineaInput & { _key: string; _loading?: boolean }
type GastoUI = { _key: string; tipo: GastoTipo; concepto: string; importe: number | '' }

const GASTO_TIPOS: { tipo: GastoTipo; label: string }[] = [
  { tipo: 'gasolina', label: '⛽ Gasolina' },
  { tipo: 'compras', label: '🛒 Compras' },
  { tipo: 'incidencia', label: '⚠️ Incidencia' },
]

type Props = {
  fecha: string
  jornada: Jornada | null
  onClose: () => void
  empleadoIdInicial?: string
}

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export function JornadaModal({ fecha, jornada, onClose, empleadoIdInicial }: Props) {
  // Para edición, esperamos a tener las líneas antes de montar el form.
  // Así el form usa useState lazy y no necesita useEffect de hidratación.
  const lineasExistentes = useJornadaLineas(jornada?.id ?? null)
  const gastosExistentes = useJornadaGastos(jornada?.id ?? null)

  if (
    jornada &&
    (lineasExistentes.isLoading || !lineasExistentes.data || gastosExistentes.isLoading || !gastosExistentes.data)
  ) {
    return (
      <ModalShell onClose={onClose} fecha={fecha} title="Editar jornada">
        <div className="flex items-center justify-center gap-2 p-12 text-sm text-[var(--color-ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando jornada…
        </div>
      </ModalShell>
    )
  }

  const initialLineas: JornadaLinea[] = jornada ? lineasExistentes.data ?? [] : []
  const initialGastos: JornadaGasto[] = jornada ? gastosExistentes.data ?? [] : []

  return (
    <JornadaForm
      key={jornada?.id ?? `nueva-${fecha}-${empleadoIdInicial ?? ''}`}
      fecha={fecha}
      jornada={jornada}
      initialLineas={initialLineas}
      initialGastos={initialGastos}
      onClose={onClose}
      empleadoIdInicial={empleadoIdInicial}
    />
  )
}

function JornadaForm({
  fecha,
  jornada,
  initialLineas,
  initialGastos,
  onClose,
  empleadoIdInicial,
}: Props & { initialLineas: JornadaLinea[]; initialGastos: JornadaGasto[] }) {
  const empleados = useEmpleadosActivos()

  const crear = useCrearJornada()
  const actualizar = useActualizarJornada()
  const borrar = useBorrarJornada()
  const guardarLineas = useGuardarLineas()
  const guardarGastos = useGuardarGastos()
  const revisar = useRevisarCierre()
  const esEmpleado = jornada?.origen === 'empleado'

  const [empleadoId, setEmpleadoId] = useState<string>(jornada?.empleado_id ?? empleadoIdInicial ?? '')
  const [horaInicio, setHoraInicio] = useState<string>(jornada?.hora_inicio?.slice(0, 5) ?? '')
  const [horaFin, setHoraFin] = useState<string>(jornada?.hora_fin?.slice(0, 5) ?? '')
  const [notas, setNotas] = useState<string>(jornada?.notas ?? '')
  const [lineas, setLineas] = useState<LineaUI[]>(() =>
    initialLineas.map((l) => ({
      _key: l.id,
      contact_id: l.contact_id,
      contact_nombre: l.contact_nombre,
      importe: Number(l.importe),
      forma_pago: l.forma_pago,
      orden: l.orden,
    })),
  )
  const [gastos, setGastos] = useState<GastoUI[]>(() =>
    initialGastos.map((g) => ({
      _key: g.id,
      tipo: g.tipo,
      concepto: g.concepto,
      importe: Number(g.importe),
    })),
  )

  const gastosPayload = (): GastoInput[] =>
    gastos
      .filter((g) => Number(g.importe || 0) > 0)
      .map((g, i) => ({
        tipo: g.tipo,
        concepto: g.concepto.trim(),
        importe: g.importe === '' ? 0 : Number(g.importe),
        orden: i,
      }))

  const totalGastos = gastos.reduce((s, g) => s + (g.importe === '' ? 0 : Number(g.importe)), 0)

  const addGasto = () =>
    setGastos((p) => [...p, { _key: newKey(), tipo: 'gasolina', concepto: '', importe: '' }])

  const addLinea = async (c: ContactoOpt) => {
    const key = newKey()
    setLineas((prev) => [
      ...prev,
      {
        _key: key,
        contact_id: c.id,
        contact_nombre: c.nombre,
        importe: 0,
        forma_pago: 'efectivo',
        orden: prev.length,
        _loading: true,
      },
    ])
    const { data, error } = await supabase
      .from('manager_facturas')
      .select('total')
      .eq('tipo', 'VENTA')
      .eq('contact_id', c.id)
      .in('subtipo', ['waybill', 'invoice', 'salesreceipt'])
      .order('fecha', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1)
    const importe = error ? 0 : Number(data?.[0]?.total ?? 0)
    setLineas((prev) =>
      prev.map((l) => (l._key === key ? { ...l, importe, _loading: false } : l)),
    )
  }

  const updLinea = (key: string, patch: Partial<LineaInput>) => {
    setLineas((prev) => prev.map((l) => (l._key === key ? { ...l, ...patch } : l)))
  }

  const delLinea = (key: string) => {
    setLineas((prev) => prev.filter((l) => l._key !== key))
  }

  const totales = useMemo(() => {
    const total = lineas.reduce((s, l) => s + Number(l.importe || 0), 0)
    const efectivo = lineas
      .filter((l) => l.forma_pago === 'efectivo')
      .reduce((s, l) => s + Number(l.importe || 0), 0)
    const tarjeta = lineas
      .filter((l) => l.forma_pago === 'tarjeta')
      .reduce((s, l) => s + Number(l.importe || 0), 0)
    const deuda = lineas
      .filter((l) => l.forma_pago === 'deuda')
      .reduce((s, l) => s + Number(l.importe || 0), 0)
    return { total, efectivo, tarjeta, deuda, count: lineas.length }
  }, [lineas])

  const duracion = useMemo(() => {
    if (!horaInicio || !horaFin) return null
    const [h1, m1] = horaInicio.split(':').map(Number)
    const [h2, m2] = horaFin.split(':').map(Number)
    if ([h1, m1, h2, m2].some(Number.isNaN)) return null
    const mins = h2 * 60 + m2 - (h1 * 60 + m1)
    if (mins <= 0) return null
    const hh = Math.floor(mins / 60)
    const mm = mins % 60
    return `${hh}h${mm > 0 ? ` ${mm}min` : ''}`
  }, [horaInicio, horaFin])

  const guardando =
    crear.isPending ||
    actualizar.isPending ||
    guardarLineas.isPending ||
    guardarGastos.isPending ||
    borrar.isPending ||
    revisar.isPending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!empleadoId) return
    const payload = {
      fecha,
      empleado_id: empleadoId,
      hora_inicio: horaInicio || null,
      hora_fin: horaFin || null,
      notas: notas.trim() || null,
    }
    try {
      let id = jornada?.id
      if (id) {
        await actualizar.mutateAsync({ id, ...payload })
      } else {
        const nueva = await crear.mutateAsync(payload)
        id = nueva.id
      }
      await guardarLineas.mutateAsync({
        jornadaId: id,
        lineas: lineas.map((l, i) => ({
          contact_id: l.contact_id,
          contact_nombre: l.contact_nombre,
          importe: l.importe,
          forma_pago: l.forma_pago,
          orden: i,
        })),
      })
      await guardarGastos.mutateAsync({ jornadaId: id, gastos: gastosPayload() })
      onClose()
    } catch (err) {
      toast({ title: 'No se pudo guardar la jornada', description: err instanceof Error ? err.message : '', variant: 'error' })
    }
  }

  const onAprobar = async () => {
    if (!jornada) return
    const ok = await confirm({
      title: '¿Aprobar el cierre del repartidor?',
      description: 'Se marcará como revisado. El repartidor ya no podrá modificarlo.',
      confirmLabel: 'Aprobar',
    })
    if (!ok) return
    try {
      // Guardar primero cualquier corrección de líneas hecha por admin
      await actualizar.mutateAsync({
        id: jornada.id,
        fecha,
        empleado_id: empleadoId,
        hora_inicio: horaInicio || null,
        hora_fin: horaFin || null,
        notas: notas.trim() || null,
      })
      await guardarLineas.mutateAsync({
        jornadaId: jornada.id,
        lineas: lineas.map((l, i) => ({
          contact_id: l.contact_id,
          contact_nombre: l.contact_nombre,
          importe: l.importe,
          forma_pago: l.forma_pago,
          orden: i,
        })),
      })
      await guardarGastos.mutateAsync({ jornadaId: jornada.id, gastos: gastosPayload() })
      await revisar.mutateAsync(jornada.id)
      toast({ title: '✅ Cierre aprobado', description: 'Jornada marcada como revisada.', variant: 'success' })
      onClose()
    } catch (err) {
      toast({ title: 'No se pudo aprobar el cierre', description: err instanceof Error ? err.message : '', variant: 'error' })
    }
  }

  const onBorrar = async () => {
    if (!jornada) return
    const ok = await confirm({
      title: '¿Eliminar la jornada del repartidor?',
      description: 'Se borrarán todas las líneas asociadas. No se puede deshacer.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await borrar.mutateAsync(jornada.id)
      onClose()
    } catch (err) {
      toast({ title: 'No se pudo eliminar la jornada', description: err instanceof Error ? err.message : '', variant: 'error' })
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      fecha={fecha}
      title={jornada ? 'Editar jornada' : 'Nueva jornada'}
    >
      <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                Repartidor
              </label>
              <select
                required
                value={empleadoId}
                onChange={(e) => setEmpleadoId(e.target.value)}
                className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-primary)]"
              >
                <option value="">— Selecciona —</option>
                {(empleados.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                Hora inicio
              </label>
              <Input
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                Hora fin
              </label>
              <Input
                type="time"
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                Repartos ({lineas.length})
              </h3>
            </div>

            <ClienteBuscador onSelect={addLinea} />

            {lineas.length === 0 ? (
              <p className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[rgba(255,255,255,.025)] p-4 text-center text-xs text-[var(--color-ink-3)]">
                Busca un cliente arriba para añadir el primer reparto.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
                {lineas.map((l) => (
                  <li
                    key={l._key}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-3 py-2 text-sm"
                  >
                    <span className="truncate font-medium text-[var(--color-ink)]">
                      {l.contact_nombre}
                    </span>
                    {l._loading ? (
                      <div className="flex h-8 w-24 items-center justify-center">
                        <Loader2 className="h-3 w-3 animate-spin text-[var(--color-ink-3)]" />
                      </div>
                    ) : (
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.importe || ''}
                        onChange={(ev) =>
                          updLinea(l._key, { importe: Number(ev.target.value) })
                        }
                        placeholder="0,00"
                        className="h-8 w-24 text-right"
                      />
                    )}
                    <select
                      value={l.forma_pago}
                      onChange={(ev) =>
                        updLinea(l._key, {
                          forma_pago: ev.target.value as FormaPago,
                        })
                      }
                      className="h-8 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-ink)] outline-none"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="deuda">Deuda</option>
                    </select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => delLinea(l._key)}
                      aria-label="Quitar reparto"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                <Receipt className="h-3.5 w-3.5" /> Gastos ({gastos.length})
              </h3>
              {totalGastos > 0 && (
                <span className="text-xs font-semibold tabular-nums text-[var(--coral)]">−{euros(totalGastos)}</span>
              )}
            </div>
            {gastos.length === 0 ? (
              <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[rgba(255,255,255,.025)] p-4 text-center text-xs text-[var(--color-ink-3)]">
                Sin gastos. Pulsa “Añadir gasto” si el repartidor pagó algo de la caja.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
                {gastos.map((g) => (
                  <li key={g._key} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-3 py-2 text-sm">
                    <select
                      value={g.tipo}
                      onChange={(ev) =>
                        setGastos((p) => p.map((x) => (x._key === g._key ? { ...x, tipo: ev.target.value as GastoTipo } : x)))
                      }
                      className="h-8 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-ink)] outline-none"
                    >
                      {GASTO_TIPOS.map((t) => (
                        <option key={t.tipo} value={t.tipo}>{t.label}</option>
                      ))}
                    </select>
                    <Input
                      value={g.concepto}
                      onChange={(ev) =>
                        setGastos((p) => p.map((x) => (x._key === g._key ? { ...x, concepto: ev.target.value } : x)))
                      }
                      placeholder="Concepto"
                      className="h-8"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={g.importe === '' ? '' : g.importe}
                      onChange={(ev) =>
                        setGastos((p) => p.map((x) => (x._key === g._key ? { ...x, importe: ev.target.value === '' ? '' : Number(ev.target.value) } : x)))
                      }
                      placeholder="0,00"
                      className="h-8 w-24 text-right"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setGastos((p) => p.filter((x) => x._key !== g._key))} aria-label="Quitar gasto">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button type="button" variant="ghost" onClick={addGasto} className="mt-2 w-full border border-dashed border-[var(--color-border)]">
              <Plus className="mr-1 h-4 w-4" /> Añadir gasto
            </Button>
            <p className="mt-1.5 text-[11px] text-[var(--color-ink-3)]">
              Al aprobar el cierre, los gastos se registran como salida en Tesorería y en el módulo Gastos.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
              Notas {esEmpleado && <span className="ml-1 normal-case text-[var(--color-ink-3)]">(del repartidor)</span>}
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={4}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base leading-relaxed text-[var(--color-ink)] outline-none transition-colors focus-visible:border-[var(--color-primary)]"
              placeholder="Incidencias, devoluciones, etc."
            />
          </div>
        </div>

        <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <Total label="Repartos" value={String(totales.count)} />
            <Total label="Total" value={euros(totales.total)} />
            <Total label="Tarjeta" value={euros(totales.tarjeta)} />
            <Total label="Deuda" value={euros(totales.deuda)} />
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 border-t border-[var(--color-border)] pt-3 text-xs md:grid-cols-4">
            <Total label="Efectivo bruto" value={euros(totales.efectivo)} />
            <Total label="Gastos" value={totalGastos > 0 ? `−${euros(totalGastos)}` : euros(0)} tone="danger" />
            <Total label="Efectivo neto" value={euros(totales.efectivo - totalGastos)} tone="success" />
            <Total label="Duración" value={duracion ?? '—'} />
          </div>
          <div className="flex items-center justify-between gap-2">
            {jornada ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onBorrar}
                disabled={guardando}
                className="text-[var(--color-danger)]"
              >
                Eliminar
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando || !empleadoId}>
                {guardando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Guardar
              </Button>
              {esEmpleado && !jornada?.revisado && (
                <Button type="button" onClick={onAprobar} disabled={guardando || revisar.isPending} className="bg-[var(--mint)] text-white hover:opacity-90">
                  {revisar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                  Aprobar
                </Button>
              )}
            </div>
          </div>
        </footer>
      </form>
    </ModalShell>
  )
}

function ModalShell({
  onClose,
  fecha,
  title,
  children,
}: {
  onClose: () => void
  fecha: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center">
      <div className="flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[var(--radius-xl)] bg-[var(--color-bg)] shadow-2xl md:h-auto md:max-h-[92vh] md:rounded-[var(--radius-xl)]">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
              {title}
            </p>
            <h2 className="font-display text-lg font-bold capitalize text-[var(--color-ink)] md:text-xl">
              {fmtDate(fecha, "EEEE d 'de' MMMM yyyy")}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </header>
        {children}
      </div>
    </div>
  )
}

function ClienteBuscador({ onSelect }: { onSelect: (c: ContactoOpt) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const resultados = useBuscarContactos(q)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-3)]" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar cliente (mín. 2 letras)…"
          className="pl-8"
        />
      </div>
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-lg">
          {resultados.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-[var(--color-ink-3)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Buscando…
            </div>
          ) : (resultados.data ?? []).length === 0 ? (
            <p className="p-3 text-xs text-[var(--color-ink-3)]">Sin resultados.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {(resultados.data ?? []).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(c)
                      setQ('')
                      setOpen(false)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-[var(--color-ink)] hover:bg-[rgba(255,255,255,.035)]"
                  >
                    {c.nombre}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Total({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'success' | 'danger'
}) {
  const toneCls =
    tone === 'success'
      ? 'text-[var(--mint)]'
      : tone === 'danger'
        ? 'text-[var(--coral)]'
        : 'text-[var(--color-ink)]'
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[rgba(255,255,255,.02)] px-3 py-2">
      <p className="label-caps">
        {label}
      </p>
      <p className={`mono mt-0.5 text-sm font-semibold tabular-nums ${toneCls}`}>{value}</p>
    </div>
  )
}
