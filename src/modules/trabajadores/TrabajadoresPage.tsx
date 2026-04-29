import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, UserCog, Users, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'

interface Trabajador {
  id: string
  nombre: string
  user_id: string | null
  puesto: string | null
  fecha_alta: string | null
  sueldo_base: number | null
  plus_transporte: number | null
  plus_responsabilidad: number | null
  plus_otros: number | null
  plus_otros_concepto: string | null
  notas: string | null
  activo: boolean
  pack: 1 | 2
  limite_credito_mensual: number | null
  tarifa_sabado: number | null
}

const eur = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)

function useTrabajadores() {
  return useQuery({
    queryKey: ['trabajadores'] as const,
    queryFn: async (): Promise<Trabajador[]> => {
      const { data, error } = await supabase
        .from('empleados')
        .select('id, nombre, user_id, puesto, fecha_alta, sueldo_base, plus_transporte, plus_responsabilidad, plus_otros, plus_otros_concepto, notas, activo, pack, limite_credito_mensual, tarifa_sabado')
        .order('nombre')
      if (error) throw error
      return (data ?? []) as Trabajador[]
    },
  })
}

function useGuardarTrabajador() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: Trabajador) => {
      const { error } = await supabase
        .from('empleados')
        .update({
          nombre: t.nombre,
          puesto: t.puesto,
          fecha_alta: t.fecha_alta,
          sueldo_base: t.sueldo_base,
          plus_transporte: t.plus_transporte,
          plus_responsabilidad: t.plus_responsabilidad,
          plus_otros: t.plus_otros,
          plus_otros_concepto: t.plus_otros_concepto,
          notas: t.notas,
          activo: t.activo,
          pack: t.pack,
          limite_credito_mensual: t.limite_credito_mensual,
          tarifa_sabado: t.tarifa_sabado,
        })
        .eq('id', t.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trabajadores'] }),
  })
}

const totalMensual = (t: Trabajador) => {
  const base = Number(t.sueldo_base ?? 0)
  if (t.pack === 2) return base
  return base +
    Number(t.plus_transporte ?? 0) +
    Number(t.plus_responsabilidad ?? 0) +
    Number(t.plus_otros ?? 0)
}

export function TrabajadoresPage() {
  const { data, isLoading } = useTrabajadores()
  const [editing, setEditing] = useState<Trabajador | null>(null)

  const totalNomina = useMemo(() =>
    (data ?? []).filter(t => t.activo).reduce((s, t) => s + totalMensual(t), 0),
    [data])

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 border-b border-[var(--color-border)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Módulo</p>
        <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">Trabajadores</h1>
        <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
          Plantilla, condiciones y pluses individualizados.
        </p>
      </header>

      <section className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--color-ink-3)]" />
          <span className="text-sm text-[var(--color-ink-3)]">Coste mensual nómina (activos)</span>
          <span className="ml-auto font-display text-2xl font-bold text-[var(--color-ink)] tabular-nums">{eur(totalNomina)}</span>
        </div>
      </section>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {data?.length === 0 && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Sin trabajadores</p>}
        <ul className="divide-y divide-[var(--color-border)]">
          {data?.map(t => (
            <li key={t.id}>
              <button
                onClick={() => setEditing(t)}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-[var(--color-surface-2,#f8fafc)]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--color-ink)]">{t.nombre}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${t.pack === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      Pack {t.pack}
                    </span>
                    {!t.activo && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-600">baja</span>}
                  </div>
                  <div className="text-xs text-[var(--color-ink-3)]">{t.puesto ?? 'sin puesto'} {t.fecha_alta ? `· desde ${t.fecha_alta}` : ''}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium tabular-nums text-[var(--color-ink)]">{eur(totalMensual(t))}</div>
                  <div className="text-xs text-[var(--color-ink-3)]">total/mes</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {editing && (
        <EditorTrabajador trabajador={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function EditorTrabajador({ trabajador, onClose }: { trabajador: Trabajador; onClose: () => void }) {
  const guardar = useGuardarTrabajador()
  const [t, setT] = useState<Trabajador>(trabajador)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = <K extends keyof Trabajador>(k: K, v: Trabajador[K]) => setT(prev => ({ ...prev, [k]: v }))
  const setNum = (k: keyof Trabajador, v: string) =>
    setT(prev => ({ ...prev, [k]: v === '' ? null : Number(v.replace(',', '.')) }))

  const submit = async () => {
    try {
      await guardar.mutateAsync(t)
      onClose()
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : 'No se pudo guardar'}`)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 md:p-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-[var(--color-surface)] shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary-soft)]">
              <UserCog className="h-5 w-5 text-[var(--color-primary-2)]" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">{trabajador.nombre}</h2>
              <p className="text-xs text-[var(--color-ink-3)]">Editar condiciones</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nombre">
              <Input value={t.nombre} onChange={(e) => set('nombre', e.target.value)} className="h-9" />
            </Field>
            <Field label="Puesto">
              <Input value={t.puesto ?? ''} onChange={(e) => set('puesto', e.target.value || null)} className="h-9" placeholder="Mozo / Comercial / ..." />
            </Field>
            <Field label="Fecha alta">
              <Input type="date" value={t.fecha_alta ?? ''} onChange={(e) => set('fecha_alta', e.target.value || null)} className="h-9" />
            </Field>
            <Field label="Estado">
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={t.activo} onChange={(e) => set('activo', e.target.checked)} />
                {t.activo ? 'Activo' : 'Baja'}
              </label>
            </Field>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Pack contractual</h3>
            <div className="grid gap-2 md:grid-cols-2">
              <label className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${t.pack === 1 ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]' : 'border-[var(--color-border)]'}`}>
                <input
                  type="radio"
                  name="pack"
                  checked={t.pack === 1}
                  onChange={() => set('pack', 1)}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-semibold">Pack 1</div>
                  <div className="text-xs text-[var(--color-ink-3)]">60d vacaciones · pluses · crédito frutas · productividad · 5% nuevos</div>
                </div>
              </label>
              <label className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${t.pack === 2 ? 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]' : 'border-[var(--color-border)]'}`}>
                <input
                  type="radio"
                  name="pack"
                  checked={t.pack === 2}
                  onChange={() => set('pack', 2)}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-semibold">Pack 2</div>
                  <div className="text-xs text-[var(--color-ink-3)]">48d vacaciones · sueldo neto · 70€/sábado · 5% nuevos · sin pluses</div>
                </div>
              </label>
            </div>
            {t.pack === 1 && (
              <div className="mt-3">
                <Field label="Crédito frutas mensual (€)">
                  <Input
                    type="number"
                    step="1"
                    value={t.limite_credito_mensual ?? ''}
                    onChange={(e) => setNum('limite_credito_mensual', e.target.value)}
                    className="h-9 tabular-nums text-right"
                    placeholder="100"
                  />
                </Field>
              </div>
            )}
            {t.pack === 2 && (
              <div className="mt-3">
                <Field label="Tarifa por sábado trabajado (€)">
                  <Input
                    type="number"
                    step="1"
                    value={t.tarifa_sabado ?? ''}
                    onChange={(e) => setNum('tarifa_sabado', e.target.value)}
                    className="h-9 tabular-nums text-right"
                    placeholder="70"
                  />
                </Field>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Condiciones económicas (mensuales €)</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Sueldo base">
                <Input type="number" step="0.01" value={t.sueldo_base ?? ''} onChange={(e) => setNum('sueldo_base', e.target.value)} className="h-9 tabular-nums text-right" />
              </Field>
              <Field label="Plus transporte">
                <Input type="number" step="0.01" value={t.plus_transporte ?? ''} onChange={(e) => setNum('plus_transporte', e.target.value)} className="h-9 tabular-nums text-right" />
              </Field>
              <Field label="Plus responsabilidad">
                <Input type="number" step="0.01" value={t.plus_responsabilidad ?? ''} onChange={(e) => setNum('plus_responsabilidad', e.target.value)} className="h-9 tabular-nums text-right" />
              </Field>
              <Field label="Plus otros">
                <Input type="number" step="0.01" value={t.plus_otros ?? ''} onChange={(e) => setNum('plus_otros', e.target.value)} className="h-9 tabular-nums text-right" />
              </Field>
              <Field label="Concepto otros (opcional)" full>
                <Input value={t.plus_otros_concepto ?? ''} onChange={(e) => set('plus_otros_concepto', e.target.value || null)} className="h-9" placeholder="ej. nocturnidad" />
              </Field>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-3">
              <span className="text-sm text-[var(--color-ink-3)]">Total mensual</span>
              <span className="font-display text-xl font-bold tabular-nums text-emerald-700">{eur(totalMensual(t))}</span>
            </div>
          </div>

          <Field label="Notas">
            <textarea
              value={t.notas ?? ''}
              onChange={(e) => set('notas', e.target.value || null)}
              className="min-h-[80px] w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
              placeholder="Acuerdos especiales, observaciones…"
            />
          </Field>

          <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={submit} disabled={guardar.isPending}>
              <Save className="mr-1 h-4 w-4" /> {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="mb-0.5 block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">{label}</label>
      {children}
    </div>
  )
}
