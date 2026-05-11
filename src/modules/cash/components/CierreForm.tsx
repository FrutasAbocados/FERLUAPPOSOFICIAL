import { useState } from 'react'
import { Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { fetchAutorrellenarDia, useUpsertCierre } from '../lib/queries'
import { emptyInput, fromCierre, type Cierre, type CierreInput } from '../lib/types'
import { euros, fmtDate } from '../lib/format'

type Props = {
  fecha: string
  cierre: Cierre | null
  onClose: () => void
  readOnly?: boolean
}

export function CierreForm({ fecha, cierre, onClose, readOnly }: Props) {
  // Re-mount when the target cierre/fecha changes; evita setState-in-effect.
  return (
    <CierreFormContent
      key={cierre?.id ?? fecha}
      fecha={fecha}
      cierre={cierre}
      onClose={onClose}
      readOnly={readOnly}
    />
  )
}

function CierreFormContent({ fecha, cierre, onClose, readOnly }: Props) {
  const [form, setForm] = useState<CierreInput>(() =>
    cierre ? fromCierre(cierre) : emptyInput(fecha),
  )
  const [autorellenando, setAutorellenando] = useState(false)
  const [autoError, setAutoError] = useState<string | null>(null)
  const upsert = useUpsertCierre()

  const handleAutorellenar = async () => {
    setAutorellenando(true)
    setAutoError(null)
    try {
      const d = await fetchAutorrellenarDia(fecha)
      setForm(f => ({
        ...f,
        efectivo:       d.efectivo,
        tarjeta:        d.tarjeta,
        compras:        d.compras,
        pedidos:        d.pedidos,
        deuda_generada: d.deuda_generada,
      }))
    } catch (err) {
      setAutoError((err as Error).message ?? 'Error al autorellenar')
    } finally {
      setAutorellenando(false)
    }
  }

  const set = <K extends keyof CierreInput>(k: K, v: CierreInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const totalCobrado =
    Number(form.efectivo) +
    Number(form.tarjeta) +
    Number(form.otros_efectivo) +
    Number(form.otros_tarjeta)
  const totalGastos =
    Number(form.compras) +
    Number(form.vehiculos) +
    Number(form.otras_compras) +
    Number(form.otros)
  const resultado = totalCobrado - totalGastos
  const deudaNeta = Number(form.deuda_generada) - Number(form.deuda_cobrada)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    await upsert.mutateAsync(form)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center">
      <div className="flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[var(--radius-xl)] bg-[var(--color-bg)] shadow-2xl md:h-auto md:max-h-[90vh] md:rounded-[var(--radius-xl)]">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
              Cierre del día
            </p>
            <h2 className="font-display text-lg font-bold capitalize text-[var(--color-ink)] md:text-xl">
              {fmtDate(fecha, "EEEE d 'de' MMMM yyyy")}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {!readOnly && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutorellenar}
                disabled={autorellenando}
                className="gap-1.5 text-xs"
                title="Rellena efectivo, tarjeta, compras, pedidos y deuda desde Cierre día + Holded"
              >
                {autorellenando
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
                Autorellenar
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            <Section title="Cobrado">
              <Field label="Efectivo (€)" value={form.efectivo} onChange={(v) => set('efectivo', v)} />
              <Field label="Tarjeta (€)" value={form.tarjeta} onChange={(v) => set('tarjeta', v)} />
              <Field label="Otros efectivo (€)" value={form.otros_efectivo} onChange={(v) => set('otros_efectivo', v)} />
              <Field label="Otros tarjeta (€)" value={form.otros_tarjeta} onChange={(v) => set('otros_tarjeta', v)} />
            </Section>

            <Section title="Gastos">
              <Field label="Compras (€)" value={form.compras} onChange={(v) => set('compras', v)} />
              <Field label="Vehículos (€)" value={form.vehiculos} onChange={(v) => set('vehiculos', v)} />
              <Field label="Otras compras (€)" value={form.otras_compras} onChange={(v) => set('otras_compras', v)} />
              <Field label="Otros (€)" value={form.otros} onChange={(v) => set('otros', v)} />
            </Section>

            <Section title="Deuda">
              <Field label="Deuda generada (€)" value={form.deuda_generada} onChange={(v) => set('deuda_generada', v)} />
              <Field label="Deuda cobrada (€)" value={form.deuda_cobrada} onChange={(v) => set('deuda_cobrada', v)} />
            </Section>

            <Section title="Operativa">
              <Field label="Pedidos" value={form.pedidos} onChange={(v) => set('pedidos', v)} integer />
              <Field label="Clientes nuevos" value={form.clientes_nuevos} onChange={(v) => set('clientes_nuevos', v)} integer />
              <Field
                label="Caja física al cierre (€)"
                value={form.caja_fisica ?? 0}
                onChange={(v) => set('caja_fisica', v)}
              />
            </Section>

            <Section title="Notas">
              <div className="col-span-full">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                  Observaciones
                </label>
                <textarea
                  value={form.observaciones ?? ''}
                  onChange={(e) => set('observaciones', e.target.value || null)}
                  rows={3}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none transition-colors focus-visible:border-[var(--color-primary)]"
                  placeholder="Anota lo que toque (incidencias, devoluciones, etc.)"
                />
              </div>
            </Section>
          </div>

          <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <Total label="Cobrado" value={euros(totalCobrado)} />
              <Total label="Gastos" value={euros(totalGastos)} />
              <Total
                label="Resultado"
                value={euros(resultado)}
                tone={resultado >= 0 ? 'success' : 'danger'}
              />
              <Total
                label="Deuda neta"
                value={euros(deudaNeta)}
                tone={deudaNeta > 0 ? 'warn' : 'neutral'}
              />
            </div>
            {autoError && (
              <p className="mb-2 text-xs text-[var(--color-danger)]">
                Autorellenar: {autoError}
              </p>
            )}
            {upsert.error && (
              <p className="mb-2 text-xs text-[var(--color-danger)]">
                {(upsert.error as Error).message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {readOnly ? 'Cerrar' : 'Cancelar'}
              </Button>
              {!readOnly && (
                <Button type="submit" disabled={upsert.isPending}>
                  {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar cierre
                </Button>
              )}
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
    </section>
  )
}

type FieldProps = {
  label: string
  value: number
  onChange: (v: number) => void
  integer?: boolean
}

function Field({ label, value, onChange, integer }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-2)]">
        {label}
      </span>
      <Input
        type="number"
        inputMode={integer ? 'numeric' : 'decimal'}
        step={integer ? 1 : 0.01}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') {
            onChange(0)
            return
          }
          const n = integer ? parseInt(raw, 10) : parseFloat(raw)
          onChange(Number.isFinite(n) ? n : 0)
        }}
        onFocus={(e) => e.target.select()}
        className="text-right tabular-nums"
      />
    </label>
  )
}

type TotalProps = { label: string; value: string; tone?: 'success' | 'danger' | 'warn' | 'neutral' }
const TOTAL_TONE: Record<NonNullable<TotalProps['tone']>, string> = {
  success: 'text-[var(--color-success)]',
  danger: 'text-[var(--color-danger)]',
  warn: 'text-[var(--color-warn)]',
  neutral: 'text-[var(--color-ink-2)]',
}
function Total({ label, value, tone }: TotalProps) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">
        {label}
      </div>
      <div
        className={`font-display text-base font-bold tabular-nums ${
          tone ? TOTAL_TONE[tone] : 'text-[var(--color-ink)]'
        }`}
      >
        {value}
      </div>
    </div>
  )
}
