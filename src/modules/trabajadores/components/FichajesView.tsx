import { lazy, Suspense, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, parseISO, startOfWeek, subWeeks, addWeeks } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Map as MapIcon, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { FichajesActivosPanel } from './FichajesActivosPanel'
import { FichajesStatsPanel } from './FichajesStatsPanel'

const FichajeMiniMapa = lazy(() => import('./FichajeMiniMapa').then(m => ({ default: m.FichajeMiniMapa })))

interface SemanaRow {
  empleado_id: string
  empleado_nombre: string
  empleado_color: string | null
  fecha: string  // YYYY-MM-DD
  horas: number
  num_fichajes: number
  abierto: boolean
}

interface FichajeMes {
  id: string
  ts_in: string
  ts_out: string | null
  fecha: string
  horas: number | null
  fuente: string
  nota: string | null
  lat_in: number | null
  lng_in: number | null
  lat_out: number | null
  lng_out: number | null
}

const KEY_SEMANA = (lunes: string) => ['fichajes', 'semana', lunes] as const
const KEY_MES = (empId: string, mesISO: string) => ['fichajes', 'mes', empId, mesISO] as const

function lunesDe(d: Date): string {
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
}
function fmtHoras(h: number): string {
  if (h <= 0) return '—'
  const totalMin = Math.round(h * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, '0')}`
}

export function FichajesView() {
  const [anchor, setAnchor] = useState<Date>(new Date())
  const lunes = lunesDe(anchor)
  const dias = useMemo(
    () => Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(lunes), i), 'yyyy-MM-dd')),
    [lunes],
  )

  const semana = useQuery({
    queryKey: KEY_SEMANA(lunes),
    queryFn: async (): Promise<SemanaRow[]> => {
      const { data, error } = await supabase.rpc('trabajadores_fichajes_semana', { p_lunes: lunes })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        empleado_id: String(r.empleado_id ?? ''),
        empleado_nombre: String(r.empleado_nombre ?? ''),
        empleado_color: r.empleado_color == null ? null : String(r.empleado_color),
        fecha: String(r.fecha ?? ''),
        horas: Number(r.horas ?? 0),
        num_fichajes: Number(r.num_fichajes ?? 0),
        abierto: !!r.abierto,
      }))
    },
  })

  const empleados = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; color: string | null }>()
    for (const r of semana.data ?? []) {
      if (!map.has(r.empleado_id)) {
        map.set(r.empleado_id, { id: r.empleado_id, nombre: r.empleado_nombre, color: r.empleado_color })
      }
    }
    return [...map.values()]
  }, [semana.data])

  const matriz = useMemo(() => {
    const m = new Map<string, SemanaRow>()
    for (const r of semana.data ?? []) m.set(`${r.empleado_id}|${r.fecha}`, r)
    return m
  }, [semana.data])

  const totalesEmpleado = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of semana.data ?? []) m.set(r.empleado_id, (m.get(r.empleado_id) ?? 0) + r.horas)
    return m
  }, [semana.data])

  const [detalleEmp, setDetalleEmp] = useState<{ id: string; nombre: string } | null>(null)
  const [editing, setEditing] = useState<FichajeMes | null>(null)
  const [creating, setCreating] = useState<{ empleado_id: string; nombre: string } | null>(null)

  return (
    <div className="ao-page space-y-4 py-5 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">Fichajes</h2>
          <p className="text-xs text-[var(--color-ink-3)]">
            Horas trabajadas por empleado y día. Click en una celda para ver/editar fichajes del mes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAnchor(subWeeks(anchor, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-sm font-medium text-[var(--color-ink-2)] tabular-nums">
            Semana del {format(parseISO(lunes), "d 'de' LLLL", { locale: es })}
          </span>
          <Button size="sm" variant="outline" onClick={() => setAnchor(addWeeks(anchor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date())}>Hoy</Button>
        </div>
      </header>

      <FichajesActivosPanel />

      <FichajesStatsPanel />

      <div className="ao-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                <th className="px-3 py-2 text-left">Empleado</th>
                {dias.map((d) => (
                  <th key={d} className="px-2 py-2 text-center">
                    <div>{format(parseISO(d), 'EEE', { locale: es })}</div>
                    <div className="text-[10px] tabular-nums">{format(parseISO(d), 'd LLL', { locale: es })}</div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {empleados.length === 0 && (
                <tr>
                  <td colSpan={dias.length + 2} className="px-4 py-6 text-center text-[var(--color-ink-3)]">
                    {semana.isLoading ? 'Cargando…' : 'Sin fichajes esta semana'}
                  </td>
                </tr>
              )}
              {empleados.map((e) => (
                <tr key={e.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-3 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => setDetalleEmp({ id: e.id, nombre: e.nombre })}
                      className="font-medium text-[var(--color-ink)] hover:text-[var(--color-primary-2)] hover:underline"
                    >
                      {e.nombre}
                    </button>
                  </td>
                  {dias.map((d) => {
                    const cell = matriz.get(`${e.id}|${d}`)
                    const horas = cell?.horas ?? 0
                    return (
                      <td key={d} className="px-2 py-2 text-center tabular-nums">
                        {cell?.abierto && (
                          <span className="rounded-full bg-[var(--mint-glow)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--mint)]">EN</span>
                        )}
                        <span className={horas > 0 ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-3)]'}>
                          {fmtHoras(horas)}
                        </span>
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--color-ink)]">
                    {fmtHoras(totalesEmpleado.get(e.id) ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detalleEmp && (
        <DetalleEmpleadoModal
          empleadoId={detalleEmp.id}
          empleadoNombre={detalleEmp.nombre}
          onClose={() => setDetalleEmp(null)}
          onEditar={(f) => setEditing(f)}
          onCrear={() => setCreating({ empleado_id: detalleEmp.id, nombre: detalleEmp.nombre })}
        />
      )}

      {editing && (
        <EditarFichajeModal
          fichaje={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {creating && (
        <CrearFichajeModal
          empleadoId={creating.empleado_id}
          empleadoNombre={creating.nombre}
          onClose={() => setCreating(null)}
        />
      )}
    </div>
  )
}

function DetalleEmpleadoModal({
  empleadoId, empleadoNombre, onClose, onEditar, onCrear,
}: {
  empleadoId: string
  empleadoNombre: string
  onClose: () => void
  onEditar: (f: FichajeMes) => void
  onCrear: () => void
}) {
  const qc = useQueryClient()
  const [mes, setMes] = useState<Date>(new Date())
  const mesISO = format(mes, 'yyyy-MM-01')

  const lista = useQuery({
    queryKey: KEY_MES(empleadoId, mesISO),
    queryFn: async (): Promise<FichajeMes[]> => {
      const { data, error } = await supabase.rpc('trabajadores_fichajes_mes', {
        p_empleado_id: empleadoId, p_mes: mesISO,
      })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id ?? ''),
        ts_in: String(r.ts_in ?? ''),
        ts_out: r.ts_out == null ? null : String(r.ts_out),
        fecha: String(r.fecha ?? ''),
        horas: r.horas == null ? null : Number(r.horas),
        fuente: String(r.fuente ?? ''),
        nota: r.nota == null ? null : String(r.nota),
        lat_in: r.lat_in == null ? null : Number(r.lat_in),
        lng_in: r.lng_in == null ? null : Number(r.lng_in),
        lat_out: r.lat_out == null ? null : Number(r.lat_out),
        lng_out: r.lng_out == null ? null : Number(r.lng_out),
      }))
    },
  })

  const totalMes = useMemo(
    () => (lista.data ?? []).reduce((s, f) => s + (f.horas ?? 0), 0),
    [lista.data],
  )

  // Agrupado por día (lista llega ordenada ts_in desc → días desc, dentro desc)
  const porDia = useMemo(() => {
    const map = new Map<string, FichajeMes[]>()
    for (const f of lista.data ?? []) {
      const arr = map.get(f.fecha) ?? []
      arr.push(f)
      map.set(f.fecha, arr)
    }
    return [...map.entries()]
  }, [lista.data])

  const [mapaAbierto, setMapaAbierto] = useState<Set<string>>(new Set())
  const toggleMapa = (id: string) =>
    setMapaAbierto(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const borrar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('trabajadores_fichaje_admin_borrar', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_MES(empleadoId, mesISO) })
      qc.invalidateQueries({ queryKey: ['fichajes', 'semana'] })
      toast({ title: 'Fichaje borrado', variant: 'success' })
    },
    onError: (e) => toast({ title: 'Error', description: (e as Error).message, variant: 'error' }),
  })

  return (
    <Modal onClose={onClose} size="xl">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-bold text-[var(--color-ink)]">{empleadoNombre}</h3>
            <p className="text-xs text-[var(--color-ink-3)] tabular-nums">
              Total {format(mes, 'LLLL yyyy', { locale: es })}: <strong className="text-[var(--color-ink)]">{fmtHoras(totalMes)}</strong>
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-[var(--color-surface-2)]" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-5 py-2">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm font-medium tabular-nums">{format(mes, 'LLLL yyyy', { locale: es })}</span>
            <Button size="sm" variant="outline" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button size="sm" onClick={onCrear}>
            <Plus className="h-3.5 w-3.5" /> Añadir fichaje
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {lista.isLoading && <p className="px-5 py-4 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
          {!lista.isLoading && porDia.length === 0 && (
            <p className="px-5 py-4 text-sm text-[var(--color-ink-3)]">Sin fichajes este mes</p>
          )}
          {porDia.map(([fecha, items]) => {
            const totalDia = items.reduce((s, f) => s + (f.horas ?? 0), 0)
            return (
              <div key={fecha} className="mb-1">
                <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-2)] capitalize">
                    {format(parseISO(fecha), "EEEE d 'de' LLLL", { locale: es })}
                  </span>
                  <span className="text-xs tabular-nums text-[var(--color-ink-3)]">
                    {fmtHoras(totalDia)} · {items.length} fichaje{items.length > 1 ? 's' : ''}
                  </span>
                </div>
                <ul className="space-y-1.5 px-3 py-2">
                  {items.map((f) => {
                    const tieneGeo = (f.lat_in != null && f.lng_in != null) || (f.lat_out != null && f.lng_out != null)
                    const open = mapaAbierto.has(f.id)
                    const horaIn = format(parseISO(f.ts_in), 'HH:mm', { locale: es })
                    const horaOut = f.ts_out ? format(parseISO(f.ts_out), 'HH:mm', { locale: es }) : null
                    return (
                      <li key={f.id} className="rounded-lg border border-[var(--color-border)]">
                        <div className="flex items-center gap-2 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm tabular-nums text-[var(--color-ink)]">
                              {horaIn}{' → '}{horaOut ?? <span className="font-semibold text-emerald-600">EN CURSO</span>}
                              {f.horas != null && <span className="ml-2 text-[var(--color-ink-3)]">· {fmtHoras(f.horas)}</span>}
                            </div>
                            <div className="text-[11px] text-[var(--color-ink-3)]">
                              <span className={f.fuente === 'manual_admin' ? 'text-amber-600' : ''}>
                                {f.fuente === 'manual_admin' ? 'manual' : 'app'}
                              </span>
                              {tieneGeo
                                ? <span className="ml-1 inline-flex items-center gap-0.5 text-[var(--mint)]"><MapPin className="h-3 w-3" />con ubicación</span>
                                : <span className="ml-1">· sin ubicación</span>}
                              {f.nota && <span> · {f.nota}</span>}
                            </div>
                          </div>
                          {tieneGeo && (
                            <Button size="sm" variant={open ? 'primary' : 'outline'} onClick={() => toggleMapa(f.id)} title="Ver en mapa">
                              <MapIcon className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => onEditar(f)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              const ok = await confirm({ title: '¿Borrar fichaje?', description: 'Esta acción no se puede deshacer.', confirmLabel: 'Borrar' })
                              if (ok) borrar.mutate(f.id)
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                          </Button>
                        </div>
                        {open && (
                          <div className="px-3 pb-3">
                            <Suspense fallback={<div className="flex h-[180px] items-center justify-center rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-ink-3)]">Cargando mapa…</div>}>
                              <FichajeMiniMapa latIn={f.lat_in} lngIn={f.lng_in} latOut={f.lat_out} lngOut={f.lng_out} horaIn={horaIn} horaOut={horaOut ?? undefined} />
                            </Suspense>
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--color-ink-3)]">
                              {f.lat_in != null && f.lng_in != null && (
                                <a href={`https://www.google.com/maps?q=${f.lat_in},${f.lng_in}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> entrada en Google Maps
                                </a>
                              )}
                              {f.lat_out != null && f.lng_out != null && (
                                <a href={`https://www.google.com/maps?q=${f.lat_out},${f.lng_out}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                                  <span className="h-2 w-2 rounded-full bg-rose-500" /> salida en Google Maps
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
    </Modal>
  )
}

function CrearFichajeModal({ empleadoId, empleadoNombre, onClose }: {
  empleadoId: string
  empleadoNombre: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const today = format(new Date(), 'yyyy-MM-dd')
  const [fecha, setFecha] = useState<string>(today)
  const [tsIn, setTsIn] = useState<string>('06:30')
  const [tsOut, setTsOut] = useState<string>('14:00')
  const [nota, setNota] = useState('')

  const crear = useMutation({
    mutationFn: async () => {
      const tIn = `${fecha}T${tsIn}:00+02:00`  // Madrid summer offset; OK aproximado
      const tOut = `${fecha}T${tsOut}:00+02:00`
      const { error } = await supabase.rpc('trabajadores_fichaje_admin_crear', {
        p_empleado_id: empleadoId,
        p_ts_in: tIn,
        p_ts_out: tOut,
        p_nota: nota.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fichajes'] })
      toast({ title: 'Fichaje creado', variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: 'Error', description: (e as Error).message, variant: 'error' }),
  })

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-2 md:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-2xl bg-[var(--color-surface)] p-5 shadow-xl">
        <h3 className="mb-1 font-display text-lg font-bold text-[var(--color-ink)]">Nuevo fichaje</h3>
        <p className="mb-4 text-xs text-[var(--color-ink-3)]">{empleadoNombre} · marcado como manual</p>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-ink-2)]">Fecha</span>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-ink-2)]">Entrada</span>
              <Input type="time" value={tsIn} onChange={(e) => setTsIn(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-ink-2)]">Salida</span>
              <Input type="time" value={tsOut} onChange={(e) => setTsOut(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-ink-2)]">Nota (opcional)</span>
            <Input type="text" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Olvidó fichar" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => crear.mutate()} disabled={crear.isPending}>
            {crear.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function EditarFichajeModal({ fichaje, onClose }: { fichaje: FichajeMes; onClose: () => void }) {
  const qc = useQueryClient()
  const initIn = fichaje.ts_in.slice(0, 16)  // YYYY-MM-DDTHH:mm
  const initOut = fichaje.ts_out ? fichaje.ts_out.slice(0, 16) : ''
  const [tsIn, setTsIn] = useState(initIn)
  const [tsOut, setTsOut] = useState(initOut)
  const [nota, setNota] = useState(fichaje.nota ?? '')

  const editar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('trabajadores_fichaje_admin_editar', {
        p_id: fichaje.id,
        p_ts_in: new Date(tsIn).toISOString(),
        p_ts_out: tsOut ? new Date(tsOut).toISOString() : null,
        p_nota: nota.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fichajes'] })
      toast({ title: 'Fichaje editado', variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: 'Error', description: (e as Error).message, variant: 'error' }),
  })

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-2 md:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-2xl bg-[var(--color-surface)] p-5 shadow-xl">
        <h3 className="mb-3 font-display text-lg font-bold text-[var(--color-ink)]">Editar fichaje</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-ink-2)]">Entrada</span>
            <Input type="datetime-local" value={tsIn} onChange={(e) => setTsIn(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-ink-2)]">Salida (vacío = sigue dentro)</span>
            <Input type="datetime-local" value={tsOut} onChange={(e) => setTsOut(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-ink-2)]">Nota</span>
            <Input type="text" value={nota} onChange={(e) => setNota(e.target.value)} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => editar.mutate()} disabled={editar.isPending}>
            {editar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
