import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle2, Gift, Loader2, PackageCheck, Sparkles } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'

type Tipo = 'puntos' | 'euros' | 'fisico' | 'comodin' | 'bonus'

type PremioSelf = {
  tirada_id: string
  motivo: string | null
  tirada_at: string | null
  solicitado_at: string | null
  canje_notas: string | null
  entregado: boolean
  entregado_at: string | null
  premio_nombre: string
  premio_descripcion: string | null
  premio_tipo: Tipo
  premio_valor: number
  premio_icono: string | null
  invita_nombre: string | null
}

type PremioSelfRow = {
  tirada_id: string
  motivo: string | null
  tirada_at: string | null
  solicitado_at: string | null
  canje_notas: string | null
  entregado: boolean
  entregado_at: string | null
  premio_nombre: string
  premio_descripcion: string | null
  premio_tipo: string
  premio_valor: number | string | null
  premio_icono: string | null
  invita_nombre: string | null
}

const TIPO_LABEL: Record<Tipo, string> = {
  puntos: 'Puntos',
  euros: 'Extra',
  fisico: 'Físico',
  comodin: 'Comodín',
  bonus: 'Tirada extra',
}

function valorPremio(p: PremioSelf) {
  if (p.premio_tipo === 'puntos') return `+${p.premio_valor} pts`
  if (p.premio_tipo === 'euros') return euros(p.premio_valor)
  if (p.premio_tipo === 'bonus') return 'Otra tirada'
  return null
}

function estadoPremio(p: PremioSelf) {
  if (p.entregado) return { label: 'Entregado', className: 'bg-[var(--mint-glow)] text-[var(--mint)]', Icon: CheckCircle2 }
  if (p.solicitado_at) return { label: 'Pedido', className: 'bg-[oklch(92%_.08_82_/_0.85)] text-[var(--color-primary)] dark:bg-[oklch(28%_.08_72_/_0.42)]', Icon: PackageCheck }
  return { label: 'Disponible', className: 'bg-[rgba(255,255,255,.07)] text-[var(--color-ink-2)]', Icon: Gift }
}

export function RuletaPremiosSelfCard({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient()

  const { data = [], isLoading } = useQuery({
    queryKey: ['ruleta', 'premios-self'] as const,
    queryFn: async (): Promise<PremioSelf[]> => {
      const { data, error } = await supabase.rpc('ruleta_premios_self')
      if (error) throw error
      return ((data ?? []) as PremioSelfRow[]).map((r) => ({
        tirada_id: String(r.tirada_id),
        motivo: r.motivo ? String(r.motivo) : null,
        tirada_at: r.tirada_at ? String(r.tirada_at) : null,
        solicitado_at: r.solicitado_at ? String(r.solicitado_at) : null,
        canje_notas: r.canje_notas ? String(r.canje_notas) : null,
        entregado: Boolean(r.entregado),
        entregado_at: r.entregado_at ? String(r.entregado_at) : null,
        premio_nombre: String(r.premio_nombre),
        premio_descripcion: r.premio_descripcion ? String(r.premio_descripcion) : null,
        premio_tipo: r.premio_tipo as Tipo,
        premio_valor: Number(r.premio_valor ?? 0),
        premio_icono: r.premio_icono ? String(r.premio_icono) : null,
        invita_nombre: r.invita_nombre ? String(r.invita_nombre) : null,
      }))
    },
  })

  const solicitar = useMutation({
    mutationFn: async (tiradaId: string) => {
      const { error } = await supabase.rpc('ruleta_solicitar_canje_self', {
        p_tirada: tiradaId,
        p_nota: null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast({
        title: 'Canje pedido',
        description: 'Administración lo verá como pendiente de entregar.',
        variant: 'success',
      })
      qc.invalidateQueries({ queryKey: ['ruleta'] })
    },
    onError: (e) => toast({ title: 'No se pudo pedir el canje', description: e instanceof Error ? e.message : '', variant: 'error' }),
  })

  const visibles = compact ? data.filter((p) => !p.entregado).slice(0, 3) : data
  const pendientes = data.filter((p) => !p.entregado).length

  if (isLoading) {
    return (
      <section className="ao-card p-4 text-sm text-[var(--color-ink-3)]">
        Cargando premios...
      </section>
    )
  }

  if (visibles.length === 0 && compact) return null

  return (
    <section className="ao-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="ao-icon-tile h-8 w-8">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">Mis premios</h2>
            <p className="text-xs text-[var(--color-ink-3)]">
              {pendientes > 0 ? `${pendientes} pendiente${pendientes === 1 ? '' : 's'} de canjear` : 'Histórico de ruleta'}
            </p>
          </div>
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-sm text-[var(--color-ink-3)]">
          Aún no tienes premios ganados.
        </p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((p) => {
            const estado = estadoPremio(p)
            const valor = valorPremio(p)
            return (
              <li key={p.tirada_id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-xl">
                    {p.premio_icono ?? '🎁'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-[var(--color-ink)]">{p.premio_nombre}</span>
                      <span className="rounded-full bg-[rgba(255,255,255,.07)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-ink-2)]">
                        {TIPO_LABEL[p.premio_tipo]}{valor ? ` · ${valor}` : ''}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${estado.className}`}>
                        <estado.Icon className="h-3 w-3" /> {estado.label}
                      </span>
                    </div>
                    {p.invita_nombre && (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/25">
                        {p.premio_icono ?? '🥐'} Te invita {p.invita_nombre}
                      </span>
                    )}
                    {(p.premio_descripcion || p.motivo || p.tirada_at) && (
                      <p className="mt-1 text-xs text-[var(--color-ink-3)]">
                        {p.premio_descripcion ?? p.motivo ?? 'Premio de ruleta'}
                        {p.tirada_at && <> · ganado {format(new Date(p.tirada_at), 'd LLL', { locale: es })}</>}
                      </p>
                    )}
                  </div>
                  {!p.entregado && (
                    <Button
                      size="sm"
                      variant={p.solicitado_at ? 'outline' : 'primary'}
                      disabled={solicitar.isPending || !!p.solicitado_at}
                      onClick={() => solicitar.mutate(p.tirada_id)}
                      className="shrink-0"
                    >
                      {solicitar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : p.solicitado_at ? 'Pedido' : 'Canjear'}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
