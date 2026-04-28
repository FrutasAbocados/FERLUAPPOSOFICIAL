import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useCreateCuenta } from '../lib/queries'
import { CUENTA_TIPO_LABEL, type CuentaTipo } from '../lib/types'

type Props = { onClose: () => void }

export function CuentaForm({ onClose }: Props) {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<CuentaTipo>('corriente')
  const [saldoInicial, setSaldoInicial] = useState(0)
  const [limiteCredito, setLimiteCredito] = useState<number | null>(null)
  const [notas, setNotas] = useState('')
  const create = useCreateCuenta()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = nombre.trim()
    if (!n) return
    await create.mutateAsync({
      nombre: n,
      tipo,
      saldo_inicial: saldoInicial,
      limite_credito: tipo === 'credito' ? limiteCredito : null,
      notas: notas.trim() || null,
    })
    onClose()
  }

  return (
    <ModalShell title="Nueva cuenta" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nombre">
          <Input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. La Caixa cuenta principal"
            required
          />
        </Field>

        <Field label="Tipo">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(CUENTA_TIPO_LABEL) as CuentaTipo[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={
                  'rounded-[var(--radius-md)] border px-3 py-2 text-xs font-semibold transition-colors ' +
                  (tipo === t
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]')
                }
              >
                {CUENTA_TIPO_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Saldo inicial (€)">
          <Input
            type="number"
            inputMode="decimal"
            step={0.01}
            value={saldoInicial}
            onChange={(e) => setSaldoInicial(parseFloat(e.target.value) || 0)}
            onFocus={(e) => e.target.select()}
            className="text-right tabular-nums"
          />
        </Field>

        {tipo === 'credito' && (
          <Field label="Límite de crédito (€)">
            <Input
              type="number"
              inputMode="decimal"
              step={0.01}
              value={limiteCredito ?? 0}
              onChange={(e) => setLimiteCredito(parseFloat(e.target.value) || 0)}
              onFocus={(e) => e.target.select()}
              className="text-right tabular-nums"
            />
          </Field>
        )}

        <Field label="Notas (opcional)">
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none transition-colors focus-visible:border-[var(--color-primary)]"
            placeholder="IBAN, banco, etc."
          />
        </Field>

        {create.error && (
          <p className="text-xs text-[var(--color-danger)]">
            {(create.error as Error).message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={create.isPending || !nombre.trim()}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear cuenta
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

export function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[var(--radius-xl)] bg-[var(--color-bg)] shadow-2xl md:rounded-[var(--radius-xl)]">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3">
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">
            {title}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
        {label}
      </span>
      {children}
    </label>
  )
}
