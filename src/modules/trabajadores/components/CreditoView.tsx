import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronDown, ChevronRight, Plus, ShoppingBasket, Trash2, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { eurosOrDash } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { ProductoAutocomplete } from '@/modules/manager/components/ProductoAutocomplete'

const eur = eurosOrDash

const fmtFecha = (d: string | null | undefined) =>
  d == null ? '—' : format(parseISO(d), 'd LLL yyyy', { locale: es })

const fmtMes = (d: string) =>
  format(parseISO(d), 'LLLL yyyy', { locale: es })

interface EstadoActual {
  empleado_id: string
  nombre: string
  limite_base: number
  exceso_arrastrado: number
  gastado: number
  disponible: number
  exceso_nuevo: number
}

interface FacturaCabecera {
  id: string
  empleado_id: string
  fecha: string
  total: number
  nota: string | null
  created_at: string
}

interface LineaForm {
  product_id: string | null
  nombre: string
  units: string
  price: string
}

interface LineaDB {
  id: string
  factura_id: string
  product_id: string | null
  nombre: string
  units: number
  price: number
  subtotal: number
}

interface MesHistorico {
  mes: string
  limite_base: number
  exceso_arrastrado: number
  gastado: number
  num_facturas: number
  disponible: number
  exceso_nuevo: number
}

const nuevaLinea = (): LineaForm => ({ product_id: null, nombre: '', units: '1', price: '' })
const lineaTotal = (l: LineaForm) => {
  const u = Number(l.units.replace(',', '.')) || 0
  const p = Number(l.price.replace(',', '.')) || 0
  return u * p
}

function useEstadoActual() {
  return useQuery({
    queryKey: ['credito-estado-actual'] as const,
    queryFn: async (): Promise<EstadoActual[]> => {
      const { data, error } = await supabase.rpc('trabajadores_credito_estado_actual')
      if (error) throw error
      return (data ?? []).map((r: EstadoActual) => ({
        ...r,
        limite_base: Number(r.limite_base),
        exceso_arrastrado: Number(r.exceso_arrastrado),
        gastado: Number(r.gastado),
        disponible: Number(r.disponible),
        exceso_nuevo: Number(r.exceso_nuevo),
      }))
    },
  })
}

function useHistorico(empleadoId: string | null) {
  return useQuery({
    queryKey: ['credito-historico', empleadoId] as const,
    enabled: !!empleadoId,
    queryFn: async (): Promise<MesHistorico[]> => {
      const { data, error } = await supabase.rpc('trabajadores_credito_historico', { p_empleado_id: empleadoId })
      if (error) throw error
      return (data ?? []).map((r: MesHistorico) => ({
        ...r,
        limite_base: Number(r.limite_base),
        exceso_arrastrado: Number(r.exceso_arrastrado),
        gastado: Number(r.gastado),
        num_facturas: Number(r.num_facturas),
        disponible: Number(r.disponible),
        exceso_nuevo: Number(r.exceso_nuevo),
      }))
    },
  })
}

function useFacturasMes(empleadoId: string | null, mesISO: string | null) {
  return useQuery({
    queryKey: ['credito-facturas-mes', empleadoId, mesISO] as const,
    enabled: !!empleadoId && !!mesISO,
    queryFn: async (): Promise<FacturaCabecera[]> => {
      const inicio = mesISO!
      const fin = format(new Date(new Date(mesISO!).getFullYear(), new Date(mesISO!).getMonth() + 1, 1), 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('trabajadores_credito_facturas')
        .select('id, empleado_id, fecha, total, nota, created_at')
        .eq('empleado_id', empleadoId)
        .gte('fecha', inicio)
        .lt('fecha', fin)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r: FacturaCabecera) => ({ ...r, total: Number(r.total) }))
    },
  })
}

function useLineasFactura(facturaId: string | null) {
  return useQuery({
    queryKey: ['credito-lineas', facturaId] as const,
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
        units: Number(r.units),
        price: Number(r.price),
        subtotal: Number(r.subtotal),
      }))
    },
  })
}

function useAddFactura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      empleado_id: string
      fecha: string
      nota: string | null
      lineas: Array<{ product_id: string | null; nombre: string; units: number; price: number }>
    }) => {
      const { data, error } = await supabase.rpc('trabajadores_credito_factura_create', {
        p_empleado_id: input.empleado_id,
        p_fecha:       input.fecha,
        p_nota:        input.nota ?? '',
        p_lineas:      input.lineas.map(l => ({
          product_id: l.product_id ?? '',
          nombre:     l.nombre,
          units:      l.units,
          price:      l.price,
        })),
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credito-estado-actual'] })
      qc.invalidateQueries({ queryKey: ['credito-historico'] })
      qc.invalidateQueries({ queryKey: ['credito-facturas-mes'] })
    },
  })
}

function useDeleteFactura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trabajadores_credito_facturas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credito-estado-actual'] })
      qc.invalidateQueries({ queryKey: ['credito-historico'] })
      qc.invalidateQueries({ queryKey: ['credito-facturas-mes'] })
    },
  })
}

export function CreditoView() {
  const { data, isLoading } = useEstadoActual()
  const [selected, setSelected] = useState<EstadoActual | null>(null)

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 border-b border-[var(--color-border)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Trabajadores</p>
        <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">Crédito frutas y verduras</h1>
        <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
          Productos que se llevan a casa los trabajadores pack 1. Crédito mensual configurable. El exceso se descuenta del mes siguiente.
        </p>
      </header>

      {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
      {data?.length === 0 && (
        <p className="ao-card px-4 py-6 text-sm text-[var(--color-ink-3)]">
          No hay trabajadores activos en pack 1.
        </p>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {data?.map(t => {
          const sobregiro = t.disponible < 0
          return (
            <li key={t.empleado_id}>
              <button
                onClick={() => setSelected(t)}
                className="ao-card grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 p-4 text-left transition hover:border-[var(--color-primary)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary-soft)]">
                  <ShoppingBasket className="h-5 w-5 text-[var(--color-primary-2)]" />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[var(--color-ink)]">{t.nombre}</div>
                  <div className="text-xs text-[var(--color-ink-3)]">
                    Límite {eur(t.limite_base)}
                    {t.exceso_arrastrado > 0 && (
                      <span className="ml-1 text-[var(--color-primary)]">· arrastre −{eur(t.exceso_arrastrado)}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-display text-lg font-bold tabular-nums ${sobregiro ? 'text-[var(--coral)]' : 'text-[var(--mint)]'}`}>
                    {eur(t.disponible)}
                  </div>
                  <div className="text-xs text-[var(--color-ink-3)]">disponible</div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {selected && (
        <DetalleEmpleado
          empleado={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function DetalleEmpleado({ empleado, onClose }: { empleado: EstadoActual; onClose: () => void }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const mesActualISO = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')

  const { data: historico } = useHistorico(empleado.empleado_id)
  const { data: facturasMes } = useFacturasMes(empleado.empleado_id, mesActualISO)
  const add = useAddFactura()
  const del = useDeleteFactura()

  const [fecha, setFecha] = useState(today)
  const [nota, setNota] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([nuevaLinea()])
  const [mesAbierto, setMesAbierto] = useState<string | null>(null)

  const totalForm = useMemo(() => lineas.reduce((s, l) => s + lineaTotal(l), 0), [lineas])
  const updateLinea = (i: number, patch: Partial<LineaForm>) =>
    setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const removeLinea = (i: number) =>
    setLineas(prev => prev.length === 1 ? [nuevaLinea()] : prev.filter((_, idx) => idx !== i))

  const guardar = async () => {
    const lineasValidas = lineas
      .map(l => ({
        product_id: l.product_id,
        nombre: l.nombre.trim(),
        units: Number(l.units.replace(',', '.')),
        price: Number(l.price.replace(',', '.')),
      }))
      .filter(l => l.nombre && Number.isFinite(l.units) && l.units > 0 && Number.isFinite(l.price) && l.price >= 0)
    if (!fecha || lineasValidas.length === 0) {
      toast({ title: 'Añade fecha y al menos una línea válida', variant: 'error' })
      return
    }
    try {
      await add.mutateAsync({
        empleado_id: empleado.empleado_id,
        fecha,
        nota: nota.trim() || null,
        lineas: lineasValidas,
      })
      setFecha(today)
      setNota('')
      setLineas([nuevaLinea()])
      toast({ title: 'Factura interna guardada', variant: 'success' })
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  const eliminar = async (id: string) => {
    const ok = await confirm({
      title: '¿Borrar esta factura interna?',
      description: 'Se eliminan también sus líneas. No se puede deshacer.',
      confirmLabel: 'Borrar',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await del.mutateAsync(id)
    } catch (e) {
      toast({ title: 'No se pudo borrar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  const sobregiroActual = empleado.disponible < 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 md:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-3xl rounded-2xl bg-[var(--color-surface)] shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">{empleado.nombre}</h2>
            <p className="text-xs text-[var(--color-ink-3)]">Crédito frutas y verduras</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* KPIs mes actual */}
          <section className="rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Mes actual</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="Límite" value={eur(empleado.limite_base)} />
              <Kpi label="Arrastre anterior" value={empleado.exceso_arrastrado > 0 ? `−${eur(empleado.exceso_arrastrado)}` : '—'} tone={empleado.exceso_arrastrado > 0 ? 'amber' : 'neutral'} />
              <Kpi label="Gastado" value={eur(empleado.gastado)} />
              <Kpi label="Disponible" value={eur(empleado.disponible)} tone={sobregiroActual ? 'red' : 'green'} />
            </div>
            {empleado.exceso_nuevo > 0 && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                Pasó del límite. Se descontarán <strong>{eur(empleado.exceso_nuevo)}</strong> del próximo mes.
              </p>
            )}
          </section>

          {/* Form nueva factura */}
          <section className="rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Apuntar consumo</h3>
            <div className="grid gap-2 md:grid-cols-[140px_1fr]">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Fecha</label>
                <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Nota (opcional)</label>
                <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ej. fin de semana" className="h-9" />
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Productos</span>
                <Button size="sm" variant="outline" onClick={() => setLineas(prev => [...prev, nuevaLinea()])}>
                  <Plus className="mr-1 h-3 w-3" />Línea
                </Button>
              </div>
              <ul className="space-y-2">
                {lineas.map((l, i) => (
                  <li key={i} className="rounded-lg border border-[var(--color-border)] p-2 md:border-0 md:p-0">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_80px_100px_100px_auto] md:items-end">
                      <ProductoAutocomplete
                        value={l.nombre}
                        onChange={(v) => updateLinea(i, { nombre: v, product_id: null })}
                        onPick={(p) => updateLinea(i, {
                          nombre: p.nombre,
                          product_id: p.product_id,
                          price: p.ultimo_precio == null ? l.price : String(Number(p.ultimo_precio).toFixed(2)),
                        })}
                        placeholder="Producto (catálogo Holded)"
                      />
                      <div className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-2 md:contents">
                        <Input type="number" step="0.01" min="0" placeholder="Ud" value={l.units}
                          onChange={(e) => updateLinea(i, { units: e.target.value })}
                          className="h-9 tabular-nums text-right" />
                        <Input type="number" step="0.01" min="0" placeholder="Precio" value={l.price}
                          onChange={(e) => updateLinea(i, { price: e.target.value })}
                          className="h-9 tabular-nums text-right" />
                        <span className="px-2 text-right text-sm font-medium tabular-nums text-[var(--color-ink)]">
                          {eur(lineaTotal(l))}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => removeLinea(i)} title="Eliminar">
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-3">
              <span className="text-sm text-[var(--color-ink-3)]">{lineas.filter(l => l.nombre.trim()).length} producto(s)</span>
              <div className="flex items-center gap-3">
                <span className="text-base font-bold tabular-nums text-emerald-700">{eur(totalForm)}</span>
                <Button onClick={guardar} disabled={totalForm <= 0 || add.isPending}>
                  {add.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </div>
          </section>

          {/* Facturas mes actual */}
          {facturasMes && facturasMes.length > 0 && (
            <section className="rounded-lg border border-[var(--color-border)]">
              <div className="border-b border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)]">
                Cargas este mes ({facturasMes.length})
              </div>
              <ul className="divide-y divide-[var(--color-border)]">
                {facturasMes.map(f => (
                  <FacturaItem key={f.id} factura={f} onDelete={() => eliminar(f.id)} />
                ))}
              </ul>
            </section>
          )}

          {/* Histórico */}
          {historico && historico.length > 1 && (
            <section className="rounded-lg border border-[var(--color-border)]">
              <div className="border-b border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)]">
                Histórico mensual
              </div>
              <ul className="divide-y divide-[var(--color-border)]">
                {historico.slice().reverse().filter(m => m.mes !== mesActualISO).map(m => {
                  const abierto = mesAbierto === m.mes
                  return (
                    <li key={m.mes}>
                      <button
                        onClick={() => setMesAbierto(abierto ? null : m.mes)}
                        className="grid w-full grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[var(--color-surface-2,#f8fafc)]"
                      >
                        {abierto ? <ChevronDown className="h-4 w-4 text-[var(--color-ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--color-ink-3)]" />}
                        <span className="capitalize text-[var(--color-ink)]">{fmtMes(m.mes)}</span>
                        <span className="text-xs text-[var(--color-ink-3)] tabular-nums">{m.num_facturas} cargo(s)</span>
                        <span className="font-medium tabular-nums text-[var(--color-ink)]">{eur(m.gastado)}</span>
                        {m.exceso_nuevo > 0 ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">+{eur(m.exceso_nuevo)} exceso</span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">ok</span>
                        )}
                      </button>
                      {abierto && (
                        <MesDetalle empleadoId={empleado.empleado_id} mes={m.mes} />
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function FacturaItem({ factura, onDelete }: { factura: FacturaCabecera; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const { data: lineas } = useLineasFactura(open ? factura.id : null)

  return (
    <li>
      <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-2 text-sm">
        <button onClick={() => setOpen(o => !o)} className="text-[var(--color-ink-3)]">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <button onClick={() => setOpen(o => !o)} className="flex items-baseline gap-3 text-left">
          <span className="text-[var(--color-ink)]">{fmtFecha(factura.fecha)}</span>
          {factura.nota && <span className="truncate text-xs text-[var(--color-ink-3)]">{factura.nota}</span>}
        </button>
        <span className="font-medium tabular-nums text-[var(--color-ink)]">{eur(factura.total)}</span>
        <Button size="sm" variant="ghost" onClick={onDelete} title="Eliminar">
          <Trash2 className="h-3.5 w-3.5 text-red-600" />
        </Button>
      </div>
      {open && lineas && (
        <ul className="bg-[rgba(255,255,255,.03)] px-12 py-2 text-xs">
          {lineas.map(l => (
            <li key={l.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-0.5">
              <span className="truncate text-[var(--color-ink)]">{l.nombre}</span>
              <span className="tabular-nums text-[var(--color-ink-3)]">{l.units} ud</span>
              <span className="tabular-nums text-[var(--color-ink-3)]">{eur(l.price)}/ud</span>
              <span className="tabular-nums font-medium text-[var(--color-ink)]">{eur(l.subtotal)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function MesDetalle({ empleadoId, mes }: { empleadoId: string; mes: string }) {
  const { data: facturas, isLoading } = useFacturasMes(empleadoId, mes)
  if (isLoading) return <div className="bg-[var(--color-surface-2)] px-12 py-2 text-xs text-[var(--color-ink-3)]">Cargando…</div>
  if (!facturas?.length) return <div className="bg-[var(--color-surface-2)] px-12 py-2 text-xs text-[var(--color-ink-3)]">Sin cargos</div>
  return (
    <div className="bg-[rgba(255,255,255,.03)] px-4 py-2">
      <ul className="divide-y divide-[var(--color-border)]/50">
        {facturas.map(f => <FacturaItemSimple key={f.id} factura={f} />)}
      </ul>
    </div>
  )
}

function FacturaItemSimple({ factura }: { factura: FacturaCabecera }) {
  const [open, setOpen] = useState(false)
  const { data: lineas } = useLineasFactura(open ? factura.id : null)
  return (
    <li>
      <button
        onClick={() => setOpen(o => !o)}
        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 py-1.5 text-left text-xs"
      >
        {open ? <ChevronDown className="h-3 w-3 text-[var(--color-ink-3)]" /> : <ChevronRight className="h-3 w-3 text-[var(--color-ink-3)]" />}
        <span className="text-[var(--color-ink)]">{fmtFecha(factura.fecha)} {factura.nota && <span className="text-[var(--color-ink-3)]">· {factura.nota}</span>}</span>
        <span className="tabular-nums font-medium text-[var(--color-ink)]">{eur(factura.total)}</span>
      </button>
      {open && lineas && (
        <ul className="ml-8 mt-0.5 mb-1 space-y-0.5 text-xs">
          {lineas.map(l => (
            <li key={l.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3">
              <span className="truncate text-[var(--color-ink-2)]">{l.nombre}</span>
              <span className="tabular-nums text-[var(--color-ink-3)]">{l.units} ud</span>
              <span className="tabular-nums text-[var(--color-ink-3)]">{eur(l.price)}/ud</span>
              <span className="tabular-nums text-[var(--color-ink-2)]">{eur(l.subtotal)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function Kpi({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'green' | 'red' | 'amber' }) {
  const color =
    tone === 'green' ? 'text-emerald-700' :
    tone === 'red' ? 'text-red-600' :
    tone === 'amber' ? 'text-amber-700' :
    'text-[var(--color-ink)]'
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{label}</div>
      <div className={`mt-0.5 font-display text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}
