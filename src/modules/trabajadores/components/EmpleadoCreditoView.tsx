import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronDown, ChevronRight, Send, ShoppingBasket, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { euros, numDec } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import type { EmpleadoPropio } from '../lib/useEmpleadoPropio'

type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada'

type EstadoActual = {
  empleado_id: string
  nombre: string
  limite_base: number
  exceso_arrastrado: number
  gastado: number
  disponible: number
  exceso_nuevo: number
}

type MesHistorico = {
  mes: string
  limite_base: number
  exceso_arrastrado: number
  gastado: number
  num_facturas: number
  disponible: number
  exceso_nuevo: number
}

type FacturaCabecera = {
  id: string
  empleado_id: string
  fecha: string
  total: number
  nota: string | null
  estado: EstadoSolicitud
  motivo_rechazo: string | null
  created_at: string
}

type LineaDB = {
  id: string
  factura_id: string
  product_id: string | null
  nombre: string
  units: number
  price: number
  subtotal: number
}

function num(v: unknown) { return Number(v ?? 0) }

function mesSiguiente(mesISO: string) {
  const d = parseISO(mesISO)
  return format(new Date(d.getFullYear(), d.getMonth() + 1, 1), 'yyyy-MM-dd')
}

function useCreditoActual(empleadoId: string, mesISO: string) {
  return useQuery({
    queryKey: ['emp-credito-actual', empleadoId, mesISO] as const,
    queryFn: async (): Promise<EstadoActual | null> => {
      const { data, error } = await supabase.rpc('trabajadores_credito_estado_mes', {
        p_empleado_id: empleadoId,
        p_mes: mesISO,
      })
      if (error) throw error
      const mine = ((data ?? []) as EstadoActual[])[0]
      if (!mine) return null
      return {
        ...mine,
        empleado_id: empleadoId,
        limite_base: num(mine.limite_base),
        exceso_arrastrado: num(mine.exceso_arrastrado),
        gastado: num(mine.gastado),
        disponible: num(mine.disponible),
        exceso_nuevo: num(mine.exceso_nuevo),
      }
    },
  })
}

function useHistorico(empleadoId: string) {
  return useQuery({
    queryKey: ['emp-credito-historico', empleadoId] as const,
    queryFn: async (): Promise<MesHistorico[]> => {
      const { data, error } = await supabase.rpc('trabajadores_credito_historico', { p_empleado_id: empleadoId })
      if (error) throw error
      return (data ?? []).map((r: MesHistorico) => ({
        ...r,
        limite_base: num(r.limite_base),
        exceso_arrastrado: num(r.exceso_arrastrado),
        gastado: num(r.gastado),
        num_facturas: num(r.num_facturas),
        disponible: num(r.disponible),
        exceso_nuevo: num(r.exceso_nuevo),
      }))
    },
  })
}

function useFacturasMes(empleadoId: string, mesISO: string) {
  return useQuery({
    queryKey: ['emp-credito-facturas', empleadoId, mesISO] as const,
    queryFn: async (): Promise<FacturaCabecera[]> => {
      const { data, error } = await supabase
        .from('trabajadores_credito_facturas')
        .select('id, empleado_id, fecha, total, nota, estado, motivo_rechazo, created_at')
        .eq('empleado_id', empleadoId)
        .gte('fecha', mesISO)
        .lt('fecha', mesSiguiente(mesISO))
        .order('fecha', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r: FacturaCabecera) => ({ ...r, total: num(r.total) }))
    },
  })
}

function useLineasFactura(facturaId: string | null) {
  return useQuery({
    queryKey: ['emp-credito-lineas', facturaId] as const,
    enabled: !!facturaId,
    queryFn: async (): Promise<LineaDB[]> => {
      const { data, error } = await supabase
        .from('trabajadores_credito_lineas')
        .select('id, factura_id, product_id, nombre, units, price, subtotal')
        .eq('factura_id', facturaId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r: LineaDB) => ({
        ...r,
        units: num(r.units),
        price: num(r.price),
        subtotal: num(r.subtotal),
      }))
    },
  })
}

export function EmpleadoCreditoView({ empleado }: { empleado: EmpleadoPropio }) {
  const qc = useQueryClient()
  const mesISO = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const [facturaAbierta, setFacturaAbierta] = useState<string | null>(null)
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [articulo, setArticulo] = useState('')
  const [pesoStr, setPesoStr] = useState('')
  const [nota, setNota] = useState('')
  const actual = useCreditoActual(empleado.id, mesISO)
  const historico = useHistorico(empleado.id)
  const facturas = useFacturasMes(empleado.id, mesISO)

  const peso = Number(pesoStr.replace(',', '.'))
  const solicitar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('trabajadores_credito_solicitar', {
        p_fecha: fecha,
        p_nota: nota.trim() || null,
        p_lineas: [{ nombre: articulo.trim(), units: peso }],
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emp-credito-facturas'] })
      setArticulo('')
      setPesoStr('')
      setNota('')
      toast({
        title: 'Solicitud enviada',
        description: 'Álvaro asignará el precio y la aprobará.',
        variant: 'success',
      })
    },
    onError: (e) => toast({
      title: 'No se pudo enviar',
      description: e instanceof Error ? e.message : '',
      variant: 'error',
    }),
  })

  const cancelar = useMutation({
    mutationFn: async (facturaId: string) => {
      const { error } = await supabase.rpc('trabajadores_credito_cancelar_propia', {
        p_factura_id: facturaId,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emp-credito-facturas'] }),
    onError: (e) => toast({
      title: 'No se pudo anular',
      description: e instanceof Error ? e.message : '',
      variant: 'error',
    }),
  })

  const usadoPct = useMemo(() => {
    const limite = actual.data?.limite_base ?? 0
    if (limite <= 0) return 0
    return Math.min(100, ((actual.data?.gastado ?? 0) / limite) * 100)
  }, [actual.data])

  const disponible = actual.data?.disponible ?? 0

  return (
    <div className="ao-page max-w-3xl space-y-4 py-5 md:py-7">
      <header>
        <div className="flex items-center gap-2">
          <ShoppingBasket className="h-5 w-5" style={{ color: 'var(--amber)' }} />
          <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Mi crédito</h1>
        </div>
        <p className="mt-1 text-xs text-[var(--ink-mute)]">Fruta y verdura que te llevas este mes.</p>
      </header>

      <section className="emp-hero-card">
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Disponible</div>
              <div
                className="font-display text-5xl font-bold tabular-nums leading-none"
                style={{ color: disponible < 0 ? 'var(--coral)' : 'var(--amber)' }}
              >
                {euros(disponible)}
              </div>
            </div>
            <div className="text-right text-xs text-[var(--ink-mute)]">
              <div>Límite: <span className="tabular-nums text-[var(--ink)]">{euros(actual.data?.limite_base ?? 0)}</span></div>
              <div>Gastado: <span className="tabular-nums text-[var(--ink)]">{euros(actual.data?.gastado ?? 0)}</span></div>
              {(actual.data?.exceso_arrastrado ?? 0) > 0 && (
                <div>Arrastre: <span className="tabular-nums" style={{ color: 'var(--coral)' }}>-{euros(actual.data?.exceso_arrastrado ?? 0)}</span></div>
              )}
            </div>
          </div>
          <div className="mt-4">
            <div className="ao-progress-bar">
              <div
                className="ao-progress-bar-fill ao-progress-bar-fill-amber"
                style={{ '--progress': `${usadoPct}%` } as React.CSSProperties}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="ao-card p-4">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Apuntar fruta o verdura</h2>
          <p className="mt-0.5 text-xs text-[var(--ink-mute)]">
            Indica qué te llevas y su peso. El precio se añadirá al aprobar la solicitud.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[130px_1fr_110px]">
          <div>
            <label className="mb-0.5 block text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Fecha</label>
            <Input type="date" value={fecha} max={format(new Date(), 'yyyy-MM-dd')} onChange={(e) => setFecha(e.target.value)} className="h-9" />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Artículo</label>
            <Input value={articulo} onChange={(e) => setArticulo(e.target.value)} placeholder="Ej. tomates pera" className="h-9" />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Peso (kg)</label>
            <Input
              type="text"
              inputMode="decimal"
              value={pesoStr}
              onChange={(e) => setPesoStr(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="1,5"
              className="h-9 text-right tabular-nums"
            />
          </div>
        </div>
        <div className="mt-2">
          <label className="mb-0.5 block text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Nota (opcional)</label>
          <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. para casa" className="h-9" />
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            onClick={() => solicitar.mutate()}
            disabled={!fecha || !articulo.trim() || !Number.isFinite(peso) || peso <= 0 || solicitar.isPending}
          >
            <Send className="mr-1 h-4 w-4" />
            {solicitar.isPending ? 'Enviando…' : 'Enviar solicitud'}
          </Button>
        </div>
      </section>

      <section className="ao-card overflow-hidden p-0">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Movimientos del mes</h2>
        </div>
        {facturas.isLoading && <p className="p-4 text-sm text-[var(--ink-mute)]">Cargando…</p>}
        {!facturas.isLoading && (facturas.data?.length ?? 0) === 0 && (
          <p className="p-4 text-sm text-[var(--ink-mute)]">Sin movimientos este mes.</p>
        )}
        <ul className="divide-y divide-[var(--line)]">
          {facturas.data?.map(f => (
            <FacturaItem
              key={f.id}
              factura={f}
              abierta={facturaAbierta === f.id}
              onToggle={() => setFacturaAbierta(prev => prev === f.id ? null : f.id)}
              onCancel={f.estado === 'pendiente' ? async () => {
                const ok = await confirm({
                  title: '¿Anular esta solicitud?',
                  description: 'Solo puedes anularla mientras siga pendiente.',
                  confirmLabel: 'Anular',
                  variant: 'danger',
                })
                if (ok) cancelar.mutate(f.id)
              } : undefined}
            />
          ))}
        </ul>
      </section>

      {(historico.data?.length ?? 0) > 0 && (
        <section className="ao-card p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Últimos meses</h2>
          <div className="space-y-2">
            {historico.data?.slice(0, 4).map(m => (
              <div key={m.mes} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-sm">
                <div className="capitalize text-[var(--ink)]">{format(parseISO(m.mes), 'LLLL yyyy', { locale: es })}</div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums text-[var(--ink)]">{euros(m.gastado)}</div>
                  <div className="text-[10px] text-[var(--ink-mute)]">{m.num_facturas} mov.</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function FacturaItem({
  factura,
  abierta,
  onToggle,
  onCancel,
}: {
  factura: FacturaCabecera
  abierta: boolean
  onToggle: () => void
  onCancel?: () => void
}) {
  const lineas = useLineasFactura(abierta ? factura.id : null)

  return (
    <li>
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 px-4 py-3">
        <button type="button" onClick={onToggle} className="min-w-0 text-left">
          <div className="text-sm font-semibold text-[var(--ink)]">{format(parseISO(factura.fecha), 'd LLL yyyy', { locale: es })}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--ink-mute)]">
            <span className={
              factura.estado === 'aprobada' ? 'text-emerald-500' :
              factura.estado === 'rechazada' ? 'text-[var(--coral)]' : 'text-[var(--amber)]'
            }>{factura.estado}</span>
            {factura.nota && <span>· {factura.nota}</span>}
            {factura.estado === 'rechazada' && factura.motivo_rechazo && <span>· {factura.motivo_rechazo}</span>}
          </div>
        </button>
        <div className="font-display text-base font-bold tabular-nums text-[var(--ink)]">
          {factura.estado === 'aprobada' ? euros(factura.total) : '—'}
        </div>
        {onCancel ? (
          <Button size="sm" variant="ghost" onClick={onCancel} title="Anular solicitud" className="h-8 w-8 p-0">
            <Trash2 className="ao-text-danger h-3.5 w-3.5" />
          </Button>
        ) : <span className="w-8" />}
        <button type="button" onClick={onToggle} className="text-[var(--ink-mute)]">
          {abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
      {abierta && (
        <div className="border-t border-[var(--line)] bg-[var(--color-surface-2)] px-4 py-3">
          {lineas.isLoading && <p className="text-xs text-[var(--ink-mute)]">Cargando líneas…</p>}
          <ul className="space-y-1">
            {lineas.data?.map(l => (
              <li key={l.id} className="grid grid-cols-[1fr_auto] gap-2 text-xs">
                <span className="truncate text-[var(--ink-dim)]">
                  {l.nombre} · {numDec(l.units)} kg
                  {factura.estado === 'aprobada' && ` × ${euros(l.price)}/kg`}
                </span>
                <span className="tabular-nums text-[var(--ink)]">
                  {factura.estado === 'aprobada' ? euros(l.subtotal) : 'Precio pendiente'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}
