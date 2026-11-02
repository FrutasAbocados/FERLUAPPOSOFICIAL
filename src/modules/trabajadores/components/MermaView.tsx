import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addMonths, format, parseISO, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Loader2, Mic, MicOff, Plus, Scale, Trash2, Wand2, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { numDec } from '@/shared/lib/format'
import { errorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import type { EmpleadoPropio } from '../lib/useEmpleadoPropio'
import {
  hoyMadrid,
  parsearDictadoMerma,
  useBorrarMerma,
  useGuardarMerma,
  useMermaReferencias,
  useMermaRegistros,
  type MermaLineaNueva,
  type MermaOrigen,
  type MermaRegistro,
} from '../lib/merma-queries'

const kg = (n: number) => `${numDec(n)} kg`
const fechaLarga = (iso: string) => format(parseISO(iso), "EEEE d 'de' MMMM", { locale: es })
const sumar = (rows: MermaRegistro[]) => rows.reduce((s, r) => s + r.peso_kg, 0)

const parsePeso = (v: string): number | null => {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n > 0 && n <= 1000 ? n : null
}

// ── Dictado del navegador (mismo enfoque que Captura rápida; no se guarda audio) ──

type SpeechResultList = { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } }
type SpeechLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: { resultIndex: number; results: SpeechResultList }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type SpeechCtor = new () => SpeechLike
type SpeechWindow = Window & { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }

function useDictado(onFinal: (text: string) => void) {
  const [escuchando, setEscuchando] = useState(false)
  const ref = useRef<SpeechLike | null>(null)
  const onFinalRef = useRef(onFinal)
  useEffect(() => { onFinalRef.current = onFinal }, [onFinal])
  const Ctor = typeof window !== 'undefined'
    ? ((window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition ?? null)
    : null

  const start = () => {
    if (!Ctor) return
    try {
      const r = new Ctor()
      r.lang = 'es-ES'
      r.continuous = true
      r.interimResults = false
      r.onresult = (e) => {
        let text = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) text += e.results[i][0].transcript
        }
        if (text.trim()) onFinalRef.current(text.trim())
      }
      r.onerror = (e) => {
        setEscuchando(false)
        if (e.error !== 'aborted' && e.error !== 'no-speech') {
          toast({ title: 'Error en el dictado', description: e.error, variant: 'error' })
        }
      }
      r.onend = () => setEscuchando(false)
      r.start()
      ref.current = r
      setEscuchando(true)
    } catch (err: unknown) {
      toast({ title: 'No se pudo iniciar el dictado', description: errorMessage(err), variant: 'error' })
    }
  }
  const stop = () => {
    try { ref.current?.stop() } catch { /* ya terminado */ }
    setEscuchando(false)
  }
  useEffect(() => () => { try { ref.current?.stop() } catch { /* limpieza */ } }, [])
  return { disponible: !!Ctor, escuchando, start, stop }
}

// ── Vista empleado ───────────────────────────────────────────────────────────

type Borrador = { key: string; referencia: string; peso: string; origen: MermaOrigen }

export function MermaView({ empleado, modoSupervision = false }: { empleado?: EmpleadoPropio | null; modoSupervision?: boolean }) {
  if (modoSupervision) return <MermaSupervision />
  if (!empleado) {
    return <div className="ao-page py-8 text-center text-sm text-[var(--ink-mute)]">Tu usuario no está vinculado a una ficha de trabajador.</div>
  }
  return <MermaEmpleado empleado={empleado} />
}

function MermaEmpleado({ empleado }: { empleado: EmpleadoPropio }) {
  const hoy = hoyMadrid()
  const hace14 = format(subDays(parseISO(hoy), 14), 'yyyy-MM-dd')
  const registros = useMermaRegistros(hace14, hoy)
  const referencias = useMermaReferencias()
  const guardar = useGuardarMerma()
  const borrar = useBorrarMerma()

  const [referencia, setReferencia] = useState('')
  const [peso, setPeso] = useState('')
  const [dictado, setDictado] = useState('')
  const [borradores, setBorradores] = useState<Borrador[]>([])
  const dictadoRef = useRef<HTMLTextAreaElement>(null)
  const voz = useDictado((t) => setDictado(prev => (prev ? `${prev}, ${t}` : t)))

  const catalogo = useMemo(() => referencias.data ?? [], [referencias.data])
  const rows = useMemo(() => registros.data ?? [], [registros.data])
  const deHoy = rows.filter(r => r.fecha === hoy)
  const anteriores = rows.filter(r => r.fecha !== hoy)
  const porDia = useMemo(() => {
    const m = new Map<string, MermaRegistro[]>()
    for (const r of anteriores) m.set(r.fecha, [...(m.get(r.fecha) ?? []), r])
    return [...m.entries()]
  }, [anteriores])

  const anadirManual = async () => {
    const p = parsePeso(peso)
    if (!referencia.trim()) { toast({ title: 'Falta la referencia', variant: 'error' }); return }
    if (p === null) { toast({ title: 'Peso no válido', description: 'Pon los kilos, por ejemplo 2,5', variant: 'error' }); return }
    try {
      await guardar.mutateAsync({ empleadoId: empleado.id, lineas: [{ referencia, peso_kg: p, origen: 'manual' }] })
      setReferencia('')
      setPeso('')
      toast({ title: 'Merma guardada', variant: 'success' })
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: errorMessage(err), variant: 'error' })
    }
  }

  const interpretar = () => {
    if (voz.escuchando) voz.stop()
    const lineas = parsearDictadoMerma(dictado, catalogo)
    if (!lineas.length) { toast({ title: 'No he entendido ninguna línea', description: 'Di la referencia y los kilos, por ejemplo: «tomate pera 2 kilos»', variant: 'error' }); return }
    setBorradores(lineas.map((l, i) => ({
      key: `${Date.now()}-${i}`,
      referencia: l.referencia,
      peso: l.peso_kg !== null ? String(l.peso_kg).replace('.', ',') : '',
      origen: 'voz',
    })))
  }

  const guardarBorradores = async () => {
    const lineas: MermaLineaNueva[] = []
    for (const b of borradores) {
      const p = parsePeso(b.peso)
      if (!b.referencia.trim() || p === null) {
        toast({ title: 'Revisa las líneas', description: 'Cada línea necesita referencia y kilos.', variant: 'error' })
        return
      }
      lineas.push({ referencia: b.referencia, peso_kg: p, origen: b.origen })
    }
    try {
      await guardar.mutateAsync({ empleadoId: empleado.id, lineas })
      setBorradores([])
      setDictado('')
      toast({ title: `${lineas.length} ${lineas.length === 1 ? 'línea guardada' : 'líneas guardadas'}`, variant: 'success' })
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: errorMessage(err), variant: 'error' })
    }
  }

  const borrarRegistro = async (r: MermaRegistro) => {
    const ok = await confirm({ title: 'Borrar línea', description: `${r.referencia} · ${kg(r.peso_kg)}`, confirmLabel: 'Borrar', variant: 'danger' })
    if (!ok) return
    try {
      await borrar.mutateAsync(r.id)
    } catch (err) {
      toast({ title: 'No se pudo borrar', description: errorMessage(err), variant: 'error' })
    }
  }

  const setBorrador = (key: string, patch: Partial<Borrador>) =>
    setBorradores(prev => prev.map(b => (b.key === key ? { ...b, ...patch } : b)))

  return (
    <div className="ao-page py-5 pb-28 md:py-7">
      <datalist id="merma-referencias">
        {catalogo.map(r => <option key={r} value={r} />)}
      </datalist>

      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Scale className="h-5 w-5 text-[var(--color-primary-2)]" />
            <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Mi merma</h1>
          </div>
          <p className="text-xs capitalize text-[var(--ink-mute)]">{fechaLarga(hoy)}</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Hoy</div>
          <div className="font-display text-2xl font-bold tabular-nums text-[var(--ink)]">{kg(sumar(deHoy))}</div>
          <div className={`text-[11px] ${deHoy.length ? 'text-emerald-500' : 'text-amber-400'}`}>
            {deHoy.length ? `${deHoy.length} ${deHoy.length === 1 ? 'línea' : 'líneas'}` : 'Sin registrar todavía'}
          </div>
        </div>
      </header>

      {/* Dictado */}
      <div className="ao-card mb-3 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Dictar por voz</h2>
          {voz.disponible && (
            <Button
              type="button"
              size="sm"
              variant={voz.escuchando ? 'danger' : 'primary'}
              onClick={voz.escuchando ? voz.stop : voz.start}
            >
              {voz.escuchando ? <><MicOff className="h-4 w-4" /> Parar</> : <><Mic className="h-4 w-4" /> Grabar</>}
            </Button>
          )}
        </div>
        <textarea
          ref={dictadoRef}
          value={dictado}
          onChange={(e) => setDictado(e.target.value)}
          rows={3}
          placeholder={voz.disponible
            ? 'Pulsa Grabar y di: «tomate pera 2 kilos, plátano kilo y medio, 500 gramos de ajo»'
            : 'Pulsa el micro del teclado y di: «tomate pera 2 kilos, plátano kilo y medio…»'}
          className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-mute)]"
        />
        {voz.escuchando && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-red-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Escuchando… di referencia y kilos
          </p>
        )}
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={interpretar} disabled={!dictado.trim()}>
            <Wand2 className="h-4 w-4" /> Pasar a líneas
          </Button>
        </div>

        {borradores.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
            <p className="text-[11px] text-[var(--ink-mute)]">Revisa y corrige antes de guardar.</p>
            {borradores.map(b => (
              <div key={b.key} className="grid grid-cols-[1fr_84px_32px] gap-2">
                <Input list="merma-referencias" value={b.referencia} onChange={(e) => setBorrador(b.key, { referencia: e.target.value })} className="h-9" />
                <Input
                  inputMode="decimal"
                  value={b.peso}
                  placeholder="kg"
                  onChange={(e) => setBorrador(b.key, { peso: e.target.value })}
                  className={`h-9 text-right tabular-nums ${parsePeso(b.peso) === null ? 'border-amber-500' : ''}`}
                />
                <button
                  type="button"
                  aria-label="Quitar línea"
                  onClick={() => setBorradores(prev => prev.filter(x => x.key !== b.key))}
                  className="grid h-9 w-8 place-items-center rounded-md text-[var(--ink-mute)] hover:bg-white/5 hover:text-[var(--ink)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setBorradores([])}>Descartar</Button>
              <Button type="button" size="sm" onClick={guardarBorradores} disabled={guardar.isPending}>
                {guardar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Guardar {borradores.length}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Manual */}
      <div className="ao-card mb-4 p-4">
        <h2 className="mb-2 text-sm font-semibold text-[var(--ink)]">Añadir a mano</h2>
        <div className="grid grid-cols-[1fr_84px] gap-2">
          <div>
            <label className="mb-0.5 block text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Referencia</label>
            <Input list="merma-referencias" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="ej. TOMATE PERA" className="h-9" />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Kilos</label>
            <Input
              inputMode="decimal"
              value={peso}
              onChange={(e) => setPeso(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void anadirManual() }}
              placeholder="2,5"
              className="h-9 text-right tabular-nums"
            />
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" onClick={anadirManual} disabled={guardar.isPending}>
            <Plus className="h-4 w-4" /> Añadir
          </Button>
        </div>
      </div>

      {/* Hoy */}
      <div className="ao-card mb-4 p-4">
        <h2 className="mb-2 text-sm font-semibold text-[var(--ink)]">Hoy</h2>
        {registros.isLoading ? (
          <p className="text-sm text-[var(--ink-mute)]">Cargando…</p>
        ) : deHoy.length === 0 ? (
          <p className="text-sm text-[var(--ink-mute)]">Aún no has registrado merma hoy.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {deHoy.map(r => (
              <li key={r.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-[var(--ink)]">{r.referencia}</span>
                {r.origen === 'voz' && <Mic className="h-3 w-3 shrink-0 text-[var(--ink-mute)]" aria-label="Dictado" />}
                <span className="tabular-nums font-semibold text-[var(--ink)]">{kg(r.peso_kg)}</span>
                <button
                  type="button"
                  aria-label={`Borrar ${r.referencia}`}
                  onClick={() => void borrarRegistro(r)}
                  className="grid h-8 w-8 place-items-center rounded-md text-[var(--ink-mute)] hover:bg-white/5 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Últimos días */}
      {porDia.length > 0 && (
        <div className="ao-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-[var(--ink)]">Últimos 14 días</h2>
          <div className="space-y-2">
            {porDia.map(([fecha, items]) => (
              <details key={fecha} className="rounded-md border border-[var(--line)] px-3 py-2">
                <summary className="flex cursor-pointer items-center justify-between text-sm">
                  <span className="capitalize text-[var(--ink-dim)]">{fechaLarga(fecha)}</span>
                  <span className="tabular-nums font-semibold text-[var(--ink)]">{kg(sumar(items))}</span>
                </summary>
                <ul className="mt-1.5 space-y-0.5">
                  {items.map(r => (
                    <li key={r.id} className="flex justify-between text-xs text-[var(--ink-dim)]">
                      <span className="truncate">{r.referencia}</span>
                      <span className="tabular-nums">{kg(r.peso_kg)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Vista administración ─────────────────────────────────────────────────────

function useEmpleadosConMerma() {
  return useQuery({
    queryKey: ['trabajadores', 'merma', 'empleados'] as const,
    queryFn: async (): Promise<{ id: string; nombre: string }[]> => {
      const { data, error } = await supabase
        .from('empleados')
        .select('id, nombre')
        .eq('activo', true)
        .eq('merma_activa', true)
        .order('nombre')
      if (error) throw error
      return (data ?? []) as { id: string; nombre: string }[]
    },
  })
}

function MermaSupervision() {
  const hoy = hoyMadrid()
  const [mes, setMes] = useState(() => hoy.slice(0, 7))
  const desde = `${mes}-01`
  const hasta = format(subDays(addMonths(parseISO(desde), 1), 1), 'yyyy-MM-dd')
  const registros = useMermaRegistros(desde, hasta)
  const empleados = useEmpleadosConMerma()
  const borrar = useBorrarMerma()
  const [filtro, setFiltro] = useState('todos')
  const [vista, setVista] = useState<'dias' | 'referencias'>('dias')

  const all = useMemo(() => registros.data ?? [], [registros.data])
  const rows = useMemo(() => (filtro === 'todos' ? all : all.filter(r => r.empleado_id === filtro)), [all, filtro])

  const porDia = useMemo(() => {
    const m = new Map<string, MermaRegistro[]>()
    for (const r of rows) m.set(r.fecha, [...(m.get(r.fecha) ?? []), r])
    return [...m.entries()]
  }, [rows])

  const porReferencia = useMemo(() => {
    const m = new Map<string, { kg: number; veces: number }>()
    for (const r of rows) {
      const k = r.referencia.trim().toUpperCase()
      const cur = m.get(k) ?? { kg: 0, veces: 0 }
      m.set(k, { kg: cur.kg + r.peso_kg, veces: cur.veces + 1 })
    }
    return [...m.entries()].sort((a, b) => b[1].kg - a[1].kg)
  }, [rows])

  const total = sumar(rows)
  const diasConRegistro = new Set(rows.map(r => r.fecha)).size
  const hoyRegistrado = (empleadoId: string) => all.some(r => r.empleado_id === empleadoId && r.fecha === hoy)

  const borrarRegistro = async (r: MermaRegistro) => {
    const ok = await confirm({ title: 'Borrar línea de merma', description: `${r.empleado_nombre ?? ''} · ${r.referencia} · ${kg(r.peso_kg)}`, confirmLabel: 'Borrar', variant: 'danger' })
    if (!ok) return
    try { await borrar.mutateAsync(r.id) } catch (err) {
      toast({ title: 'No se pudo borrar', description: errorMessage(err), variant: 'error' })
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-[var(--color-primary-2)]" />
          <h1 className="font-display text-xl font-bold text-[var(--ink)]">Merma del equipo</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" aria-label="Mes anterior" onClick={() => setMes(format(addMonths(parseISO(desde), -1), 'yyyy-MM'))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-28 text-center text-sm font-semibold capitalize tabular-nums text-[var(--ink)]">
            {format(parseISO(desde), 'MMMM yyyy', { locale: es })}
          </span>
          <Button type="button" size="sm" variant="ghost" aria-label="Mes siguiente" disabled={mes >= hoy.slice(0, 7)} onClick={() => setMes(format(addMonths(parseISO(desde), 1), 'yyyy-MM'))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="ao-card p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Total mes</div>
          <div className="font-display text-xl font-bold tabular-nums text-[var(--ink)]">{kg(total)}</div>
        </div>
        <div className="ao-card p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Días con registro</div>
          <div className="font-display text-xl font-bold tabular-nums text-[var(--ink)]">{diasConRegistro}</div>
        </div>
        <div className="ao-card col-span-2 p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Hoy</div>
          {empleados.data?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {empleados.data.map(e => (
                <span key={e.id} className={`rounded-md border px-2 py-0.5 text-xs ${hoyRegistrado(e.id) ? 'border-emerald-600/40 text-emerald-500' : 'border-amber-500/40 text-amber-400'}`}>
                  {e.nombre} · {hoyRegistrado(e.id) ? 'registrado' : 'pendiente'}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-[var(--ink-mute)]">Nadie tiene la merma activada (BBDD Trabajadores → ficha).</span>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)]"
        >
          <option value="todos">Todo el equipo</option>
          {[...new Map(all.map(r => [r.empleado_id, r.empleado_nombre ?? 'Trabajador'])).entries()].map(([id, nombre]) => (
            <option key={id} value={id}>{nombre}</option>
          ))}
        </select>
        <div className="ao-tabbar">
          <button type="button" className={vista === 'dias' ? 'ao-tab ao-tab-active' : 'ao-tab'} onClick={() => setVista('dias')}>Por día</button>
          <button type="button" className={vista === 'referencias' ? 'ao-tab ao-tab-active' : 'ao-tab'} onClick={() => setVista('referencias')}>Por referencia</button>
        </div>
      </div>

      {registros.isLoading ? (
        <p className="text-sm text-[var(--ink-mute)]">Cargando…</p>
      ) : rows.length === 0 ? (
        <div className="ao-card p-6 text-center text-sm text-[var(--ink-mute)]">Sin merma registrada este mes.</div>
      ) : vista === 'referencias' ? (
        <div className="ao-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-left text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">
                <th className="px-3 py-2">Referencia</th>
                <th className="px-3 py-2 text-right">Veces</th>
                <th className="px-3 py-2 text-right">Kilos</th>
              </tr>
            </thead>
            <tbody>
              {porReferencia.map(([ref, v]) => (
                <tr key={ref} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-1.5 text-[var(--ink)]">{ref}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--ink-dim)]">{v.veces}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-[var(--ink)]">{kg(v.kg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {porDia.map(([fecha, items]) => (
            <div key={fecha} className="ao-card overflow-x-auto">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2 text-sm">
                <span className="font-semibold capitalize text-[var(--ink)]">{fechaLarga(fecha)}</span>
                <span className="tabular-nums font-semibold text-[var(--ink)]">{kg(sumar(items))}</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {items.map(r => (
                    <tr key={r.id} className="border-b border-[var(--line)] last:border-0">
                      <td className="w-32 px-3 py-1.5 text-xs text-[var(--ink-dim)]">{r.empleado_nombre ?? '—'}</td>
                      <td className="px-3 py-1.5 text-[var(--ink)]">
                        {r.referencia}
                        {r.origen === 'voz' && <Mic className="ml-1 inline h-3 w-3 text-[var(--ink-mute)]" aria-label="Dictado" />}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-[var(--ink)]">{kg(r.peso_kg)}</td>
                      <td className="w-10 px-1 py-1.5 text-right">
                        <button
                          type="button"
                          aria-label={`Borrar ${r.referencia}`}
                          onClick={() => void borrarRegistro(r)}
                          className="grid h-7 w-7 place-items-center rounded-md text-[var(--ink-mute)] hover:bg-white/5 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
