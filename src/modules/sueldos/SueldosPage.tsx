import { useMemo, useState } from 'react'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, Trash2, Wallet } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'

type Socio = 'Luis' | 'Álvaro'
const SOCIOS: Socio[] = ['Luis', 'Álvaro']

interface Retiro {
  id: string
  socio: Socio
  fecha: string
  importe: number
  concepto: string | null
  created_at: string
}

const eur = euros
const fmt = (d: string) => format(parseISO(d), 'd LLL yyyy', { locale: es })

function useRetiros(from: string, to: string) {
  return useQuery({
    queryKey: ['sueldos', from, to] as const,
    queryFn: async (): Promise<Retiro[]> => {
      const { data, error } = await supabase
        .from('socios_retiros')
        .select('id, socio, fecha, importe, concepto, created_at')
        .gte('fecha', from).lte('fecha', to)
        .order('fecha', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r) => ({ ...(r as Retiro), importe: Number(r.importe) }))
    },
  })
}

function useAddRetiro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { socio: Socio; fecha: string; importe: number; concepto?: string | null }) => {
      const { error } = await supabase.from('socios_retiros').insert({
        socio: input.socio, fecha: input.fecha, importe: input.importe, concepto: input.concepto ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sueldos'] }),
  })
}

function useDeleteRetiro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('socios_retiros').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sueldos'] }),
  })
}

export function SueldosPage() {
  const [anchor, setAnchor] = useState<Date>(() => startOfMonth(new Date()))
  const from = format(startOfMonth(anchor), 'yyyy-MM-dd')
  const to = format(endOfMonth(anchor), 'yyyy-MM-dd')
  const { data, isLoading } = useRetiros(from, to)

  const today = format(new Date(), 'yyyy-MM-dd')
  const [socio, setSocio] = useState<Socio>('Luis')
  const [fecha, setFecha] = useState(today)
  const [importe, setImporte] = useState('')
  const [concepto, setConcepto] = useState('')
  const add = useAddRetiro()
  const del = useDeleteRetiro()

  const totales = useMemo(() => {
    const t: Record<Socio, number> = { Luis: 0, 'Álvaro': 0 }
    for (const r of data ?? []) t[r.socio] += r.importe
    return t
  }, [data])
  const totalMes = totales.Luis + totales['Álvaro']

  const guardar = async () => {
    const v = Number(importe.replace(',', '.'))
    if (!fecha || !Number.isFinite(v) || v <= 0) return
    try {
      await add.mutateAsync({ socio, fecha, importe: v, concepto: concepto.trim() || null })
      setImporte(''); setConcepto('')
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  return (
    <div>
      <PageTopbar
        breadcrumb="SOCIOS · SUELDOS"
        title="Sueldos socios"
        subtitle="Registro mensual de lo que Luis y Álvaro se cogen del negocio."
        actions={
          <div className="flex items-center gap-1" style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 4 }}>
            <Button size="sm" variant="ghost" onClick={() => setAnchor(a => startOfMonth(subMonths(a, 1)))}>‹</Button>
            <span className="mono text-sm font-medium capitalize" style={{ minWidth: 140, textAlign: 'center', color: 'var(--ink)' }}>
              {format(anchor, 'LLLL yyyy', { locale: es })}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setAnchor(a => startOfMonth(subMonths(a, -1)))}>›</Button>
          </div>
        }
      />
      <div className="ao-page max-w-4xl py-6 md:py-8">

      {/* KPIs por socio */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        {SOCIOS.map(s => (
          <div key={s} className="ao-card p-4">
            <div className="label-caps">{s}</div>
            <div className="mono mt-1 text-2xl font-semibold text-[var(--mint)] tabular-nums">{eur(totales[s])}</div>
          </div>
        ))}
        <div className="ao-card col-span-2 border-2 border-[var(--mint)] bg-[var(--mint-glow)] p-4 md:col-span-1">
          <div className="label-caps text-[var(--mint)]">Total mes</div>
          <div className="mono mt-1 text-2xl font-semibold text-[var(--mint)] tabular-nums">{eur(totalMes)}</div>
          {totales.Luis > 0 && totales['Álvaro'] > 0 && (
            <div className="mt-1 text-xs text-[var(--color-ink-3)]">
              Luis {(totales.Luis / totalMes * 100).toFixed(0)}% · Álvaro {(totales['Álvaro'] / totalMes * 100).toFixed(0)}%
            </div>
          )}
        </div>
      </div>

      {/* Form añadir */}
      <section className="ao-card mb-4 p-4">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-ink)]">Añadir retiro</h2>
        <div className="grid gap-2 md:grid-cols-[120px_140px_140px_1fr_auto]">
          <div>
            <label className="label-caps block">Socio</label>
            <select value={socio} onChange={(e) => setSocio(e.target.value as Socio)} className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-ink)]">
              {SOCIOS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label-caps block">Fecha</label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9" />
          </div>
          <div>
            <label className="label-caps block">Importe €</label>
            <Input type="number" step="0.01" placeholder="0.00" value={importe} onChange={(e) => setImporte(e.target.value)} className="h-9 tabular-nums text-right" />
          </div>
          <div>
            <label className="label-caps block">Concepto (opc)</label>
            <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="ej. nómina abril" className="h-9" />
          </div>
          <div className="flex items-end">
            <Button onClick={guardar} disabled={!importe || add.isPending}>
              <Plus className="mr-1 h-4 w-4" /> {add.isPending ? 'Guardando…' : 'Añadir'}
            </Button>
          </div>
        </div>
      </section>

      {/* Lista del mes */}
      <section className="ao-card overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2">
          <Wallet className="h-4 w-4 text-[var(--color-ink-3)]" />
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">Retiros del mes</h3>
          <span className="ml-auto text-xs text-[var(--color-ink-3)]">{data?.length ?? 0} apuntes</span>
        </div>
        {isLoading && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {data?.length === 0 && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Sin retiros este mes</p>}
        <ul className="divide-y divide-[var(--color-border)]">
          {data?.map(r => (
            <li key={r.id} className="grid grid-cols-[80px_80px_1fr_auto_auto] items-center gap-3 px-4 py-2 text-sm">
              <span className={`ao-chip ${r.socio === 'Luis' ? 'ao-chip-sky' : 'ao-chip-mint'}`}>
                {r.socio}
              </span>
              <span className="text-xs text-[var(--color-ink-3)]">{fmt(r.fecha)}</span>
              <span className="truncate text-[var(--color-ink)]">{r.concepto ?? '—'}</span>
              <span className="mono font-medium tabular-nums text-[var(--color-ink)]">{eur(r.importe)}</span>
              <Button size="sm" variant="ghost" onClick={() => del.mutate(r.id)} disabled={del.isPending} title="Eliminar">
                <Trash2 className="h-4 w-4 text-[var(--coral)]" />
              </Button>
            </li>
          ))}
        </ul>
      </section>
      </div>
    </div>
  )
}
