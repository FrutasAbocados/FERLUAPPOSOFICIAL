import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, Gift, Loader2, PackageCheck, Power, Plus, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Modal } from '@/shared/components/Modal'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { RuletaModal } from './RuletaModal'

type Tipo = 'puntos' | 'euros' | 'fisico' | 'comodin' | 'bonus'

type Premio = {
  id: string
  nombre: string
  descripcion: string | null
  tipo: Tipo
  valor: number
  peso: number
  icono: string | null
  color: string | null
  activo: boolean
  garantizable: boolean
  created_at: string
}

type ResumenAdmin = {
  empleado_id: string
  nombre: string
  saldo_pendiente: number
  tiradas_total: number
  pendientes_entrega: number
  ultima_tirada_at: string | null
}

type CanjeAdmin = {
  tirada_id: string
  empleado_id: string
  empleado_nombre: string
  motivo: string | null
  tirada_at: string | null
  solicitado_at: string | null
  canje_notas: string | null
  entregado: boolean
  entregado_at: string | null
  premio_id: string
  premio_nombre: string
  premio_tipo: Tipo
  premio_valor: number
  premio_icono: string | null
}

type CanjeAdminRow = {
  tirada_id: string
  empleado_id: string
  empleado_nombre: string
  motivo: string | null
  tirada_at: string | null
  solicitado_at: string | null
  canje_notas: string | null
  entregado: boolean
  entregado_at: string | null
  premio_id: string
  premio_nombre: string
  premio_tipo: string
  premio_valor: number | string | null
  premio_icono: string | null
}

type TiradaDetalleRow = {
  id: string
  empleado_id: string
  motivo: string | null
  otorgado_at: string
  premio_id: string | null
  tirada_at: string | null
  solicitado_at: string | null
  canje_notas: string | null
  entregado: boolean
  entregado_at: string | null
  premio: { nombre: string; tipo: Tipo; valor: number | string; icono: string | null } | { nombre: string; tipo: Tipo; valor: number | string; icono: string | null }[] | null
}

type TiradaDetalle = {
  id: string
  empleado_id: string
  empleado_nombre: string
  motivo: string | null
  otorgado_at: string
  premio_id: string | null
  premio_nombre: string | null
  premio_tipo: Tipo | null
  premio_valor: number | null
  premio_icono: string | null
  tirada_at: string | null
  solicitado_at: string | null
  canje_notas: string | null
  entregado: boolean
  entregado_at: string | null
}

const TIPO_LABEL: Record<Tipo, string> = {
  puntos: 'puntos',
  euros: 'euros',
  fisico: 'físico',
  comodin: 'comodín',
  bonus: 'tirada extra',
}
const TIPO_COLOR: Record<Tipo, string> = {
  puntos: 'bg-amber-100 text-amber-800',
  euros: 'bg-emerald-100 text-emerald-800',
  fisico: 'bg-rose-100 text-rose-800',
  comodin: 'bg-sky-100 text-sky-800',
  bonus: 'bg-violet-100 text-violet-800',
}
const COLOR_OPTS = ['amber', 'emerald', 'rose', 'sky', 'indigo', 'lime', 'violet', 'pink', 'orange', 'teal']

export function RuletaAdminView() {
  const [testOpen, setTestOpen] = useState(false)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 border-b border-[var(--color-border)] pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Trabajadores</p>
            <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">Ruleta de la suerte</h1>
            <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
              Otorga tiradas a tu equipo (por logros: 3 días sin retraso, mes con 100+ pts, tareas extras…). El empleado tira desde su Dashboard.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTestOpen(true)}
            className="w-fit border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
          >
            <Sparkles className="mr-1 h-4 w-4" /> Ver test
          </Button>
        </div>
      </header>

      <ActivaToggle />
      <DarTiradaSection />
      <CanjesPendientesSection />
      <ResumenSection />
      <CatalogoSection />
      {testOpen && <RuletaModal modoTest onClose={() => setTestOpen(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toggle global activar / desactivar ruleta
// ---------------------------------------------------------------------------
function ActivaToggle() {
  const qc = useQueryClient()

  const { data: activa, isLoading } = useQuery({
    queryKey: ['ruleta', 'activa'] as const,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('ruleta_is_activa')
      if (error) throw error
      return Boolean(data)
    },
  })

  const setActiva = useMutation({
    mutationFn: async (next: boolean) => {
      const { data, error } = await supabase.rpc('ruleta_activa_set', { p_activa: next })
      if (error) throw error
      return Boolean(data)
    },
    onSuccess: (next) => {
      qc.invalidateQueries({ queryKey: ['ruleta'] })
      toast({
        title: next ? '🎰 Ruleta activada' : '⏸️ Ruleta desactivada',
        description: next
          ? 'Los empleados verán su botón TIRAR si tienen saldo.'
          : 'Aunque tengan saldo, no podrán tirar hasta que la actives.',
        variant: 'success',
      })
    },
    onError: (e) => toast({ title: 'No se pudo cambiar', description: e instanceof Error ? e.message : '', variant: 'error' }),
  })

  if (isLoading) return null

  const on = activa === true
  return (
    <section
      className={`mb-3 flex items-center justify-between gap-3 rounded-xl border p-4 ${
        on
          ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100/60'
          : 'border-[var(--color-border)] bg-[var(--color-surface-2)]'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            on ? 'bg-emerald-500 text-white' : 'bg-[var(--color-surface-2)] text-[var(--color-ink-3)]'
          }`}
        >
          <Power className="h-5 w-5" />
        </div>
        <div>
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${on ? 'text-emerald-400' : 'text-[var(--color-ink-3)]'}`}>
            Estado global
          </div>
          <div className="font-display text-base font-bold text-[var(--color-ink)]">
            {on ? 'Ruleta ACTIVA — el equipo puede tirar' : 'Ruleta APAGADA — nadie ve el botón TIRAR'}
          </div>
        </div>
      </div>
      <Button
        size="sm"
        variant={on ? 'outline' : 'primary'}
        onClick={() => setActiva.mutate(!on)}
        disabled={setActiva.isPending}
        className={on ? '' : 'bg-emerald-600 text-white hover:bg-emerald-700'}
      >
        {setActiva.isPending
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : on ? 'Apagar' : 'Encender'}
      </Button>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 1. Dar tirada
// ---------------------------------------------------------------------------
function DarTiradaSection() {
  const qc = useQueryClient()
  const [empleadoId, setEmpleadoId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [cantidad, setCantidad] = useState(1)

  const { data: empleados } = useQuery({
    queryKey: ['ruleta', 'empleados-activos'] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empleados_equipo')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre')
      if (error) throw error
      return (data ?? []) as { id: string; nombre: string }[]
    },
  })

  const otorgar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('ruleta_otorgar_tirada', {
        p_empleado: empleadoId,
        p_motivo: motivo.trim() || null,
        p_cantidad: cantidad,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    onSuccess: (saldo) => {
      const nombre = empleados?.find((e) => e.id === empleadoId)?.nombre ?? ''
      toast({
        title: '¡Tirada otorgada!',
        description: `${nombre} tiene ${saldo} tirada(s) pendiente(s).`,
        variant: 'success',
      })
      setMotivo('')
      setCantidad(1)
      qc.invalidateQueries({ queryKey: ['ruleta'] })
    },
    onError: (e) => {
      toast({ title: 'No se pudo otorgar', description: e instanceof Error ? e.message : '', variant: 'error' })
    },
  })

  const submit = () => {
    if (!empleadoId) {
      toast({ title: 'Falta empleado', variant: 'error' })
      return
    }
    otorgar.mutate()
  }

  return (
    <section className="mb-5 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-rose-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-600" />
        <h2 className="text-sm font-semibold text-[var(--color-ink)]">Otorgar tiradas</h2>
      </div>
      <div className="grid gap-2 md:grid-cols-[1.2fr_2fr_auto_auto]">
        <select
          value={empleadoId}
          onChange={(e) => setEmpleadoId(e.target.value)}
          className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)]"
        >
          <option value="">— Empleado —</option>
          {empleados?.map((e) => (
            <option key={e.id} value={e.id}>{e.nombre}</option>
          ))}
        </select>
        <Input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (opcional): 3 días puntualidad, 100 pts mes…"
          className="h-9"
        />
        <Input
          type="number"
          min={1}
          max={20}
          value={cantidad}
          onChange={(e) => setCantidad(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          className="h-9 w-20 tabular-nums"
        />
        <Button onClick={submit} disabled={otorgar.isPending || !empleadoId} size="sm">
          {otorgar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-3.5 w-3.5" /> Dar</>}
        </Button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// 2. Canjes pendientes: premios ganados y solicitados por empleados
// ---------------------------------------------------------------------------
function CanjesPendientesSection() {
  const qc = useQueryClient()

  const { data = [], isLoading } = useQuery({
    queryKey: ['ruleta', 'canjes-admin'] as const,
    queryFn: async (): Promise<CanjeAdmin[]> => {
      const { data, error } = await supabase.rpc('ruleta_canjes_admin')
      if (error) throw error
      return ((data ?? []) as CanjeAdminRow[]).map((r) => ({
        tirada_id: String(r.tirada_id),
        empleado_id: String(r.empleado_id),
        empleado_nombre: String(r.empleado_nombre),
        motivo: r.motivo ? String(r.motivo) : null,
        tirada_at: r.tirada_at ? String(r.tirada_at) : null,
        solicitado_at: r.solicitado_at ? String(r.solicitado_at) : null,
        canje_notas: r.canje_notas ? String(r.canje_notas) : null,
        entregado: Boolean(r.entregado),
        entregado_at: r.entregado_at ? String(r.entregado_at) : null,
        premio_id: String(r.premio_id),
        premio_nombre: String(r.premio_nombre),
        premio_tipo: r.premio_tipo as Tipo,
        premio_valor: Number(r.premio_valor ?? 0),
        premio_icono: r.premio_icono ? String(r.premio_icono) : null,
      }))
    },
  })

  const marcar = useMutation({
    mutationFn: async (input: { id: string; entregado: boolean }) => {
      const { error } = await supabase.rpc('ruleta_marcar_entregado', {
        p_tirada: input.id,
        p_entregado: input.entregado,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ruleta'] }),
    onError: (e) => toast({ title: 'No se pudo actualizar', description: e instanceof Error ? e.message : '', variant: 'error' }),
  })

  // Flujo único: el admin solo confirma premios que el empleado YA ha solicitado.
  const solicitados = data.filter((c) => !c.entregado && c.solicitado_at)
  const sinPedir = data.filter((c) => !c.entregado && !c.solicitado_at)

  return (
    <section className="mb-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-4 w-4 text-emerald-600" />
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">Solicitudes de canje</h2>
            <p className="text-xs text-[var(--color-ink-3)]">
              {solicitados.length} solicitud{solicitados.length === 1 ? '' : 'es'} por confirmar
              {sinPedir.length > 0 && <> · {sinPedir.length} premio{sinPedir.length === 1 ? '' : 's'} ganado{sinPedir.length === 1 ? '' : 's'} sin pedir aún</>}
            </p>
          </div>
        </div>
        <KPI label="Por confirmar" value={solicitados.length} tone={solicitados.length > 0 ? 'rose' : 'neutral'} />
      </div>

      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
      {!isLoading && solicitados.length === 0 && (
        <p className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-sm text-[var(--color-ink-3)]">
          No hay solicitudes de canje. El empleado debe pedir el premio desde su panel para que aparezca aquí.
        </p>
      )}
      {solicitados.length > 0 && (
        <ul className="space-y-2">
          {solicitados.map((c) => (
            <li
              key={c.tirada_id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border border-emerald-300 bg-[rgba(16,185,129,.08)] px-3 py-2 text-sm"
            >
              <span className="text-2xl">{c.premio_icono ?? '🎁'}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-[var(--color-ink)]">{c.empleado_nombre}</span>
                  <span className="text-[var(--color-ink-3)]">·</span>
                  <span className="font-medium text-[var(--color-ink)]">{c.premio_nombre}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${TIPO_COLOR[c.premio_tipo]}`}>
                    {TIPO_LABEL[c.premio_tipo]}
                    {c.premio_tipo === 'puntos' && c.premio_valor ? ` · +${c.premio_valor}` : ''}
                    {c.premio_tipo === 'euros' && c.premio_valor ? ` · ${euros(c.premio_valor)}` : ''}
                  </span>
                  {c.solicitado_at && (
                    <span className="rounded-full bg-[var(--mint-glow)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--mint)]">
                      pedido {format(new Date(c.solicitado_at), 'd LLL HH:mm', { locale: es })}
                    </span>
                  )}
                </div>
                <div className="truncate text-[11px] text-[var(--color-ink-3)]">
                  {c.motivo ? <>«{c.motivo}» · </> : null}
                  {c.tirada_at ? <>ganado {format(new Date(c.tirada_at), 'd LLL', { locale: es })}</> : 'sin fecha de tirada'}
                  {c.canje_notas ? <> · {c.canje_notas}</> : null}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => marcar.mutate({ id: c.tirada_id, entregado: true })}
                disabled={marcar.isPending}
                className="h-8"
              >
                {marcar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1 h-3.5 w-3.5" /> Confirmar canje</>}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// 3. Resumen empleados (saldo + tiradas + pendientes entrega)
// ---------------------------------------------------------------------------
function ResumenSection() {
  const [verEmpleadoId, setVerEmpleadoId] = useState<string | null>(null)
  const [verEmpleadoNombre, setVerEmpleadoNombre] = useState<string>('')

  const { data, isLoading } = useQuery({
    queryKey: ['ruleta', 'resumen-admin'] as const,
    queryFn: async (): Promise<ResumenAdmin[]> => {
      const { data, error } = await supabase.rpc('ruleta_resumen_admin')
      if (error) throw error
      return (data ?? []).map((r: ResumenAdmin) => ({
        ...r,
        saldo_pendiente: Number(r.saldo_pendiente),
        tiradas_total: Number(r.tiradas_total),
        pendientes_entrega: Number(r.pendientes_entrega),
      }))
    },
  })

  const totales = useMemo(() => {
    const r = data ?? []
    return {
      saldo: r.reduce((s, x) => s + x.saldo_pendiente, 0),
      tiradas: r.reduce((s, x) => s + x.tiradas_total, 0),
      pendientesEntrega: r.reduce((s, x) => s + x.pendientes_entrega, 0),
    }
  }, [data])

  return (
    <section className="mb-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-rose-600" />
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Estado por empleado</h2>
        </div>
        <div className="flex gap-3 text-right">
          <KPI label="Pendientes tirar" value={totales.saldo} tone="amber" />
          <KPI label="Tiradas totales" value={totales.tiradas} tone="neutral" />
          <KPI label="Por entregar" value={totales.pendientesEntrega} tone="rose" />
        </div>
      </div>

      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}

      {data && data.length > 0 && (
        <ul className="grid gap-2 md:grid-cols-2">
          {data.map((r) => (
            <li
              key={r.empleado_id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              <button
                onClick={() => { setVerEmpleadoId(r.empleado_id); setVerEmpleadoNombre(r.nombre) }}
                className="text-left font-semibold text-[var(--color-ink)] hover:underline"
              >
                {r.nombre}
              </button>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                  r.saldo_pendiente > 0 ? 'bg-amber-200 text-amber-900' : 'bg-[rgba(255,255,255,.06)] text-[var(--color-ink-3)]'
                }`}
                title="Pendientes de tirar"
              >
                {r.saldo_pendiente} ⏳
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                  r.pendientes_entrega > 0 ? 'bg-rose-200 text-rose-900' : 'bg-[rgba(255,255,255,.06)] text-[var(--color-ink-3)]'
                }`}
                title="Premios por entregar"
              >
                {r.pendientes_entrega} 📦
              </span>
            </li>
          ))}
        </ul>
      )}

      {verEmpleadoId && (
        <TiradasModal
          empleadoId={verEmpleadoId}
          empleadoNombre={verEmpleadoNombre}
          onClose={() => setVerEmpleadoId(null)}
        />
      )}
    </section>
  )
}

function KPI({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'rose' | 'neutral' }) {
  const color = tone === 'amber' ? 'text-amber-700' : tone === 'rose' ? 'text-rose-700' : 'text-[var(--color-ink)]'
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">{label}</div>
      <div className={`font-display text-base font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}

function TiradasModal({
  empleadoId,
  empleadoNombre,
  onClose,
}: {
  empleadoId: string
  empleadoNombre: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['ruleta', 'tiradas-empleado', empleadoId] as const,
    queryFn: async (): Promise<TiradaDetalle[]> => {
      const { data, error } = await supabase
        .from('trabajadores_ruleta_tiradas')
        .select('id, empleado_id, motivo, otorgado_at, premio_id, tirada_at, solicitado_at, canje_notas, entregado, entregado_at, premio:trabajadores_ruleta_premios(nombre, tipo, valor, icono)')
        .eq('empleado_id', empleadoId)
        .order('otorgado_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as TiradaDetalleRow[]).map((r) => {
        // PostgREST embebido: puede venir como array o como objeto según relación
        const rawPremio = r.premio
        const premio = Array.isArray(rawPremio) ? (rawPremio[0] ?? null) : rawPremio
        return {
          id: String(r.id),
          empleado_id: String(r.empleado_id),
          empleado_nombre: empleadoNombre,
          motivo: r.motivo ? String(r.motivo) : null,
          otorgado_at: String(r.otorgado_at),
          premio_id: r.premio_id ? String(r.premio_id) : null,
          premio_nombre: premio?.nombre ?? null,
          premio_tipo: premio?.tipo ?? null,
          premio_valor: premio ? Number(premio.valor) : null,
          premio_icono: premio?.icono ?? null,
          tirada_at: r.tirada_at ? String(r.tirada_at) : null,
          solicitado_at: r.solicitado_at ? String(r.solicitado_at) : null,
          canje_notas: r.canje_notas ? String(r.canje_notas) : null,
          entregado: Boolean(r.entregado),
          entregado_at: r.entregado_at ? String(r.entregado_at) : null,
        }
      })
    },
  })

  const marcar = useMutation({
    mutationFn: async (input: { id: string; entregado: boolean }) => {
      const { error } = await supabase.rpc('ruleta_marcar_entregado', {
        p_tirada: input.id,
        p_entregado: input.entregado,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ruleta'] })
    },
    onError: (e) => toast({ title: 'No se pudo actualizar', description: e instanceof Error ? e.message : '', variant: 'error' }),
  })

  const borrar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trabajadores_ruleta_tiradas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ruleta'] }),
    onError: (e) => toast({ title: 'No se pudo borrar', description: e instanceof Error ? e.message : '', variant: 'error' }),
  })

  const handleBorrar = async (t: TiradaDetalle) => {
    const ok = await confirm({
      title: '¿Borrar esta tirada?',
      description: t.premio_nombre
        ? `Borrarás el resultado "${t.premio_nombre}" del histórico.`
        : 'Borrarás una tirada pendiente sin tirar.',
      confirmLabel: 'Borrar',
      variant: 'danger',
    })
    if (!ok) return
    borrar.mutate(t.id)
  }

  return (
    <Modal onClose={onClose} size="2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">{empleadoNombre}</h2>
          <p className="text-xs text-[var(--color-ink-3)]">Histórico de tiradas</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="px-5 py-4">
        {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {data && data.length === 0 && <p className="text-sm text-[var(--color-ink-3)]">Sin tiradas todavía.</p>}
        {data && data.length > 0 && (
          <ul className="space-y-1.5">
            {data.map((t) => (
              <li
                key={t.id}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
              >
                <span className="text-2xl">{t.premio_icono ?? (t.premio_id ? '🎁' : '⏳')}</span>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[var(--color-ink)]">
                    {t.premio_nombre ?? <span className="italic text-[var(--color-ink-3)]">Pendiente de tirar</span>}
                    {t.premio_tipo && (
                      <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${TIPO_COLOR[t.premio_tipo]}`}>
                        {TIPO_LABEL[t.premio_tipo]}
                        {t.premio_tipo === 'puntos' && t.premio_valor ? ` · +${t.premio_valor}` : ''}
                        {t.premio_tipo === 'euros' && t.premio_valor ? ` · ${euros(t.premio_valor)}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-[var(--color-ink-3)]">
                    {t.motivo ? <>«{t.motivo}» · </> : null}
                    Otorgada {format(new Date(t.otorgado_at), "d LLL HH:mm", { locale: es })}
                    {t.tirada_at && <> · tirada {format(new Date(t.tirada_at), "d LLL", { locale: es })}</>}
                    {t.solicitado_at && <> · pedido {format(new Date(t.solicitado_at), "d LLL HH:mm", { locale: es })}</>}
                    {t.entregado && t.entregado_at && <> · entregado {format(new Date(t.entregado_at), "d LLL", { locale: es })}</>}
                  </div>
                </div>
                {/* Flujo único: solo se puede confirmar el canje si el empleado lo ha solicitado */}
                {!t.premio_id ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    sin tirar
                  </span>
                ) : t.entregado ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => marcar.mutate({ id: t.id, entregado: false })}
                    disabled={marcar.isPending}
                    title="Marcar como NO entregado"
                    className="h-7"
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> Entregado
                  </Button>
                ) : t.solicitado_at ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => marcar.mutate({ id: t.id, entregado: true })}
                    disabled={marcar.isPending}
                    title="Confirmar el canje solicitado"
                    className="h-7"
                  >
                    Confirmar canje
                  </Button>
                ) : (
                  <span className="rounded-full bg-[rgba(255,255,255,.07)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-ink-3)]">
                    esperando solicitud
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleBorrar(t)}
                  className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                  title="Borrar tirada"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// 4. Catálogo de premios (CRUD)
// ---------------------------------------------------------------------------
function CatalogoSection() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Premio | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['ruleta', 'catalogo'] as const,
    queryFn: async (): Promise<Premio[]> => {
      const { data, error } = await supabase
        .from('trabajadores_ruleta_premios')
        .select('*')
        .order('activo', { ascending: false })
        .order('created_at')
      if (error) throw error
      return (data ?? []).map((p) => ({
        ...p,
        valor: Number(p.valor ?? 0),
        peso: Number(p.peso ?? 1),
      })) as Premio[]
    },
  })

  const toggleActivo = useMutation({
    mutationFn: async (p: Premio) => {
      const { error } = await supabase
        .from('trabajadores_ruleta_premios')
        .update({ activo: !p.activo })
        .eq('id', p.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ruleta'] }),
  })

  const borrar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trabajadores_ruleta_premios').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ruleta'] }),
    onError: (e) => toast({
      title: 'No se pudo borrar',
      description: e instanceof Error ? e.message : 'Quizá tiene tiradas. Desactívalo en su lugar.',
      variant: 'error',
    }),
  })

  const handleBorrar = async (p: Premio) => {
    const ok = await confirm({
      title: `¿Borrar "${p.nombre}"?`,
      description: 'Si tiene tiradas históricas falla. Mejor desactívalo.',
      confirmLabel: 'Borrar',
      variant: 'danger',
    })
    if (!ok) return
    borrar.mutate(p.id)
  }

  const totalProbActiva = (data ?? []).filter((p) => p.activo).reduce((sum, p) => sum + p.peso, 0)

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Catálogo de premios</h2>
          {data && data.length > 0 && (
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-3)]">
              Probabilidades activas: {totalProbActiva}/100
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Nuevo premio
        </Button>
      </div>

      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}

      {data && data.length > 0 && (
        <ul className="grid gap-2 md:grid-cols-2">
          {data.map((p) => (
            <li
              key={p.id}
              className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm ${
                !p.activo ? 'opacity-50' : ''
              }`}
            >
              <span className="text-2xl">{p.icono ?? '🎁'}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-[var(--color-ink)]">{p.nombre}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${TIPO_COLOR[p.tipo]}`}>
                    {TIPO_LABEL[p.tipo]}
                    {p.tipo === 'puntos' && p.valor ? ` · +${p.valor}` : ''}
                    {p.tipo === 'euros' && p.valor ? ` · ${euros(p.valor)}` : ''}
                  </span>
                  <span className="rounded-full bg-[rgba(255,255,255,.07)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-ink-2)]">
                    prob. {p.peso}/100
                  </span>
                  {p.garantizable && (
                    <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700" title="Premio garantizable (pity timer)">
                      <ShieldCheck className="h-3 w-3" /> garantizable
                    </span>
                  )}
                </div>
                {p.descripcion && (
                  <div className="truncate text-[11px] text-[var(--color-ink-3)]">{p.descripcion}</div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)} className="h-7" title="Editar">
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleActivo.mutate(p)}
                  disabled={toggleActivo.isPending}
                  className="h-7"
                  title={p.activo ? 'Desactivar' : 'Activar'}
                >
                  {p.activo ? 'Pausar' : 'Activar'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleBorrar(p)}
                  className="h-7 w-7 p-0 text-red-600 hover:bg-red-50"
                  title="Borrar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(showAdd || editing) && (
        <PremioFormModal
          premio={editing}
          onClose={() => { setShowAdd(false); setEditing(null) }}
        />
      )}
    </section>
  )
}

function PremioFormModal({ premio, onClose }: { premio: Premio | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState(premio?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(premio?.descripcion ?? '')
  const [tipo, setTipo] = useState<Tipo>(premio?.tipo ?? 'puntos')
  const [valor, setValor] = useState(premio?.valor ?? 0)
  const [peso, setPeso] = useState(premio?.peso ?? 1)
  const [icono, setIcono] = useState(premio?.icono ?? '')
  const [color, setColor] = useState(premio?.color ?? 'amber')
  const [garantizable, setGarantizable] = useState(premio?.garantizable ?? false)

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        tipo,
        valor,
        peso,
        icono: icono.trim() || null,
        color,
        garantizable,
      }
      if (!payload.nombre) throw new Error('El nombre es obligatorio')
      if (payload.peso < 1 || payload.peso > 100) throw new Error('Probabilidad debe estar entre 1 y 100')

      if (premio) {
        const { error } = await supabase.from('trabajadores_ruleta_premios').update(payload).eq('id', premio.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('trabajadores_ruleta_premios').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ruleta'] })
      onClose()
    },
    onError: (e) => toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'error' }),
  })

  return (
    <Modal onClose={onClose} size="md">
      <div className="border-b border-[var(--color-border)] px-5 py-4">
        <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
          {premio ? 'Editar premio' : 'Nuevo premio'}
        </h2>
      </div>
      <div className="space-y-3 px-5 py-4">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-[var(--color-ink-3)]">Nombre</label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="+10 puntos, Café gratis…" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-[var(--color-ink-3)]">Descripción (opcional)</label>
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Suma 10 puntos al mes" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-[var(--color-ink-3)]">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as Tipo)}
              className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
            >
              <option value="puntos">Puntos</option>
              <option value="euros">Euros</option>
              <option value="fisico">Físico</option>
              <option value="comodin">Comodín</option>
              <option value="bonus">Tirada extra</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-[var(--color-ink-3)]">
              Valor {tipo === 'puntos' ? '(pts)' : tipo === 'euros' ? '(€)' : '(no aplica)'}
            </label>
            <Input
              type="number"
              value={valor}
              onChange={(e) => setValor(Number(e.target.value) || 0)}
              disabled={tipo === 'fisico' || tipo === 'comodin' || tipo === 'bonus'}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-[var(--color-ink-3)]">
              Probabilidad (1-100)
            </label>
            <Input
              type="number"
              min={1}
              max={100}
              value={peso}
              onChange={(e) => setPeso(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            />
            <p className="mt-1 text-[10px] text-[var(--color-ink-3)]">Más alto = sale más veces. Ideal: activos suman 100.</p>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-[var(--color-ink-3)]">Emoji</label>
            <Input value={icono} onChange={(e) => setIcono(e.target.value)} placeholder="🎁" maxLength={4} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-[var(--color-ink-3)]">Color</label>
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm capitalize"
            >
              {COLOR_OPTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={garantizable}
            onChange={(e) => setGarantizable(e.target.checked)}
            className="h-4 w-4 accent-emerald-600"
          />
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span className="text-[var(--color-ink-2)]">Garantizable (pity timer)</span>
        </label>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
