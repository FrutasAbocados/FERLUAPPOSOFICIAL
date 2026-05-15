import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronDown, ChevronRight, ShoppingBasket } from 'lucide-react'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import type { EmpleadoPropio } from '../lib/useEmpleadoPropio'

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
function qty(v: number) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(v)
}

function mesSiguiente(mesISO: string) {
  const d = parseISO(mesISO)
  return format(new Date(d.getFullYear(), d.getMonth() + 1, 1), 'yyyy-MM-dd')
}

function useCreditoActual(empleadoId: string) {
  return useQuery({
    queryKey: ['emp-credito-actual', empleadoId] as const,
    queryFn: async (): Promise<EstadoActual | null> => {
      const { data, error } = await supabase.rpc('trabajadores_credito_estado_actual')
      if (error) throw error
      const mine = ((data ?? []) as EstadoActual[]).find(r => r.empleado_id === empleadoId)
      if (!mine) return null
      return {
        ...mine,
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
        .select('id, empleado_id, fecha, total, nota, created_at')
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
  const mesISO = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const [facturaAbierta, setFacturaAbierta] = useState<string | null>(null)
  const actual = useCreditoActual(empleado.id)
  const historico = useHistorico(empleado.id)
  const facturas = useFacturasMes(empleado.id, mesISO)

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
}: {
  factura: FacturaCabecera
  abierta: boolean
  onToggle: () => void
}) {
  const lineas = useLineasFactura(abierta ? factura.id : null)

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-[var(--ink)]">{format(parseISO(factura.fecha), 'd LLL yyyy', { locale: es })}</div>
          {factura.nota && <div className="text-xs text-[var(--ink-mute)]">{factura.nota}</div>}
        </div>
        <div className="font-display text-base font-bold tabular-nums text-[var(--ink)]">{euros(factura.total)}</div>
        {abierta ? <ChevronDown className="h-4 w-4 text-[var(--ink-mute)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-mute)]" />}
      </button>
      {abierta && (
        <div className="border-t border-[var(--line)] bg-[var(--color-surface-2)] px-4 py-3">
          {lineas.isLoading && <p className="text-xs text-[var(--ink-mute)]">Cargando líneas…</p>}
          <ul className="space-y-1">
            {lineas.data?.map(l => (
              <li key={l.id} className="grid grid-cols-[1fr_auto] gap-2 text-xs">
                <span className="truncate text-[var(--ink-dim)]">{l.nombre} · {qty(l.units)} x {euros(l.price)}</span>
                <span className="tabular-nums text-[var(--ink)]">{euros(l.subtotal)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}
