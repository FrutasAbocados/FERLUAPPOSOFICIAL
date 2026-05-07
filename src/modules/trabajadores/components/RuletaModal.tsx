import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'

type Premio = {
  id: string
  nombre: string
  descripcion: string | null
  tipo: 'puntos' | 'euros' | 'fisico' | 'comodin'
  valor: number
  peso: number
  icono: string | null
  color: string | null
}

type Resultado = {
  tirada_id: string
  premio_id: string
  premio_nombre: string
  premio_tipo: Premio['tipo']
  premio_valor: number
  premio_icono: string | null
  premio_color: string | null
  motivo: string | null
}

const COLOR_FILL: Record<string, string> = {
  amber:   '#fbbf24',
  emerald: '#34d399',
  rose:    '#fb7185',
  sky:     '#38bdf8',
  indigo:  '#818cf8',
  lime:    '#a3e635',
  violet:  '#a78bfa',
  pink:    '#f472b6',
  orange:  '#fb923c',
  teal:    '#2dd4bf',
}
const FALLBACK_FILLS = ['#fbbf24', '#34d399', '#fb7185', '#38bdf8', '#a3e635', '#a78bfa']
function fillFor(color: string | null, idx: number) {
  if (color && COLOR_FILL[color]) return COLOR_FILL[color]
  return FALLBACK_FILLS[idx % FALLBACK_FILLS.length]
}

const SIZE = 320
const CX = SIZE / 2
const CY = SIZE / 2
const R = SIZE / 2 - 6

function polarXY(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) }
}
function arcPath(startA: number, endA: number) {
  const s = polarXY(startA, R)
  const e = polarXY(endA, R)
  const largeArc = endA - startA > 180 ? 1 : 0
  return `M ${CX},${CY} L ${s.x},${s.y} A ${R},${R} 0 ${largeArc} 1 ${e.x},${e.y} Z`
}

type Phase = 'idle' | 'spinning' | 'done' | 'error'

export function RuletaModal({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [rotation, setRotation] = useState(0)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: premios, isLoading } = useQuery({
    queryKey: ['ruleta', 'premios-activos'] as const,
    queryFn: async (): Promise<Premio[]> => {
      const { data, error } = await supabase
        .from('trabajadores_ruleta_premios')
        .select('id, nombre, descripcion, tipo, valor, peso, icono, color, created_at')
        .eq('activo', true)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map((p) => ({
        id: String(p.id),
        nombre: String(p.nombre),
        descripcion: p.descripcion ? String(p.descripcion) : null,
        tipo: p.tipo as Premio['tipo'],
        valor: Number(p.valor ?? 0),
        peso: Number(p.peso ?? 1),
        icono: p.icono ? String(p.icono) : null,
        color: p.color ? String(p.color) : null,
      }))
    },
  })

  const sliceSize = useMemo(
    () => (premios && premios.length > 0 ? 360 / premios.length : 0),
    [premios],
  )

  const handleTirar = async () => {
    if (!premios || premios.length === 0) return
    setPhase('spinning')
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('ruleta_tirar')
      if (rpcError) throw rpcError
      const rows = (data ?? []) as Resultado[]
      const res = rows[0]
      if (!res) throw new Error('La tirada no devolvió premio')
      const idx = premios.findIndex((p) => p.id === res.premio_id)
      if (idx < 0) {
        // El backend escogió un premio que el frontend no conoce (caché stale).
        // Lo mostramos sin animación bonita, pero damos el resultado.
        setRotation(360 * 6)
        setResultado(res)
        setTimeout(() => setPhase('done'), 600)
        return
      }
      const sliceCenter = idx * sliceSize + sliceSize / 2
      const finalRot = 360 * 6 + (360 - sliceCenter)
      setRotation(finalRot)
      setResultado(res)
      setTimeout(() => setPhase('done'), 4400)
    } catch (e) {
      setPhase('error')
      setError(e instanceof Error ? e.message : 'Error desconocido')
    }
  }

  return (
    <Modal onClose={onClose} size="lg" closeOnOverlay={phase !== 'spinning'}>
      <div className="relative">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="font-display text-xl font-bold text-[var(--color-ink)]">Ruleta de la suerte</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            disabled={phase === 'spinning'}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="bg-gradient-to-br from-amber-50 via-rose-50 to-sky-50 px-5 py-6">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-12 text-[var(--color-ink-3)]">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando premios…
            </div>
          )}

          {!isLoading && (!premios || premios.length === 0) && (
            <p className="py-12 text-center text-sm text-[var(--color-ink-3)]">
              No hay premios disponibles. Avisa a Luis o Álvaro.
            </p>
          )}

          {premios && premios.length > 0 && (
            <div className="flex flex-col items-center gap-4">
              <Wheel
                premios={premios}
                rotation={rotation}
                animating={phase === 'spinning'}
                sliceSize={sliceSize}
              />

              {phase === 'idle' && (
                <Button
                  size="lg"
                  onClick={handleTirar}
                  className="bg-gradient-to-r from-amber-500 via-rose-500 to-pink-500 px-8 text-base font-bold text-white shadow-lg hover:from-amber-600 hover:via-rose-600 hover:to-pink-600"
                >
                  ¡GIRAR LA RULETA!
                </Button>
              )}

              {phase === 'spinning' && (
                <p className="text-sm font-medium text-[var(--color-ink-2)]">girando…</p>
              )}

              {phase === 'done' && resultado && (
                <PremioResult resultado={resultado} onClose={onClose} />
              )}

              {phase === 'error' && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error ?? 'Algo ha fallado'}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-2"
                    onClick={() => { setPhase('idle'); setError(null) }}
                  >
                    Reintentar
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Wheel({
  premios,
  rotation,
  animating,
  sliceSize,
}: {
  premios: Premio[]
  rotation: number
  animating: boolean
  sliceSize: number
}) {
  return (
    <div className="relative">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="drop-shadow-xl">
        <g
          style={{
            transformOrigin: `${CX}px ${CY}px`,
            transform: `rotate(${rotation}deg)`,
            transition: animating ? 'transform 4s cubic-bezier(0.17, 0.67, 0.14, 1)' : 'none',
          }}
        >
          {premios.map((p, i) => {
            const startA = i * sliceSize
            const endA = (i + 1) * sliceSize
            const labelA = startA + sliceSize / 2
            const labelPos = polarXY(labelA, R * 0.65)
            return (
              <g key={p.id}>
                <path
                  d={arcPath(startA, endA)}
                  fill={fillFor(p.color, i)}
                  stroke="white"
                  strokeWidth={3}
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="22"
                  transform={`rotate(${labelA}, ${labelPos.x}, ${labelPos.y})`}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {p.icono ?? '🎁'}
                </text>
              </g>
            )
          })}
        </g>

        {/* Pivote central */}
        <circle cx={CX} cy={CY} r={18} fill="white" stroke="#1f2937" strokeWidth={3} />
        <circle cx={CX} cy={CY} r={6} fill="#1f2937" />
      </svg>

      {/* Pointer fijo arriba */}
      <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1">
        <div
          className="h-0 w-0"
          style={{
            borderLeft: '14px solid transparent',
            borderRight: '14px solid transparent',
            borderTop: '24px solid #1f2937',
          }}
        />
      </div>
    </div>
  )
}

function PremioResult({ resultado, onClose }: { resultado: Resultado; onClose: () => void }) {
  const tipoLabel = {
    puntos: 'puntos',
    euros: 'euros',
    fisico: 'físico',
    comodin: 'comodín',
  }[resultado.premio_tipo]

  const valorTxt =
    resultado.premio_tipo === 'puntos' ? `+${resultado.premio_valor} pts`
    : resultado.premio_tipo === 'euros' ? euros(resultado.premio_valor)
    : null

  return (
    <div className="w-full max-w-md rounded-xl border border-amber-300 bg-white p-5 text-center shadow-lg">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
        ¡has ganado!
      </div>
      <div className="my-2 text-5xl">{resultado.premio_icono ?? '🎁'}</div>
      <div className="font-display text-2xl font-bold text-[var(--color-ink)]">
        {resultado.premio_nombre}
      </div>
      {valorTxt && (
        <div className="mt-1 font-display text-lg font-bold text-emerald-700 tabular-nums">{valorTxt}</div>
      )}
      <div className="mt-2 text-xs uppercase tracking-wider text-[var(--color-ink-3)]">{tipoLabel}</div>
      {resultado.motivo && (
        <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="font-semibold">Por:</span> {resultado.motivo}
        </div>
      )}
      <Button onClick={onClose} className="mt-4 w-full" size="lg">
        ¡Genial!
      </Button>
    </div>
  )
}
