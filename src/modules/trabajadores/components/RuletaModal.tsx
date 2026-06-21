import { useMemo, useRef, useState } from 'react'
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
  tipo: 'puntos' | 'euros' | 'fisico' | 'comodin' | 'bonus'
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

// Gradiente rico por color (claro → base → sombra) para gajos glossy.
const COLOR_GRAD: Record<string, { a: string; b: string; c: string; glow: string }> = {
  amber:   { a: '#fde68a', b: '#f59e0b', c: '#92400e', glow: '#fbbf24' },
  emerald: { a: '#a7f3d0', b: '#10b981', c: '#065f46', glow: '#34d399' },
  rose:    { a: '#fecdd3', b: '#f43f5e', c: '#881337', glow: '#fb7185' },
  sky:     { a: '#bae6fd', b: '#0ea5e9', c: '#075985', glow: '#38bdf8' },
  lime:    { a: '#d9f99d', b: '#84cc16', c: '#3f6212', glow: '#bef264' },
  violet:  { a: '#ddd6fe', b: '#8b5cf6', c: '#4c1d95', glow: '#a78bfa' },
  orange:  { a: '#fed7aa', b: '#f97316', c: '#7c2d12', glow: '#fb923c' },
  teal:    { a: '#99f6e4', b: '#14b8a6', c: '#134e4a', glow: '#2dd4bf' },
  pink:    { a: '#fbcfe8', b: '#ec4899', c: '#831843', glow: '#f472b6' },
  indigo:  { a: '#c7d2fe', b: '#6366f1', c: '#312e81', glow: '#818cf8' },
}
const FALLBACK_KEYS = ['lime', 'amber', 'emerald', 'orange', 'rose', 'sky']
function gradFor(color: string | null, idx: number) {
  if (color && COLOR_GRAD[color]) return COLOR_GRAD[color]
  return COLOR_GRAD[FALLBACK_KEYS[idx % FALLBACK_KEYS.length]]
}

const SIZE = 320
const CX = SIZE / 2
const CY = SIZE / 2
const OUTER_R = 138 // radio exterior de los gajos
const INNER_R = 46 // donut interior (hub)
const BULB_R = 150 // anillo de bombillas
const RIM_R = 158 // aro metálico
const SPIN_MS = 4400
const BULBS = 24

function polarXY(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) }
}
function segPath(startA: number, endA: number) {
  const oS = polarXY(startA, OUTER_R)
  const oE = polarXY(endA, OUTER_R)
  const iS = polarXY(startA, INNER_R)
  const iE = polarXY(endA, INNER_R)
  const large = endA - startA > 180 ? 1 : 0
  return [
    `M ${oS.x} ${oS.y}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${large} 1 ${oE.x} ${oE.y}`,
    `L ${iE.x} ${iE.y}`,
    `A ${INNER_R} ${INNER_R} 0 ${large} 0 ${iS.x} ${iS.y}`,
    'Z',
  ].join(' ')
}

type Phase = 'idle' | 'spinning' | 'done' | 'error'

const KEYFRAMES = `
@keyframes ruleta-bulb {
  0%,100% { opacity: .45; }
  50%     { opacity: 1; filter: drop-shadow(0 0 5px #fde68a); }
}
@keyframes ruleta-pointer {
  0% { transform: translateX(-50%) rotate(0deg); }
  35% { transform: translateX(-50%) rotate(-11deg); }
  70% { transform: translateX(-50%) rotate(6deg); }
  100% { transform: translateX(-50%) rotate(0deg); }
}
@keyframes ruleta-win {
  0%,100% { opacity: .5; }
  50%     { opacity: 1; }
}
@keyframes ruleta-confetti {
  0%   { transform: translate3d(0,0,0) rotate(0deg); opacity: 1; }
  100% { transform: translate3d(var(--dx,16px),360px,0) rotate(680deg); opacity: 0; }
}
`

export function RuletaModal({ onClose, modoTest = false }: { onClose: () => void; modoTest?: boolean }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [rotation, setRotation] = useState(0)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0) // re-dispara el rebote del puntero
  const rotRef = useRef(0)

  const { data: premios, isLoading } = useQuery({
    queryKey: ['ruleta', 'premios-activos'] as const,
    queryFn: async (): Promise<Premio[]> => {
      // RPC: premios activos ya excluyendo el "Desayuno para ti mismo" según el empleado logueado
      const { data, error } = await supabase.rpc('ruleta_premios_visibles')
      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
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
    // "clack" del puntero mientras gira
    const clack = window.setInterval(() => setTick((n) => n + 1), 110)
    try {
      const res = modoTest ? premioDemo(premios) : await tirarReal()
      if (!res) throw new Error('La tirada no devolvió premio')
      const idx = premios.findIndex((p) => p.id === res.premio_id)

      const turns = 6 + Math.floor(Math.random() * 3)
      const base = rotRef.current
      const currentMod = ((base % 360) + 360) % 360
      // Si el backend escogió un premio fuera de la rueda (caché stale), giramos a 0.
      const sliceCenter = idx >= 0 ? idx * sliceSize + sliceSize / 2 : 0
      const desiredMod = ((360 - sliceCenter) % 360 + 360) % 360
      const delta = (desiredMod - currentMod + 360) % 360
      const finalRot = base + turns * 360 + delta
      rotRef.current = finalRot
      setRotation(finalRot)
      setResultado(res)

      window.setTimeout(() => {
        window.clearInterval(clack)
        setPhase('done')
      }, idx >= 0 ? SPIN_MS : 700)
    } catch (e) {
      window.clearInterval(clack)
      setPhase('error')
      setError(e instanceof Error ? e.message : 'Error desconocido')
    }
  }

  return (
    <Modal onClose={onClose} size="lg" closeOnOverlay={phase !== 'spinning'}>
      <style>{KEYFRAMES}</style>
      <div className="relative overflow-hidden rounded-[inherit] bg-[#0a0d0a] text-zinc-50">
        {/* halo lima de fondo */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(120% 80% at 50% 8%, rgba(132,204,22,.18), transparent 60%)' }}
        />

        <div className="relative flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-lime-300/80">Abocados OS</p>
            <h2 className="font-display text-xl font-black tracking-tight text-white">Ruleta de la suerte</h2>
            {modoTest && (
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                Modo test · no gasta puntos
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={phase === 'spinning'}
            aria-label="Cerrar"
            className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-200 transition hover:bg-white/10 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative px-5 pb-6 pt-1">
          {phase === 'done' && resultado && idxOnWheel(premios, resultado) && <Confetti />}

          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-16 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando premios…
            </div>
          )}

          {!isLoading && (!premios || premios.length === 0) && (
            <p className="py-16 text-center text-sm text-zinc-400">
              No hay premios disponibles. Avisa a Luis o Álvaro.
            </p>
          )}

          {premios && premios.length > 0 && (
            <div className="flex flex-col items-center gap-5">
              <Wheel
                premios={premios}
                rotation={rotation}
                animating={phase === 'spinning'}
                sliceSize={sliceSize}
                winnerId={phase === 'done' ? resultado?.premio_id ?? null : null}
                tick={tick}
              />

              {phase === 'idle' && (
                <button
                  onClick={handleTirar}
                  className="group relative w-full max-w-xs rounded-full border border-lime-200/40 bg-gradient-to-b from-lime-200 via-lime-400 to-emerald-700 px-8 py-4 text-base font-black uppercase tracking-[0.18em] text-emerald-950 shadow-[0_14px_34px_rgba(132,204,22,.35)] transition active:scale-95"
                >
                  {modoTest ? 'Probar ruleta' : '¡Girar!'}
                  <span className="mt-0.5 block text-[10px] font-bold tracking-normal text-emerald-900/80">
                    Toca para girar la ruleta
                  </span>
                </button>
              )}

              {phase === 'spinning' && (
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-lime-300/90">girando…</p>
              )}

              {phase === 'done' && resultado && (
                <PremioResult resultado={resultado} onClose={onClose} />
              )}

              {phase === 'error' && (
                <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-100">
                  {error ?? 'Algo ha fallado'}
                  <button
                    className="ml-2 underline decoration-rose-300/60 underline-offset-2 hover:text-white"
                    onClick={() => { setPhase('idle'); setError(null) }}
                  >
                    Reintentar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function idxOnWheel(premios: Premio[] | undefined, res: Resultado) {
  return !!premios && premios.some((p) => p.id === res.premio_id)
}

async function tirarReal(): Promise<Resultado | null> {
  const { data, error: rpcError } = await supabase.rpc('ruleta_tirar')
  if (rpcError) throw rpcError
  const rows = (data ?? []) as Resultado[]
  return rows[0] ?? null
}

function premioDemo(premios: Premio[]): Resultado | null {
  if (premios.length === 0) return null
  const premio = premios[Math.floor(Math.random() * premios.length)]
  return {
    tirada_id: 'demo',
    premio_id: premio.id,
    premio_nombre: premio.nombre,
    premio_tipo: premio.tipo,
    premio_valor: premio.valor,
    premio_icono: premio.icono,
    premio_color: premio.color,
    motivo: 'Vista de prueba para Luis',
  }
}

function Wheel({
  premios,
  rotation,
  animating,
  sliceSize,
  winnerId,
  tick,
}: {
  premios: Premio[]
  rotation: number
  animating: boolean
  sliceSize: number
  winnerId: string | null
  tick: number
}) {
  const iconSize = premios.length >= 12 ? 17 : premios.length >= 10 ? 19 : 22

  return (
    <div className="relative">
      {/* Puntero dorado con rebote */}
      <div
        key={tick}
        className="pointer-events-none absolute left-1/2 top-[-6px] z-30 -translate-x-1/2"
        style={{ animation: animating ? 'ruleta-pointer 150ms ease-out' : undefined }}
      >
        <div
          className="h-0 w-0"
          style={{
            borderLeft: '15px solid transparent',
            borderRight: '15px solid transparent',
            borderTop: '30px solid #fbbf24',
            filter: 'drop-shadow(0 4px 6px rgba(0,0,0,.6))',
          }}
        />
        <div className="absolute left-1/2 top-1 h-2 w-2 -translate-x-1/2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,.9)]" />
      </div>

      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="overflow-visible drop-shadow-[0_24px_40px_rgba(0,0,0,.55)]"
        role="img"
        aria-label="Rueda de premios"
      >
        <defs>
          <radialGradient id="ruleta-metal" cx="34%" cy="26%">
            <stop offset="0%" stopColor="#fff7c2" />
            <stop offset="28%" stopColor="#f4c76b" />
            <stop offset="62%" stopColor="#8a571e" />
            <stop offset="100%" stopColor="#2a1808" />
          </radialGradient>
          <radialGradient id="ruleta-hub" cx="36%" cy="26%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="20%" stopColor="#d9f99d" />
            <stop offset="60%" stopColor="#166534" />
            <stop offset="100%" stopColor="#052e16" />
          </radialGradient>
          {premios.map((p, i) => {
            const g = gradFor(p.color, i)
            return (
              <linearGradient key={p.id} id={`ruleta-seg-${p.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={g.a} />
                <stop offset="50%" stopColor={g.b} />
                <stop offset="100%" stopColor={g.c} />
              </linearGradient>
            )
          })}
        </defs>

        {/* Aro metálico + anillos */}
        <circle cx={CX} cy={CY} r={RIM_R + 6} fill="url(#ruleta-metal)" />
        <circle cx={CX} cy={CY} r={RIM_R} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth={2} />
        <circle cx={CX} cy={CY} r={OUTER_R + 4} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth={7} />

        {/* Bombillas */}
        {Array.from({ length: BULBS }).map((_, i) => {
          const a = (360 / BULBS) * i
          const pos = polarXY(a, BULB_R)
          return (
            <circle
              key={i}
              cx={pos.x}
              cy={pos.y}
              r={i % 2 === 0 ? 3.4 : 2.6}
              fill={i % 2 === 0 ? '#fef3c7' : '#bef264'}
              style={{ animation: animating ? `ruleta-bulb .7s ${i * 0.03}s linear infinite` : undefined }}
            />
          )
        })}

        {/* Gajos */}
        <g
          style={{
            transformOrigin: `${CX}px ${CY}px`,
            transform: `rotate(${rotation}deg)`,
            transition: animating ? `transform ${SPIN_MS}ms cubic-bezier(.13,.78,.08,1)` : 'none',
          }}
        >
          {premios.map((p, i) => {
            const start = i * sliceSize
            const end = (i + 1) * sliceSize
            const mid = start + sliceSize / 2
            const iconPos = polarXY(mid, (OUTER_R + INNER_R) / 2 + 6)
            const isWinner = winnerId === p.id
            const g = gradFor(p.color, i)
            return (
              <g key={p.id}>
                <path
                  d={segPath(start, end)}
                  fill={`url(#ruleta-seg-${p.id})`}
                  stroke="rgba(255,255,255,.55)"
                  strokeWidth={1.4}
                />
                {isWinner && (
                  <path
                    d={segPath(start + 0.6, end - 0.6)}
                    fill="none"
                    stroke={g.glow}
                    strokeWidth={5}
                    style={{ animation: 'ruleta-win 900ms ease-in-out infinite' }}
                  />
                )}
                <text
                  x={iconPos.x}
                  y={iconPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={iconSize}
                  transform={`rotate(${mid}, ${iconPos.x}, ${iconPos.y})`}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {p.icono ?? '🎁'}
                </text>
              </g>
            )
          })}
        </g>

        {/* Hub central */}
        <circle cx={CX} cy={CY} r={INNER_R + 4} fill="rgba(0,0,0,.5)" />
        <circle cx={CX} cy={CY} r={INNER_R} fill="url(#ruleta-hub)" stroke="rgba(255,255,255,.5)" strokeWidth={2} />
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize="9" fontWeight={900} letterSpacing="1.5" fill="#ffffff">
          FRUTAS
        </text>
        <text x={CX} y={CY + 8} textAnchor="middle" fontSize="11" fontWeight={900} letterSpacing="0.5" fill="#ecfccb">
          ABOCADOS
        </text>
      </svg>
    </div>
  )
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        left: 6 + Math.random() * 88,
        delay: Math.random() * 0.4,
        duration: 1.6 + Math.random() * 1.1,
        dx: `${Math.round((Math.random() - 0.5) * 60)}px`,
        rot: Math.random() * 360,
        color: ['#bef264', '#fbbf24', '#fb923c', '#34d399', '#f472b6'][i % 5],
      })),
    [],
  )
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 h-2.5 w-1.5 rounded-[1px]"
          style={{
            left: `${p.left}%`,
            background: p.color,
            transform: `rotate(${p.rot}deg)`,
            // @ts-expect-error custom prop para el keyframe
            '--dx': p.dx,
            animation: `ruleta-confetti ${p.duration}s ${p.delay}s ease-out forwards`,
          }}
        />
      ))}
    </div>
  )
}

function PremioResult({ resultado, onClose }: { resultado: Resultado; onClose: () => void }) {
  const tipoLabel = {
    puntos: 'puntos',
    euros: 'euros',
    fisico: 'físico',
    comodin: 'comodín',
    bonus: 'tirada extra',
  }[resultado.premio_tipo]

  const valorTxt =
    resultado.premio_tipo === 'puntos' ? `${resultado.premio_valor > 0 ? '+' : ''}${resultado.premio_valor} pts`
    : resultado.premio_tipo === 'euros' ? euros(resultado.premio_valor)
    : resultado.premio_tipo === 'bonus' ? '¡Otra tirada!'
    : null

  return (
    <div className="w-full max-w-md rounded-[1.6rem] border border-lime-200/25 bg-gradient-to-br from-white/10 via-lime-300/10 to-amber-300/10 p-5 text-center shadow-inner">
      <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-lime-300/90">¡has ganado!</div>
      <div className="mx-auto my-3 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 text-5xl shadow-[inset_0_1px_0_rgba(255,255,255,.3)]">
        {resultado.premio_icono ?? '🏆'}
      </div>
      <div className="font-display text-2xl font-black text-white">{resultado.premio_nombre}</div>
      {valorTxt && (
        <div className="mt-1 font-display text-lg font-black tabular-nums text-amber-200">{valorTxt}</div>
      )}
      <div className="mt-1 text-[11px] uppercase tracking-wider text-zinc-400">{tipoLabel}</div>
      {resultado.motivo && (
        <div className="mt-3 rounded-xl bg-black/30 px-3 py-2 text-xs text-lime-100/90">
          <span className="font-semibold">Por:</span> {resultado.motivo}
        </div>
      )}
      <Button
        onClick={onClose}
        className="mt-4 w-full bg-white text-emerald-950 hover:bg-zinc-100"
        size="lg"
      >
        ¡Genial!
      </Button>
    </div>
  )
}
