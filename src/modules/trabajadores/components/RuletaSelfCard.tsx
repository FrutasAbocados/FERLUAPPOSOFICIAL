import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { supabase } from '@/shared/lib/supabase'
import { RuletaModal } from './RuletaModal'

export function RuletaSelfCard() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: saldo, isLoading } = useQuery({
    queryKey: ['ruleta', 'saldo-self'] as const,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('ruleta_saldo_self')
      if (error) throw error
      return Number(data ?? 0)
    },
  })

  // Si está abierto el modal, lo mantenemos montado aunque el saldo del server
  // ya esté en 0 — la invalidación se hace al cerrar para no desmontar la
  // ruleta mientras la rueda gira o muestra el resultado.
  if (!open && (isLoading || !saldo || saldo <= 0)) return null

  const handleClose = () => {
    setOpen(false)
    qc.invalidateQueries({ queryKey: ['ruleta'] })
  }

  return (
    <>
      {saldo && saldo > 0 && (
        <section className="mb-3 overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-amber-100/70 to-rose-100/50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 animate-pulse items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-rose-400 text-white shadow-md">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">¡Ruleta de la suerte!</div>
                <div className="font-display text-base font-bold text-[var(--color-ink)]">
                  Tienes <span className="text-amber-700">{saldo}</span> tirada{saldo === 1 ? '' : 's'}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setOpen(true)}
              className="bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-md hover:from-amber-600 hover:to-rose-600"
            >
              ¡TIRAR!
            </Button>
          </div>
        </section>
      )}

      {open && <RuletaModal onClose={handleClose} />}
    </>
  )
}
