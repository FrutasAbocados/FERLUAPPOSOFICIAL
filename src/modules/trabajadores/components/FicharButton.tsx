import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Fingerprint, LogIn, LogOut, Loader2 } from 'lucide-react'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'

interface FichajeAbierto {
  id: string
  ts_in: string
}

// Pide la ubicación sin bloquear el fichaje: si el empleado deniega el permiso
// o tarda, seguimos adelante con lat/lng nulos.
async function pedirGeo(): Promise<{ lat: number; lng: number } | null> {
  if (!('geolocation' in navigator)) return null
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60_000 },
    )
  })
}

function useFichajeActual(empleadoId: string) {
  return useQuery({
    queryKey: ['fichar-hoy', empleadoId] as const,
    refetchInterval: 30_000,
    queryFn: async (): Promise<FichajeAbierto | null> => {
      const { data, error } = await supabase.rpc('trabajadores_fichaje_actual')
      if (error) throw error
      const row = (data ?? [])[0] as Record<string, unknown> | undefined
      if (!row) return null
      return { id: String(row.id ?? ''), ts_in: String(row.ts_in ?? '') }
    },
  })
}

function elapsed(tsIn: string): string {
  const diff = Math.max(0, Date.now() - new Date(tsIn).getTime())
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h === 0) return `${m}min`
  return `${h}h ${String(m).padStart(2, '0')}min`
}

export function FicharButton({ empleadoId }: { empleadoId: string }) {
  const qc = useQueryClient()
  const { data: abierto, isLoading } = useFichajeActual(empleadoId)

  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!abierto) return
    const t = setInterval(() => setTick(n => n + 1), 30_000)
    return () => clearInterval(t)
  }, [abierto])

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['fichar-hoy', empleadoId] })
    void qc.invalidateQueries({ queryKey: ['trabajadores', 'fichaje-actual'] })
    void qc.invalidateQueries({ queryKey: ['fichajes'] })
  }

  const entrada = useMutation({
    mutationFn: async () => {
      const geo = await pedirGeo()
      const { error } = await supabase.rpc('trabajadores_fichaje_abrir', {
        p_lat: geo?.lat ?? null,
        p_lng: geo?.lng ?? null,
      })
      if (error) throw error
      return geo
    },
    onSuccess: (geo) => {
      toast({
        title: 'Fichaje de entrada registrado',
        description: geo ? 'Con ubicación' : 'Sin ubicación',
        variant: 'success',
      })
      invalidate()
    },
    onError: (e) => toast({ title: 'Error al fichar', description: e instanceof Error ? e.message : '', variant: 'error' }),
  })

  const salida = useMutation({
    mutationFn: async () => {
      const geo = await pedirGeo()
      const { error } = await supabase.rpc('trabajadores_fichaje_cerrar', {
        p_lat: geo?.lat ?? null,
        p_lng: geo?.lng ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast({ title: 'Fichaje de salida registrado', variant: 'success' })
      invalidate()
    },
    onError: (e) => toast({ title: 'Error al fichar salida', description: e instanceof Error ? e.message : '', variant: 'error' }),
  })

  const isPending = entrada.isPending || salida.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-[var(--line)] p-4 text-[var(--ink-mute)]">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  if (abierto) {
    const tiempoTrabajado = elapsed(abierto.ts_in)
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => salida.mutate()}
        className="w-full rounded-xl border p-4 text-left transition-all active:scale-[.98]"
        style={{
          background: 'oklch(28% .08 158 / .35)',
          borderColor: 'oklch(78% .14 158 / .30)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
              style={{ background: 'var(--mint-glow)', animation: 'ping 2s cubic-bezier(0,0,.2,1) infinite' }}
            >
              <Fingerprint className="h-5 w-5" style={{ color: 'var(--mint)' }} />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--mint)' }}>
                Trabajando
              </div>
              <div className="font-display text-lg font-bold" style={{ color: 'var(--ink)' }}>
                {tiempoTrabajado}
                {void tick}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--ink-mute)' }}>
                Entrada {format(new Date(abierto.ts_in), 'HH:mm', { locale: es })} · Pulsa para fichar salida
              </div>
            </div>
          </div>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
            style={{ background: 'oklch(30% .12 25 / .35)', border: '1px solid oklch(70% .18 25 / .3)' }}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--coral)' }} /> : <LogOut className="h-4 w-4" style={{ color: 'var(--coral)' }} />}
          </div>
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => entrada.mutate()}
      className="w-full rounded-xl border p-4 text-left transition-all active:scale-[.98]"
      style={{
        background: 'rgba(255,255,255,.02)',
        borderColor: 'var(--line-2)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--line-2)' }}
          >
            <Fingerprint className="h-5 w-5" style={{ color: 'var(--ink-mute)' }} />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-mute)]">Sin fichar hoy</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {format(new Date(), "EEEE d 'de' LLLL", { locale: es })}
            </div>
          </div>
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
          style={{ background: 'var(--mint-glow)', border: '1px solid oklch(78% .14 158 / .30)' }}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--mint)' }} /> : <LogIn className="h-4 w-4" style={{ color: 'var(--mint)' }} />}
        </div>
      </div>
    </button>
  )
}
