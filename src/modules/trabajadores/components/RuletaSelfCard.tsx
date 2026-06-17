import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'
import { RuletaModal } from './RuletaModal'

type RuletaSelfEstado = {
  empleado_id: string
  nombre: string
  activa: boolean
  es_sabado: boolean
  saldo_pendiente: number
  puntos_disponibles: number
  puede_canjear_1: boolean
  puede_canjear_5: boolean
  puede_canjear_10: boolean
}

export function RuletaSelfCard() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: estado, isLoading } = useQuery({
    queryKey: ['ruleta', 'self-estado'] as const,
    queryFn: async (): Promise<RuletaSelfEstado | null> => {
      const { data, error } = await supabase.rpc('ruleta_self_estado')
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      if (!row) return null
      return {
        empleado_id: String(row.empleado_id),
        nombre: String(row.nombre),
        activa: Boolean(row.activa),
        es_sabado: Boolean(row.es_sabado),
        saldo_pendiente: Number(row.saldo_pendiente ?? 0),
        puntos_disponibles: Number(row.puntos_disponibles ?? 0),
        puede_canjear_1: Boolean(row.puede_canjear_1),
        puede_canjear_5: Boolean(row.puede_canjear_5),
        puede_canjear_10: Boolean(row.puede_canjear_10),
      }
    },
  })

  const canjear = useMutation({
    mutationFn: async (tiradas: 1 | 5 | 10) => {
      const { data, error } = await supabase.rpc('ruleta_canjear_self', { p_tiradas: tiradas })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return {
        tiradas: Number(row?.tiradas_creadas ?? tiradas),
        puntos: Number(row?.puntos_gastados ?? (tiradas === 10 ? 100 : tiradas === 5 ? 55 : 12)),
        saldo: Number(row?.saldo_pendiente ?? 0),
      }
    },
    onSuccess: (res) => {
      toast({
        title: 'Canje hecho',
        description: `${res.puntos} puntos -> ${res.tiradas} tirada${res.tiradas === 1 ? '' : 's'}. Saldo: ${res.saldo}.`,
        variant: 'success',
      })
      qc.invalidateQueries({ queryKey: ['ruleta'] })
      qc.invalidateQueries({ queryKey: ['dash-trab-puntos'] })
      qc.invalidateQueries({ queryKey: ['puntos-resumen'] })
    },
    onError: (e) => {
      toast({ title: 'No se pudo canjear', description: e instanceof Error ? e.message : '', variant: 'error' })
    },
  })

  // Si está abierto el modal, lo mantenemos montado aunque el saldo del server
  // ya esté en 0 — la invalidación se hace al cerrar para no desmontar la
  // ruleta mientras la rueda gira o muestra el resultado.
  if (!open && (isLoading || !estado || !estado.activa || !estado.es_sabado)) return null

  const handleClose = () => {
    setOpen(false)
    qc.invalidateQueries({ queryKey: ['ruleta'] })
    qc.invalidateQueries({ queryKey: ['dash-trab-puntos'] })
    qc.invalidateQueries({ queryKey: ['puntos-resumen'] })
  }

  return (
    <>
      {estado && estado.activa && estado.es_sabado && (
        <section className="ao-card mb-3 overflow-hidden border-[oklch(78%_.12_72_/_0.35)] bg-[oklch(92%_.08_82_/_0.85)] p-4 dark:bg-[oklch(28%_.08_72_/_0.42)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 animate-pulse items-center justify-center rounded-lg bg-[var(--color-primary)] text-black shadow-md">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">Sábado de ruleta</div>
                <div className="font-display text-base font-bold text-[var(--color-ink)]">
                  {estado.saldo_pendiente > 0 ? (
                    <>Tienes <span className="text-[var(--color-primary)]">{estado.saldo_pendiente}</span> tirada{estado.saldo_pendiente === 1 ? '' : 's'}</>
                  ) : (
                    <>Tienes <span className="text-[var(--color-primary)]">{estado.puntos_disponibles}</span> puntos para canjear</>
                  )}
                </div>
                <div className="text-xs text-[var(--color-ink-3)]">12 pts = 1 tirada · 55 pts = 5 tiradas</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => canjear.mutate(1)}
                disabled={!estado.puede_canjear_1 || canjear.isPending}
              >
                {canjear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '12 pts → 1'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => canjear.mutate(5)}
                disabled={!estado.puede_canjear_5 || canjear.isPending}
              >
                {canjear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : '55 pts → 5'}
              </Button>
              <Button
                size="sm"
                onClick={() => setOpen(true)}
                disabled={estado.saldo_pendiente <= 0}
                className="bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md hover:from-amber-600 hover:to-rose-600"
              >
                ¡TIRAR!
              </Button>
            </div>
          </div>
        </section>
      )}

      {open && <RuletaModal onClose={handleClose} />}
    </>
  )
}
