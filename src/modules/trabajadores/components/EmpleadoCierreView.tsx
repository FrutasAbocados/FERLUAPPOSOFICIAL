import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Plus,
  Receipt,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import type { FormaPago, GastoTipo } from '@/modules/cash/lib/repartos-types'
import type { EmpleadoPropio } from '../lib/useEmpleadoPropio'
import { useEnviarCierre, useMiCierre } from '../lib/cierre-propio-queries'

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

type RepartoUI = {
  _key: string
  contact_id: string | null
  contact_nombre: string
  forma_pago: FormaPago
  importe: number | ''
}

type GastoUI = {
  _key: string
  tipo: GastoTipo
  concepto: string
  importe: number | ''
}

const GASTO_TIPOS: { tipo: GastoTipo; label: string; emoji: string }[] = [
  { tipo: 'gasolina', label: 'Gasolina', emoji: '⛽' },
  { tipo: 'compras', label: 'Compras', emoji: '🛒' },
  { tipo: 'incidencia', label: 'Incidencia', emoji: '⚠️' },
]

export function EmpleadoCierreView({ empleado }: { empleado: EmpleadoPropio }) {
  const [fecha, setFecha] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'))
  const mi = useMiCierre(empleado.id, fecha)
  const yaRevisado = mi.data?.jornada.revisado === true

  return (
    <div className="mx-auto max-w-2xl px-3 py-4 md:px-6 md:py-6">
      <header className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-primary-soft)]">
          <ClipboardCheck className="h-5 w-5 text-[var(--color-primary-2)]" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-[var(--color-ink)]">Mi cierre del día</h1>
          <p className="text-xs text-[var(--color-ink-3)]">{empleado.nombre} · rellena tus repartos al terminar</p>
        </div>
      </header>

      {mi.isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-12 text-sm text-[var(--color-ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : yaRevisado ? (
        <RevisadoBanner fecha={fecha} setFecha={setFecha} />
      ) : (
        <CierreForm
          key={`${empleado.id}-${fecha}`}
          fecha={fecha}
          setFecha={setFecha}
          initial={mi.data}
        />
      )}
    </div>
  )
}

function RevisadoBanner({ fecha, setFecha }: { fecha: string; setFecha: (f: string) => void }) {
  return (
    <div className="space-y-4">
      <FechaPicker fecha={fecha} setFecha={setFecha} />
      <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--mint)]/30 bg-[var(--mint)]/10 p-8 text-center">
        <CheckCircle2 className="h-8 w-8 text-[var(--mint)]" />
        <p className="text-sm font-semibold text-[var(--color-ink)]">Cierre revisado por administración</p>
        <p className="text-xs text-[var(--color-ink-3)]">Ya no se puede modificar. Si hay un error, avisa a Álvaro.</p>
      </div>
    </div>
  )
}

function FechaPicker({ fecha, setFecha }: { fecha: string; setFecha: (f: string) => void }) {
  return (
    <Section icon={<ClipboardCheck className="h-4 w-4" />} title="Fecha del cierre" subtitle="Por defecto, hoy">
      <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-44" />
    </Section>
  )
}

function CierreForm({
  fecha,
  setFecha,
  initial,
}: {
  fecha: string
  setFecha: (f: string) => void
  initial: ReturnType<typeof useMiCierre>['data']
}) {
  const enviar = useEnviarCierre()

  const [notas, setNotas] = useState(initial?.jornada.notas ?? '')
  const [repartos, setRepartos] = useState<RepartoUI[]>(() =>
    (initial?.lineas ?? []).map((l) => ({
      _key: l.id,
      contact_id: l.contact_id,
      contact_nombre: l.contact_nombre,
      forma_pago: l.forma_pago,
      importe: Number(l.importe),
    })),
  )
  const [gastos, setGastos] = useState<GastoUI[]>(() =>
    (initial?.gastos ?? []).map((g) => ({
      _key: g.id,
      tipo: g.tipo,
      concepto: g.concepto,
      importe: Number(g.importe),
    })),
  )

  const addReparto = () =>
    setRepartos((p) => [...p, { _key: newKey(), contact_id: null, contact_nombre: '', forma_pago: 'efectivo', importe: '' }])

  const addGasto = () =>
    setGastos((p) => [...p, { _key: newKey(), tipo: 'gasolina', concepto: '', importe: '' }])

  const totales = useMemo(() => {
    const num = (v: number | '') => (v === '' ? 0 : Number(v))
    const efectivo = repartos.filter((r) => r.forma_pago === 'efectivo').reduce((s, r) => s + num(r.importe), 0)
    const tarjeta = repartos.filter((r) => r.forma_pago === 'tarjeta').reduce((s, r) => s + num(r.importe), 0)
    const deuda = repartos.filter((r) => r.forma_pago === 'deuda').reduce((s, r) => s + num(r.importe), 0)
    return {
      efectivo,
      tarjeta,
      deuda,
      total: efectivo + tarjeta + deuda,
    }
  }, [repartos])

  const totalGastos = useMemo(
    () => gastos.reduce((s, g) => s + (g.importe === '' ? 0 : Number(g.importe)), 0),
    [gastos],
  )

  const enviado = !!initial?.jornada.enviado_at

  const submit = async () => {
    try {
      await enviar.mutateAsync({
        fecha,
        hora_inicio: null,
        hora_fin: null,
        notas: notas.trim() || null,
        efectivo_billetes: null,
        efectivo_monedas: null,
        lineas: repartos
          .filter((r) => r.contact_nombre.trim() !== '' || Number(r.importe || 0) > 0)
          .map((r, i) => ({
            contact_id: r.contact_id,
            contact_nombre: r.contact_nombre.trim(),
            importe: r.importe === '' ? 0 : Number(r.importe),
            forma_pago: r.forma_pago,
            orden: i,
          })),
        gastos: gastos
          .filter((g) => Number(g.importe || 0) > 0)
          .map((g, i) => ({
            tipo: g.tipo,
            concepto: g.concepto.trim(),
            importe: g.importe === '' ? 0 : Number(g.importe),
            orden: i,
          })),
      })
      toast({ title: '✅ Cierre enviado', description: 'Pendiente de revisión por administración.', variant: 'success' })
    } catch (err) {
      toast({ title: 'No se pudo enviar el cierre', description: err instanceof Error ? err.message : '', variant: 'error' })
    }
  }

  return (
    <div className="space-y-4 pb-28">
      <Section icon={<ClipboardCheck className="h-4 w-4" />} title="Fecha del cierre" subtitle="Por defecto, hoy">
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-44" />
      </Section>

      <Section icon={<Truck className="h-4 w-4" />} title="Repartos del día" subtitle="Cada entrega realizada">
        {repartos.length === 0 ? (
          <Empty text="Añade tu primer reparto." />
        ) : (
          <ul className="space-y-2">
            {repartos.map((r) => (
              <li key={r._key} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
                <div className="flex items-center gap-2">
                  <Input
                    value={r.contact_nombre}
                    onChange={(e) => setRepartos((p) => p.map((x) => (x._key === r._key ? { ...x, contact_nombre: e.target.value, contact_id: null } : x)))}
                    placeholder="Nombre del cliente"
                    className="flex-1"
                  />
                  <Button type="button" variant="ghost" size="icon" aria-label="Quitar reparto" onClick={() => setRepartos((p) => p.filter((x) => x._key !== r._key))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
                    {(['efectivo', 'tarjeta', 'deuda'] as FormaPago[]).map((fp) => (
                      <button
                        key={fp}
                        type="button"
                        onClick={() => setRepartos((p) => p.map((x) => (x._key === r._key ? { ...x, forma_pago: fp } : x)))}
                        className={`px-2.5 py-1.5 text-xs font-medium capitalize transition ${
                          r.forma_pago === fp
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'bg-[var(--color-surface)] text-[var(--color-ink-2)]'
                        }`}
                      >
                        {fp === 'efectivo' ? '💵' : fp === 'tarjeta' ? '💳' : '📋'} {fp}
                      </button>
                    ))}
                  </div>
                  <ImporteInput
                    value={r.importe}
                    onChange={(v) => setRepartos((p) => p.map((x) => (x._key === r._key ? { ...x, importe: v } : x)))}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" variant="ghost" onClick={addReparto} className="mt-2 w-full border border-dashed border-[var(--color-border)]">
          <Plus className="mr-1 h-4 w-4" /> Añadir cliente
        </Button>
      </Section>

      <Section icon={<Receipt className="h-4 w-4" />} title="Gastos del día" subtitle="Gasolina, compras, incidencias… (se pagan de la caja)">
        {gastos.length === 0 ? (
          <Empty text="Sin gastos. Añade uno si has pagado algo de la ruta." />
        ) : (
          <ul className="space-y-2">
            {gastos.map((g) => (
              <li key={g._key} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
                    {GASTO_TIPOS.map((t) => (
                      <button
                        key={t.tipo}
                        type="button"
                        onClick={() => setGastos((p) => p.map((x) => (x._key === g._key ? { ...x, tipo: t.tipo } : x)))}
                        className={`flex-1 px-2 py-1.5 text-xs font-medium transition ${
                          g.tipo === t.tipo
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'bg-[var(--color-surface)] text-[var(--color-ink-2)]'
                        }`}
                      >
                        {t.emoji} {t.label}
                      </button>
                    ))}
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label="Quitar gasto" onClick={() => setGastos((p) => p.filter((x) => x._key !== g._key))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    value={g.concepto}
                    onChange={(e) => setGastos((p) => p.map((x) => (x._key === g._key ? { ...x, concepto: e.target.value } : x)))}
                    placeholder="Concepto (opcional)"
                    className="flex-1"
                  />
                  <ImporteInput
                    value={g.importe}
                    onChange={(v) => setGastos((p) => p.map((x) => (x._key === g._key ? { ...x, importe: v } : x)))}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" variant="ghost" onClick={addGasto} className="mt-2 w-full border border-dashed border-[var(--color-border)]">
          <Plus className="mr-1 h-4 w-4" /> Añadir gasto
        </Button>
      </Section>

      <Section icon={<Wallet className="h-4 w-4" />} title="Resumen" subtitle="Calculado automáticamente">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Resumen label="Efectivo" value={euros(totales.efectivo)} tone="success" />
          <Resumen label="Tarjeta" value={euros(totales.tarjeta)} />
          <Resumen label="Total" value={euros(totales.total)} />
        </div>
        {totales.deuda > 0 && (
          <p className="mt-2 text-center text-xs text-[var(--color-ink-3)]">Pendiente (deuda): <span className="tabular-nums">{euros(totales.deuda)}</span></p>
        )}
        {totalGastos > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-center">
            <Resumen label="Gastos" value={euros(totalGastos)} tone="danger" />
            <Resumen label="Efectivo neto" value={euros(totales.efectivo - totalGastos)} />
          </div>
        )}
        <div className="mt-3">
          <Field label="Notas (opcional)">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Observaciones del día…"
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-primary)]"
            />
          </Field>
        </div>
      </Section>

      {/* Barra de envío fija */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-bg)]/95 p-3 backdrop-blur md:static md:rounded-[var(--radius-lg)] md:border md:bg-transparent">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <span className="text-xs text-[var(--color-ink-3)]">
            {enviado ? '✓ Ya enviado — puedes corregir y reenviar' : 'Aún no enviado'}
          </span>
          <Button type="button" onClick={submit} disabled={enviar.isPending}>
            {enviar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
            {enviado ? 'Reenviar cierre' : 'Enviar cierre'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ── Sub-componentes ─────────────────────────────────────────────── */

function Section({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="ao-card p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]">{icon}</div>
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
          {subtitle && <p className="text-[11px] text-[var(--color-ink-3)]">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{label}</span>
      {children}
    </label>
  )
}

function ImporteInput({ value, onChange, full }: { value: number | ''; onChange: (v: number | '') => void; full?: boolean }) {
  return (
    <div className={`relative ${full ? 'w-full' : 'w-28'}`}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-ink-3)]">€</span>
      <Input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder="0,00"
        className="pl-6 text-right tabular-nums"
      />
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-3 text-center text-xs text-[var(--color-ink-3)]">{text}</p>
  )
}

function Resumen({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' }) {
  const toneCls =
    tone === 'success' ? 'text-[var(--mint)]' : tone === 'danger' ? 'text-[var(--coral)]' : 'text-[var(--color-ink)]'
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{label}</p>
      <p className={`mono mt-0.5 text-sm font-bold tabular-nums ${toneCls}`}>{value}</p>
    </div>
  )
}
