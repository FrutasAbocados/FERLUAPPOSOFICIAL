import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, MapPin } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'

type AvisoPendiente = { codigo: string; version: number; titulo: string; texto: string }

const KEY = ['trabajadores', 'aviso-pendiente'] as const

/**
 * Aviso legal obligatorio para el trabajador conectado (fichaje con ubicación).
 * Bloquea la app hasta que lo acepta; el acuse queda guardado en servidor.
 * Para administración y usuarios sin ficha de trabajador no pinta nada.
 */
export function AvisoLegalGate() {
  const qc = useQueryClient()
  const [leido, setLeido] = useState(false)
  const q = useQuery({
    queryKey: KEY,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<AvisoPendiente | null> => {
      const { data, error } = await supabase.rpc('trabajadores_aviso_pendiente')
      if (error) throw error
      const row = (data as AvisoPendiente[] | null)?.[0]
      return row ?? null
    },
  })
  const aceptar = useMutation({
    mutationFn: async (a: AvisoPendiente) => {
      const { error } = await supabase.rpc('trabajadores_aviso_aceptar', {
        p_codigo: a.codigo,
        p_version: a.version,
        p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setLeido(false)
      void qc.invalidateQueries({ queryKey: KEY })
      toast({ title: 'Gracias', description: 'Aceptación guardada.', variant: 'success' })
    },
    onError: (e) => toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'error' }),
  })

  const a = q.data
  if (!a) return null
  const lineas = a.texto.split('\n').filter((l) => l.trim() !== '')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="aviso-legal-titulo"
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-2 md:p-6"
    >
      <div className="my-auto w-full max-w-lg rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <MapPin className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
          <h2 id="aviso-legal-titulo" className="text-base font-bold text-[var(--color-ink)]">{a.titulo}</h2>
        </div>
        <div className="space-y-1.5 text-sm leading-snug text-[var(--color-ink-2)]">
          {lineas.map((l, i) =>
            l.startsWith('•') ? (
              <p key={i} className="pl-3 -indent-3">{l}</p>
            ) : (
              <p key={i} className={i === 0 ? 'font-medium text-[var(--color-ink)]' : ''}>{l}</p>
            ),
          )}
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm font-medium text-[var(--color-ink)]">
          <input
            type="checkbox"
            checked={leido}
            onChange={(e) => setLeido(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
          />
          He leído y entendido la información sobre el registro de jornada y la ubicación al fichar.
        </label>
        <Button
          type="button"
          className="mt-3 w-full"
          disabled={!leido || aceptar.isPending}
          onClick={() => aceptar.mutate(a)}
        >
          {aceptar.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Acepto
        </Button>
        <p className="mt-2 text-center text-[11px] text-[var(--color-ink-3)]">
          Si tienes dudas, pregunta a Luis o a Álvaro antes de aceptar.
        </p>
      </div>
    </div>
  )
}
