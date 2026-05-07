import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, LogIn, LogOut, MapPin, Loader2 } from 'lucide-react'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/lib/toast'

interface FichajeAbierto {
  id: string
  empleado_id: string
  empleado_nombre: string
  ts_in: string
  segundos_dentro: number
}

const FICHAJE_KEY = ['trabajadores', 'fichaje-actual'] as const

function fmtDuracion(segs: number): string {
  if (segs < 0) segs = 0
  const h = Math.floor(segs / 3600)
  const m = Math.floor((segs % 3600) / 60)
  const s = segs % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

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

export function FichajeCard() {
  const qc = useQueryClient()
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState<'in' | 'out' | null>(null)

  // Re-render cada 30s para actualizar el contador
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const actual = useQuery({
    queryKey: FICHAJE_KEY,
    queryFn: async (): Promise<FichajeAbierto | null> => {
      const { data, error } = await supabase.rpc('trabajadores_fichaje_actual')
      if (error) throw error
      const row = (data ?? [])[0] as Record<string, unknown> | undefined
      if (!row) return null
      return {
        id: String(row.id ?? ''),
        empleado_id: String(row.empleado_id ?? ''),
        empleado_nombre: String(row.empleado_nombre ?? ''),
        ts_in: String(row.ts_in ?? ''),
        segundos_dentro: Number(row.segundos_dentro ?? 0),
      }
    },
    staleTime: 30_000,
  })

  const fichar = useMutation({
    mutationFn: async (modo: 'in' | 'out') => {
      const geo = await pedirGeo()
      if (modo === 'in') {
        const { error } = await supabase.rpc('trabajadores_fichaje_abrir', {
          p_lat: geo?.lat ?? null,
          p_lng: geo?.lng ?? null,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.rpc('trabajadores_fichaje_cerrar', {
          p_lat: geo?.lat ?? null,
          p_lng: geo?.lng ?? null,
        })
        if (error) throw error
      }
      return { modo, geo }
    },
    onSuccess: ({ modo, geo }) => {
      qc.invalidateQueries({ queryKey: FICHAJE_KEY })
      toast({
        title: modo === 'in' ? 'Entrada registrada' : 'Salida registrada',
        description: geo ? 'Con ubicación' : 'Sin ubicación (permiso denegado o no disponible)',
        variant: 'success',
      })
    },
    onError: (e) => {
      toast({ title: 'No se pudo fichar', description: (e as Error).message, variant: 'error' })
    },
  })

  const onClick = async (modo: 'in' | 'out') => {
    setBusy(modo)
    try { await fichar.mutateAsync(modo) }
    finally { setBusy(null) }
  }

  if (actual.isLoading) {
    return (
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:p-5">
        <div className="flex items-center gap-2 text-sm text-[var(--color-ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando fichaje…
        </div>
      </section>
    )
  }

  // Sin sesión vinculada a empleado activo → no mostramos card.
  if (actual.error) {
    const msg = (actual.error as Error).message
    if (msg.includes('empleado')) return null
  }

  const abierto = actual.data
  // tick fuerza recálculo de la duración mostrada
  const segs = abierto ? abierto.segundos_dentro + Math.max(0, tick) * 30 : 0

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:p-5">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[var(--color-primary-2)]" />
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">
            Fichaje horario
          </h2>
        </div>
        <span className="hidden text-xs text-[var(--color-ink-3)] sm:inline">
          <MapPin className="mr-0.5 inline h-3 w-3" /> ubicación opcional
        </span>
      </header>

      {abierto ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-[var(--color-success-soft,rgba(16,185,129,0.12))] px-4 py-3 ring-1 ring-[var(--color-success,rgb(16,185,129))]/30">
            <div className="text-xs text-[var(--color-success,rgb(16,185,129))]">Dentro desde</div>
            <div className="font-display text-2xl font-bold tabular-nums text-[var(--color-ink)]">
              {new Date(abierto.ts_in).toLocaleTimeString('es-ES', {
                hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
              })}
            </div>
            <div className="text-sm text-[var(--color-ink-2)] tabular-nums">
              llevas <strong className="text-[var(--color-ink)]">{fmtDuracion(segs)}</strong>
            </div>
          </div>
          <Button
            size="lg"
            onClick={() => onClick('out')}
            disabled={busy != null}
            className="w-full bg-rose-600 text-white hover:bg-rose-700"
          >
            {busy === 'out' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Fichar salida
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl bg-[var(--color-surface-2)] px-4 py-3 ring-1 ring-[var(--color-border)]">
            <div className="text-xs text-[var(--color-ink-3)]">Estado</div>
            <div className="font-display text-lg font-semibold text-[var(--color-ink)]">
              Fuera de turno
            </div>
            <div className="text-xs text-[var(--color-ink-3)]">
              Pulsa para registrar la entrada de hoy.
            </div>
          </div>
          <Button
            size="lg"
            onClick={() => onClick('in')}
            disabled={busy != null}
            className="w-full"
          >
            {busy === 'in' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Fichar entrada
          </Button>
        </div>
      )}
    </section>
  )
}
