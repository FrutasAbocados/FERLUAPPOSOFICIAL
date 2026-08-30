import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Lock, Mic, MicOff, Power, RefreshCw, Save, Sparkles, Square, X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { useAuth } from '@/shared/auth/useAuth'
import { env } from '@/shared/lib/env'
import { supabase } from '@/shared/lib/supabase'
import {
  addRealtimeUsage,
  emptyRealtimeUsage,
  estimateRealtimeCost,
  PEOPLE_AUTOCLOSE_USD,
  PEOPLE_COST_LIMIT_USD,
  PEOPLE_MAX_DURATION_SECONDS,
  type RealtimeUsage,
} from '../lib/usage'

type CoachState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'processing' | 'ended' | 'error'

interface PrivateSummary {
  points: string[]
  objective: string | null
  firstStep: string | null
}

interface OperationalSummary {
  points: string[]
  requestedSupport: string | null
}

type ProfileCategory = 'motivator' | 'communication_preference' | 'support_preference' | 'energizer' | 'friction' | 'strength_candidate' | 'growth_interest'

interface ProfileCandidate {
  id: string
  category: ProfileCategory
  statement: string
  managerGuidance: string | null
}

interface CoachAdminControl {
  enabled: boolean
  monthlyBudgetUsd: number
  spentUsd: number
  reservedUsd: number
  totalCommittedUsd: number
}

interface SessionUsage {
  durationSeconds: number
  estimatedCostUsd: number
  realtimeCostUsd: number
  summaryCostUsd: number
  transcriptionCostUsd: number
  realtimeTokens: RealtimeUsage
  summaryTokens: { inputTokens: number; outputTokens: number }
}

interface TemporaryTurn {
  role: 'employee' | 'coach'
  text: string
  order: number
}

interface AudioDevice {
  deviceId: string
  label: string
}

const PROFILE_CATEGORY_LABELS: Record<ProfileCategory, string> = {
  motivator: 'Qué te mueve',
  communication_preference: 'Cómo comunicar contigo',
  support_preference: 'Qué apoyo te ayuda',
  energizer: 'Qué te activa',
  friction: 'Fricción operativa',
  strength_candidate: 'Fortaleza que reconoces',
  growth_interest: 'Dónde quieres crecer',
}

export function PeopleCoachCard() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [lastSummary, setLastSummary] = useState<PrivateSummary | null>(null)

  const loadLastSummary = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('people_coach_sessions')
      .select('private_summary')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setLastSummary(readSummary(data?.private_summary))
  }, [user])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadLastSummary() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadLastSummary])

  return (
    <>
      <section
        className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[oklch(78%_.14_158_/_0.28)] p-4 sm:p-5"
        style={{ background: 'linear-gradient(135deg,oklch(20% .07 158 / .92),rgba(12,18,17,.94) 68%)' }}
      >
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-[oklch(75%_.16_158_/_0.10)] blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--mint)] text-[oklch(15%_.03_158)] shadow-[0_0_24px_oklch(78%_.14_158_/_0.22)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-[var(--ink)]">Habla con tu coach</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-mute)]">
              Un rato para ordenar el trabajo y salir con un paso claro.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-xl bg-[var(--mint)] px-3.5 py-2.5 text-sm font-semibold text-[oklch(15%_.03_158)] transition-transform active:scale-[.98]"
          >
            Hablar
          </button>
        </div>
        {lastSummary?.firstStep && (
          <div className="relative mt-3 border-t border-[var(--line)] pt-3 text-xs text-[var(--ink-mute)]">
            <span className="font-semibold text-[var(--mint)]">Tu siguiente paso: </span>
            {lastSummary.firstStep}
          </div>
        )}
      </section>
      {open && (
        <PeopleCoachModal
          onClose={() => setOpen(false)}
          onCompleted={loadLastSummary}
        />
      )}
    </>
  )
}

function PeopleCoachModal({ onClose, onCompleted }: { onClose: () => void; onCompleted: () => Promise<void> }) {
  const { session } = useAuth()
  const accessToken = session?.access_token
  const [accepted, setAccepted] = useState(false)
  const [preparingMic, setPreparingMic] = useState(false)
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [state, setState] = useState<CoachState>('idle')
  const [muted, setMuted] = useState(false)
  const [message, setMessage] = useState('Estoy contigo.')
  const [summary, setSummary] = useState<PrivateSummary | null>(null)
  const [operationalSummary, setOperationalSummary] = useState<OperationalSummary | null>(null)
  const [profileCandidates, setProfileCandidates] = useState<ProfileCandidate[]>([])
  const [selectedProfileItems, setSelectedProfileItems] = useState<Set<string>>(new Set())
  const [profileDecision, setProfileDecision] = useState<'pending' | 'saving' | 'shared' | 'declined' | 'error'>('pending')
  const [usage, setUsage] = useState<SessionUsage | null>(null)
  const [budgetClosed, setBudgetClosed] = useState(false)
  const [controlClosedReason, setControlClosedReason] = useState<'coach_disabled' | 'monthly_budget_reached' | null>(null)

  const peerRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const hardStopRef = useRef<number | null>(null)
  const endingRef = useRef(false)
  const turnsRef = useRef(new Map<string, TemporaryTurn>())
  const turnOrderRef = useRef(0)
  const realtimeUsageRef = useRef<RealtimeUsage>(emptyRealtimeUsage())
  const endRef = useRef<() => Promise<void>>(async () => undefined)

  const active = state === 'connecting' || state === 'listening' || state === 'speaking' || state === 'processing'

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return []
    const list = (await navigator.mediaDevices.enumerateDevices())
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Micrófono ${index + 1}` }))
    setDevices(list)
    return list
  }, [])

  const acceptAndPrepare = async () => {
    setPreparingMic(true)
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      permissionStream.getTracks().forEach((track) => track.stop())
      const list = await refreshDevices()
      const macMic = list.find((device) => /macbook|integrado|built-in|studio display/i.test(device.label))
      setSelectedDeviceId((current) => current || macMic?.deviceId || list[0]?.deviceId || '')
      setAccepted(true)
    } catch {
      setMessage('Necesito permiso para usar el micrófono.')
      setState('error')
    } finally {
      setPreparingMic(false)
    }
  }

  const closeMedia = useCallback(() => {
    if (hardStopRef.current) window.clearTimeout(hardStopRef.current)
    hardStopRef.current = null
    channelRef.current?.close()
    peerRef.current?.close()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    if (audioRef.current) audioRef.current.srcObject = null
    channelRef.current = null
    peerRef.current = null
    streamRef.current = null
    audioRef.current = null
  }, [])

  useEffect(() => () => closeMedia(), [closeMedia])

  const apiFetch = useCallback(async (method: 'GET' | 'POST' | 'PUT' | 'PATCH', body?: BodyInit, contentType?: string) => {
    if (!accessToken) throw new Error('missing_session')
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      apikey: env.supabaseAnonKey,
    }
    if (contentType) headers['Content-Type'] = contentType
    return fetch(`${env.supabaseUrl}/functions/v1/people-coach`, {
      method,
      headers,
      body,
    })
  }, [accessToken])

  useEffect(() => {
    if (state !== 'listening' && state !== 'speaking') return
    let checking = false
    const checkControl = async () => {
      if (checking || endingRef.current) return
      checking = true
      try {
        const response = await apiFetch('GET')
        if (!response.ok) return
        const payload = await response.json() as { continueAllowed?: boolean; reason?: string | null }
        if (payload.continueAllowed === false) {
          const reason = payload.reason === 'monthly_budget_reached' ? 'monthly_budget_reached' : 'coach_disabled'
          setControlClosedReason(reason)
          void endRef.current()
        }
      } finally {
        checking = false
      }
    }
    const timer = window.setInterval(() => { void checkControl() }, 15_000)
    return () => window.clearInterval(timer)
  }, [apiFetch, state])

  const rememberTurn = (event: Record<string, unknown>, role: TemporaryTurn['role']) => {
    const text = typeof event.transcript === 'string' ? event.transcript.trim() : ''
    if (!text) return
    const key = typeof event.item_id === 'string' ? `${role}:${event.item_id}` : `${role}:${turnOrderRef.current}`
    const existing = turnsRef.current.get(key)
    turnsRef.current.set(key, { role, text: text.slice(0, 800), order: existing?.order ?? turnOrderRef.current++ })
  }

  const handleRealtimeEvent = (raw: string) => {
    try {
      const event = JSON.parse(raw) as Record<string, unknown>
      if (event.type === 'input_audio_buffer.speech_started') {
        setState('listening')
        setMessage('Te escucho…')
      }
      if (event.type === 'response.output_audio.delta') {
        setState('speaking')
        setMessage('Lumo está hablando…')
      }
      if (event.type === 'conversation.item.input_audio_transcription.completed') rememberTurn(event, 'employee')
      if (event.type === 'response.output_audio_transcript.done') rememberTurn(event, 'coach')
      if (event.type === 'response.done') {
        realtimeUsageRef.current = addRealtimeUsage(realtimeUsageRef.current, event.response)
        const seconds = startedAtRef.current ? (Date.now() - startedAtRef.current) / 1_000 : 0
        const estimated = estimateRealtimeCost(realtimeUsageRef.current) + (seconds / 60) * 0.017
        if (estimated >= PEOPLE_AUTOCLOSE_USD) {
          setBudgetClosed(true)
          void endRef.current()
          return
        }
        setState('listening')
        setMessage('Te escucho.')
      }
      if (event.type === 'error') {
        closeMedia()
        setState('error')
        setMessage('La conversación se ha interrumpido. Puedes volver a intentarlo.')
      }
    } catch {
      // Los eventos desconocidos no se guardan ni se muestran.
    }
  }

  const startConversation = async () => {
    if (!accepted || active) return
    setState('connecting')
    setMessage('Conectando de forma segura…')
    setSummary(null)
    setOperationalSummary(null)
    setProfileCandidates([])
    setSelectedProfileItems(new Set())
    setProfileDecision('pending')
    setUsage(null)
    setBudgetClosed(false)
    setControlClosedReason(null)
    setMuted(false)
    endingRef.current = false
    sessionIdRef.current = null
    turnsRef.current.clear()
    turnOrderRef.current = 0
    realtimeUsageRef.current = emptyRealtimeUsage()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      })
      const peer = new RTCPeerConnection()
      const audio = document.createElement('audio')
      audio.autoplay = true
      audio.setAttribute('playsinline', 'true')
      peer.ontrack = (event) => { audio.srcObject = event.streams[0] ?? null }
      stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream))

      const channel = peer.createDataChannel('oai-events')
      channel.addEventListener('message', (event) => handleRealtimeEvent(String(event.data)))
      channel.addEventListener('open', () => {
        startedAtRef.current = Date.now()
        hardStopRef.current = window.setTimeout(() => {
          setBudgetClosed(true)
          void endRef.current()
        }, PEOPLE_MAX_DURATION_SECONDS * 1_000)
        setState('listening')
        setMessage('Estoy contigo.')
        channel.send(JSON.stringify({
          type: 'response.create',
          response: {
            output_modalities: ['audio'],
            instructions: 'Abre con dos frases breves: explica que es una charla para mejorar el trabajo y pregunta cómo está viviendo últimamente su día a día.',
          },
        }))
      })
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed' && !endingRef.current) {
          closeMedia()
          setState('error')
          setMessage('No he podido mantener la conexión de voz.')
        }
      }

      peerRef.current = peer
      streamRef.current = stream
      audioRef.current = audio
      channelRef.current = channel

      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      if (!offer.sdp) throw new Error('missing_offer')
      const response = await apiFetch('POST', offer.sdp, 'application/sdp')
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(payload.error ?? 'realtime_rejected')
      }
      sessionIdRef.current = response.headers.get('X-Abocados-People-Session')
      const answer = await response.text()
      await peer.setRemoteDescription({ type: 'answer', sdp: answer })
    } catch (error) {
      closeMedia()
      setState('error')
      const code = error instanceof Error ? error.message : ''
      setMessage(
        code === 'daily_limit'
          ? 'Ya has hecho tu sesión de hoy. Podrás volver dentro de 24 horas.'
          : code === 'weekly_limit'
            ? 'Has alcanzado el máximo de 3 sesiones esta semana.'
            : code === 'session_in_progress'
              ? 'Ya hay una conversación abierta. Espera unos minutos antes de volver a entrar.'
              : code === 'coach_disabled'
                ? 'El coach está pausado temporalmente por administración.'
                : code === 'monthly_budget_reached'
                  ? 'El presupuesto mensual del coach se ha agotado temporalmente.'
              : 'No he podido empezar. Revisa el micrófono e inténtalo de nuevo.',
      )
    }
  }

  const endConversation = useCallback(async () => {
    if (endingRef.current) return
    endingRef.current = true
    const sessionId = sessionIdRef.current
    const durationSeconds = startedAtRef.current
      ? Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1_000))
      : 0
    const turns = [...turnsRef.current.values()]
      .sort((left, right) => left.order - right.order)
      .map(({ role, text }) => ({ role, text }))
    setState('processing')
    setMessage('Preparando tu resumen privado…')
    closeMedia()

    if (!sessionId) {
      setState('error')
      setMessage('No se pudo cerrar correctamente la sesión.')
      endingRef.current = false
      return
    }
    try {
      const response = await apiFetch('PUT', JSON.stringify({
        sessionId,
        durationSeconds,
        turns,
        realtimeUsage: realtimeUsageRef.current,
      }), 'application/json')
      if (!response.ok) throw new Error('finish_failed')
      const result = await response.json() as { summary?: unknown; operationalSummary?: unknown; profileCandidates?: unknown; usage?: unknown }
      setSummary(readSummary(result.summary))
      setOperationalSummary(readOperationalSummary(result.operationalSummary))
      setProfileCandidates(readProfileCandidates(result.profileCandidates))
      setUsage(readUsage(result.usage))
      setState('ended')
      setMessage('Conversación terminada. Tus resúmenes están listos.')
      await onCompleted()
    } catch {
      setState('error')
      setMessage('La charla terminó, pero no pude preparar el resumen. Inténtalo de nuevo más tarde.')
    } finally {
      endingRef.current = false
    }
  }, [apiFetch, closeMedia, onCompleted])

  useEffect(() => { endRef.current = endConversation }, [endConversation])

  const saveProfileDecision = async (approvedItemIds: string[]) => {
    const sessionId = sessionIdRef.current
    if (!sessionId || profileDecision === 'saving') return
    setProfileDecision('saving')
    try {
      const response = await apiFetch('PATCH', JSON.stringify({
        action: 'profile_decision',
        sessionId,
        approvedItemIds,
      }), 'application/json')
      if (!response.ok) throw new Error('profile_decision_failed')
      setProfileDecision(approvedItemIds.length ? 'shared' : 'declined')
    } catch {
      setProfileDecision('error')
    }
  }

  const toggleProfileItem = (id: string) => {
    setSelectedProfileItems((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleMute = () => {
    const next = !muted
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next })
    setMuted(next)
    setMessage(next ? 'Micrófono pausado.' : 'Te escucho.')
  }

  const close = () => {
    if (active) return
    closeMedia()
    onClose()
  }

  return (
    <Modal
      onClose={close}
      size="xl"
      closeOnEscape={!active}
      closeOnOverlay={!active}
      ariaLabel="Coach de voz privado"
      className="min-h-[min(720px,calc(100dvh-1rem))]"
    >
      <div className="relative flex min-h-[min(720px,calc(100dvh-1rem))] flex-col bg-[oklch(11%_.018_165)]">
        <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 sm:px-6">
          <Dialog.Title className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <Sparkles className="h-4 w-4 text-[var(--mint)]" />
            Lumo Coach
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Conversación de voz para reflexionar sobre el trabajo y crear acciones concretas.
          </Dialog.Description>
          <button type="button" onClick={close} disabled={active} className="rounded-lg p-2 text-[var(--ink-mute)] disabled:opacity-25" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </header>

        {!accepted ? (
          <div className="m-auto max-w-lg px-6 py-10 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[oklch(78%_.14_158_/_0.25)] bg-[oklch(22%_.08_158_/_0.55)]">
              <Lock className="h-6 w-6 text-[var(--mint)]" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">Antes de hablar</h2>
            <div className="mt-5 space-y-3 text-left text-sm leading-relaxed text-[var(--ink-mute)]">
              <p><strong className="text-[var(--ink)]">No guardamos el audio ni la conversación completa.</strong> El texto temporal se elimina al crear los resúmenes.</p>
              <p>Tu reflexión y tu resumen personal son privados.</p>
              <p><strong className="text-[var(--amber)]">Al finalizar se enviará a administración un resumen operativo</strong> limitado a mejoras, necesidades y acciones de trabajo, sin intimidades ni citas textuales.</p>
            </div>
            <button
              type="button"
              onClick={acceptAndPrepare}
              disabled={preparingMic}
              className="mt-7 w-full rounded-xl bg-[var(--mint)] px-4 py-3 text-sm font-semibold text-[oklch(15%_.03_158)] disabled:opacity-50"
            >
              {preparingMic ? 'Preparando micrófono…' : 'He leído y quiero continuar'}
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col px-4 py-5 sm:px-8">
            <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center text-center">
              <div
                className={`h-28 w-28 rounded-full transition-all duration-500 sm:h-36 sm:w-36 ${state === 'speaking' ? 'scale-110' : state === 'listening' ? 'scale-100' : 'scale-95'}`}
                style={{
                  background: 'radial-gradient(circle at 35% 28%,oklch(91% .10 158),oklch(73% .16 158) 48%,oklch(50% .15 175))',
                  boxShadow: state === 'speaking'
                    ? '0 0 72px oklch(75% .16 158 / .45)'
                    : '0 0 42px oklch(75% .16 158 / .25)',
                }}
              />
              <p className="mt-8 text-base text-[var(--ink-mute)]">{message}</p>
              {budgetClosed && (
                <p className="mt-2 text-xs text-[var(--amber)]">Sesión cerrada automáticamente para proteger el límite de coste.</p>
              )}
              {controlClosedReason && (
                <p className="mt-2 text-xs text-[var(--amber)]">
                  {controlClosedReason === 'coach_disabled'
                    ? 'Sesión cerrada porque administración ha pausado el coach.'
                    : 'Sesión cerrada porque se ha alcanzado el presupuesto mensual.'}
                </p>
              )}

              {state === 'idle' || state === 'error' ? (
                <div className="mt-7 w-full max-w-sm space-y-3">
                  <label className="block text-left text-xs font-medium text-[var(--ink-mute)]">
                    Micrófono
                    <select
                      value={selectedDeviceId}
                      onChange={(event) => setSelectedDeviceId(event.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[oklch(16%_.02_165)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--mint)]"
                    >
                      {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={() => void refreshDevices()} className="flex w-full items-center justify-center gap-2 text-xs text-[var(--ink-mute)]">
                    <RefreshCw className="h-3.5 w-3.5" /> Actualizar micrófonos
                  </button>
                  <button type="button" onClick={startConversation} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--mint)] px-4 py-3 text-sm font-semibold text-[oklch(15%_.03_158)]">
                    <Mic className="h-5 w-5" /> Empezar conversación
                  </button>
                  <p className="text-[11px] text-[var(--ink-mute)]">Máximo 10 minutos · 1 sesión cada 24 h · 3 por semana · coste protegido por debajo de {PEOPLE_COST_LIMIT_USD.toFixed(2).replace('.', ',')} US$</p>
                </div>
              ) : null}

              {(state === 'listening' || state === 'speaking') && (
                <div className="mt-8 flex items-center gap-3">
                  <button type="button" onClick={toggleMute} className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--line)] text-[var(--ink)]" aria-label={muted ? 'Activar micrófono' : 'Pausar micrófono'}>
                    {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </button>
                  <button type="button" onClick={() => void endConversation()} className="flex items-center gap-2 rounded-full bg-[var(--coral)] px-5 py-3 text-sm font-semibold text-white">
                    <Square className="h-4 w-4 fill-current" /> Finalizar
                  </button>
                </div>
              )}

              {state === 'processing' && <div className="mt-7 h-5 w-5 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--mint)]" />}

              {state === 'ended' && summary && (
                <div className="mt-7 w-full space-y-3 text-left">
                  <section className="rounded-2xl border border-[var(--line)] bg-[oklch(16%_.02_165_/_0.75)] p-4">
                    <p className="label-caps text-[var(--mint)]">Tu resumen privado</p>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--ink)]">
                      {summary.points.map((point) => <li key={point}>{point}</li>)}
                    </ul>
                    {summary.objective && <p className="mt-3 text-sm"><strong className="text-[var(--mint)]">Objetivo: </strong>{summary.objective}</p>}
                    {summary.firstStep && <p className="mt-2 text-sm"><strong className="text-[var(--mint)]">Primer paso: </strong>{summary.firstStep}</p>}
                  </section>
                  <section className="rounded-2xl border border-[var(--amber)]/30 bg-[oklch(18%_.035_75_/_0.45)] p-4">
                    <p className="label-caps text-[var(--amber)]">Enviado a administración</p>
                    {operationalSummary && (operationalSummary.points.length > 0 || operationalSummary.requestedSupport) ? (
                      <>
                        {operationalSummary.points.length > 0 && (
                          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--ink)]">
                            {operationalSummary.points.map((point) => <li key={point}>{point}</li>)}
                          </ul>
                        )}
                        {operationalSummary.requestedSupport && (
                          <p className="mt-3 text-sm"><strong className="text-[var(--amber)]">Apoyo solicitado: </strong>{operationalSummary.requestedSupport}</p>
                        )}
                      </>
                    ) : (
                      <p className="mt-3 text-sm text-[var(--ink-mute)]">No había información operativa segura que compartir.</p>
                    )}
                  </section>
                  {profileCandidates.length > 0 && (
                    <section className="rounded-2xl border border-[oklch(76%_.12_235_/_0.30)] bg-[oklch(17%_.035_235_/_0.35)] p-4">
                      <p className="label-caps text-[oklch(76%_.12_235)]">Tu perfil de colaboración</p>
                      <p className="mt-2 text-xs leading-relaxed text-[var(--ink-mute)]">
                        Estas ideas siguen siendo privadas. Marca solo las que te representen si quieres que RRHH las vea para colaborar mejor contigo.
                      </p>
                      <div className="mt-3 space-y-2">
                        {profileCandidates.map((candidate) => (
                          <label key={candidate.id} className="flex cursor-pointer gap-3 rounded-xl border border-[var(--line)] bg-[oklch(14%_.02_165_/_0.60)] p-3">
                            <input
                              type="checkbox"
                              checked={selectedProfileItems.has(candidate.id)}
                              disabled={profileDecision !== 'pending' && profileDecision !== 'error'}
                              onChange={() => toggleProfileItem(candidate.id)}
                              className="mt-0.5 h-4 w-4 accent-[var(--mint)]"
                            />
                            <span className="min-w-0">
                              <span className="block text-[10px] font-semibold uppercase tracking-wide text-[oklch(76%_.12_235)]">{PROFILE_CATEGORY_LABELS[candidate.category]}</span>
                              <span className="mt-1 block text-sm leading-relaxed text-[var(--ink)]">{candidate.statement}</span>
                              {candidate.managerGuidance && <span className="mt-1 block text-xs text-[var(--ink-mute)]">Cómo puede ayudar la empresa: {candidate.managerGuidance}</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                      {(profileDecision === 'pending' || profileDecision === 'error') && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            disabled={selectedProfileItems.size === 0}
                            onClick={() => void saveProfileDecision([...selectedProfileItems])}
                            className="rounded-xl bg-[var(--mint)] px-3 py-2.5 text-xs font-semibold text-[oklch(15%_.03_158)] disabled:opacity-40"
                          >
                            Compartir seleccionados con RRHH
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveProfileDecision([])}
                            className="rounded-xl border border-[var(--line)] px-3 py-2.5 text-xs font-semibold text-[var(--ink-mute)]"
                          >
                            No compartir ninguno
                          </button>
                        </div>
                      )}
                      {profileDecision === 'saving' && <p className="mt-3 text-xs text-[var(--ink-mute)]">Guardando tu decisión…</p>}
                      {profileDecision === 'shared' && <p className="mt-3 text-xs font-medium text-[var(--mint)]">Solo los elementos marcados se han añadido a tu perfil RRHH.</p>}
                      {profileDecision === 'declined' && <p className="mt-3 text-xs text-[var(--ink-mute)]">No se ha añadido nada a tu perfil RRHH.</p>}
                      {profileDecision === 'error' && <p className="mt-3 text-xs text-[var(--coral)]">No se pudo guardar la decisión. Puedes intentarlo de nuevo.</p>}
                    </section>
                  )}
                  {usage && <UsageCard usage={usage} />}
                  <p className="text-center text-[11px] text-[var(--ink-mute)]">Administración solo recibe el bloque operativo mostrado aquí.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function UsageCard({ usage }: { usage: SessionUsage }) {
  const tokens = usage.realtimeTokens.inputTokens + usage.realtimeTokens.outputTokens + usage.summaryTokens.inputTokens + usage.summaryTokens.outputTokens
  return (
    <section className="grid grid-cols-3 gap-2 rounded-2xl border border-[oklch(78%_.14_158_/_0.22)] bg-[oklch(18%_.04_158_/_0.55)] p-3 text-center">
      <div><p className="text-[10px] text-[var(--ink-mute)]">Coste estimado</p><p className="mt-1 text-sm font-semibold text-[var(--mint)]">{usage.estimatedCostUsd.toFixed(4).replace('.', ',')} US$</p></div>
      <div><p className="text-[10px] text-[var(--ink-mute)]">Tokens</p><p className="mt-1 text-sm font-semibold text-[var(--ink)]">{tokens.toLocaleString('es-ES')}</p></div>
      <div><p className="text-[10px] text-[var(--ink-mute)]">Duración</p><p className="mt-1 text-sm font-semibold text-[var(--ink)]">{formatDuration(usage.durationSeconds)}</p></div>
    </section>
  )
}

export function PeopleSharedSummariesCard() {
  const [rows, setRows] = useState<Array<{ id: string; acceptedAt: string; name: string; points: string[]; requestedSupport: string | null }>>([])
  const [control, setControl] = useState<CoachAdminControl | null>(null)
  const [budgetDraft, setBudgetDraft] = useState('20')
  const [savingControl, setSavingControl] = useState(false)
  const [controlError, setControlError] = useState<string | null>(null)

  const loadControl = useCallback(async (syncBudgetDraft = true) => {
    const { data, error } = await supabase.rpc('people_coach_admin_status')
    if (error) {
      setControlError('No se pudo cargar el control del coach.')
      return
    }
    const next = readAdminControl(data)
    if (!next) return
    setControl(next)
    if (syncBudgetDraft) setBudgetDraft(next.monthlyBudgetUsd.toFixed(2))
    setControlError(null)
  }, [])

  const loadRows = useCallback(async () => {
    const { data } = await supabase
      .from('people_coach_shares')
      .select('id, accepted_at, shared_summary, empleados(nombre)')
      .is('revoked_at', null)
      .order('accepted_at', { ascending: false })
      .limit(6)
    const parsed = (data ?? []).map((row) => {
      const employee = Array.isArray(row.empleados) ? row.empleados[0] : row.empleados
      const shared = record(row.shared_summary)
      return {
        id: row.id,
        acceptedAt: row.accepted_at,
        name: employee?.nombre ?? 'Trabajador',
        points: Array.isArray(shared.points) ? shared.points.filter((point): point is string => typeof point === 'string') : [],
        requestedSupport: typeof shared.requestedSupport === 'string' ? shared.requestedSupport : null,
      }
    })
    setRows(parsed)
  }, [])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void loadControl(true)
      void loadRows()
    }, 0)
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void loadControl(false)
      void loadRows()
    }, 15_000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(refreshTimer)
    }
  }, [loadControl, loadRows])

  const saveControl = async (enabled: boolean, monthlyBudgetUsd: number) => {
    if (!Number.isFinite(monthlyBudgetUsd) || monthlyBudgetUsd < 1 || monthlyBudgetUsd > 500) {
      setControlError('El presupuesto debe estar entre 1 y 500 US$.')
      return
    }
    setSavingControl(true)
    setControlError(null)
    const { data, error } = await supabase.rpc('people_coach_admin_update', {
      p_enabled: enabled,
      p_monthly_budget_usd: monthlyBudgetUsd,
    })
    setSavingControl(false)
    if (error) {
      setControlError('No se pudo guardar el control del coach.')
      return
    }
    const next = readAdminControl(data)
    if (!next) return
    setControl(next)
    setBudgetDraft(next.monthlyBudgetUsd.toFixed(2))
  }

  const committedPct = control
    ? Math.min(100, (control.totalCommittedUsd / Math.max(control.monthlyBudgetUsd, 0.01)) * 100)
    : 0

  return (
    <section className="ao-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--mint)]" />
          <h2 className="text-sm font-semibold text-[var(--ink)]">Coach · control y resúmenes</h2>
        </div>
        {control && (
          <button
            type="button"
            aria-pressed={control.enabled}
            disabled={savingControl}
            onClick={() => void saveControl(!control.enabled, control.monthlyBudgetUsd)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
              control.enabled
                ? 'border-[var(--coral)]/35 text-[var(--coral)] hover:bg-[var(--coral)]/10'
                : 'border-[var(--mint)]/35 text-[var(--mint)] hover:bg-[var(--mint)]/10'
            }`}
          >
            <Power className="h-3.5 w-3.5" />
            {control.enabled ? 'Pausar coach' : 'Activar coach'}
          </button>
        )}
      </div>

      {control && (
        <div className="mt-3 rounded-xl border border-[var(--line)] bg-[oklch(16%_.02_165_/_0.55)] p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-[var(--ink-mute)]">Consumo mensual comprometido</span>
                <strong className="tabular-nums text-[var(--ink)]">
                  {control.totalCommittedUsd.toFixed(2).replace('.', ',')} / {control.monthlyBudgetUsd.toFixed(2).replace('.', ',')} US$
                </strong>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--line)]">
                <div
                  className={`h-full rounded-full ${committedPct >= 90 ? 'bg-[var(--coral)]' : committedPct >= 70 ? 'bg-[var(--amber)]' : 'bg-[var(--mint)]'}`}
                  style={{ width: `${committedPct}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-[var(--ink-mute)]">
                Gastado: {control.spentUsd.toFixed(2).replace('.', ',')} US$ · reservado en sesiones abiertas: {control.reservedUsd.toFixed(2).replace('.', ',')} US$
              </p>
              <p className="mt-1 text-[10px] text-[var(--ink-mute)]">Actualización automática cada 15 segundos.</p>
            </div>
            <div className="flex items-end gap-2">
              <label className="text-[10px] font-medium text-[var(--ink-mute)]">
                Presupuesto US$/mes
                <input
                  type="number"
                  min="1"
                  max="500"
                  step="1"
                  value={budgetDraft}
                  onChange={(event) => setBudgetDraft(event.target.value)}
                  className="mt-1 block w-28 rounded-lg border border-[var(--line)] bg-[oklch(13%_.018_165)] px-2.5 py-2 text-right text-xs tabular-nums text-[var(--ink)] outline-none focus:border-[var(--mint)]"
                />
              </label>
              <button
                type="button"
                disabled={savingControl}
                onClick={() => void saveControl(control.enabled, Number(budgetDraft))}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-[var(--mint)] px-3 text-xs font-semibold text-[oklch(15%_.03_158)] disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" /> Guardar
              </button>
            </div>
          </div>
          <p className={`mt-2 text-[10px] font-medium ${control.enabled ? 'text-[var(--mint)]' : 'text-[var(--coral)]'}`}>
            {control.enabled
              ? 'Activo · el backend bloqueará nuevas sesiones antes de superar el presupuesto.'
              : 'Pausado · no se pueden abrir sesiones y las activas se cerrarán automáticamente.'}
          </p>
        </div>
      )}
      {controlError && <p className="mt-2 text-xs text-[var(--coral)]">{controlError}</p>}

      <p className="label-caps mt-4">Últimos resúmenes operativos</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--ink-mute)]">Aún no hay resúmenes operativos.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {rows.map((row) => (
            <article key={row.id} className="rounded-xl border border-[var(--line)] bg-[oklch(16%_.02_165_/_0.55)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--ink)]">{row.name}</p>
                <time className="text-[10px] text-[var(--ink-mute)]">{new Date(row.acceptedAt).toLocaleDateString('es-ES')}</time>
              </div>
              {row.points.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-[var(--ink-mute)]">{row.points.map((point) => <li key={point}>{point}</li>)}</ul>}
              {row.requestedSupport && <p className="mt-2 text-xs"><strong className="text-[var(--amber)]">Apoyo solicitado: </strong>{row.requestedSupport}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function readSummary(value: unknown): PrivateSummary | null {
  const row = record(value)
  const points = Array.isArray(row.points) ? row.points.filter((point): point is string => typeof point === 'string') : []
  if (!points.length && typeof row.objective !== 'string' && typeof row.firstStep !== 'string') return null
  return {
    points,
    objective: typeof row.objective === 'string' ? row.objective : null,
    firstStep: typeof row.firstStep === 'string' ? row.firstStep : null,
  }
}

function readOperationalSummary(value: unknown): OperationalSummary | null {
  const row = record(value)
  const points = Array.isArray(row.points) ? row.points.filter((point): point is string => typeof point === 'string') : []
  const requestedSupport = typeof row.requestedSupport === 'string' ? row.requestedSupport : null
  return points.length || requestedSupport ? { points, requestedSupport } : null
}

function readProfileCandidates(value: unknown): ProfileCandidate[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const row = record(item)
    const category = typeof row.category === 'string' ? row.category as ProfileCategory : null
    if (
      typeof row.id !== 'string'
      || !category
      || !(category in PROFILE_CATEGORY_LABELS)
      || typeof row.statement !== 'string'
    ) return []
    return [{
      id: row.id,
      category,
      statement: row.statement,
      managerGuidance: typeof row.managerGuidance === 'string' ? row.managerGuidance : null,
    }]
  }).slice(0, 5)
}

function readAdminControl(value: unknown): CoachAdminControl | null {
  const first = Array.isArray(value) ? value[0] : value
  const row = record(first)
  if (typeof row.enabled !== 'boolean') return null
  return {
    enabled: row.enabled,
    monthlyBudgetUsd: numeric(row.monthly_budget_usd),
    spentUsd: numeric(row.spent_usd),
    reservedUsd: numeric(row.reserved_usd),
    totalCommittedUsd: numeric(row.total_committed_usd),
  }
}

function readUsage(value: unknown): SessionUsage | null {
  const row = record(value)
  const realtimeTokens = record(row.realtimeTokens)
  const summaryTokens = record(row.summaryTokens)
  if (typeof row.estimatedCostUsd !== 'number') return null
  return {
    durationSeconds: number(row.durationSeconds),
    estimatedCostUsd: number(row.estimatedCostUsd),
    realtimeCostUsd: number(row.realtimeCostUsd),
    summaryCostUsd: number(row.summaryCostUsd),
    transcriptionCostUsd: number(row.transcriptionCostUsd),
    realtimeTokens: {
      inputTokens: number(realtimeTokens.inputTokens),
      outputTokens: number(realtimeTokens.outputTokens),
      inputTextTokens: number(realtimeTokens.inputTextTokens),
      inputAudioTokens: number(realtimeTokens.inputAudioTokens),
      cachedInputTextTokens: number(realtimeTokens.cachedInputTextTokens),
      cachedInputAudioTokens: number(realtimeTokens.cachedInputAudioTokens),
      outputTextTokens: number(realtimeTokens.outputTextTokens),
      outputAudioTokens: number(realtimeTokens.outputAudioTokens),
    },
    summaryTokens: { inputTokens: number(summaryTokens.inputTokens), outputTokens: number(summaryTokens.outputTokens) },
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function numeric(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}
