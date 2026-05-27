import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Mic, MicOff, RotateCcw, Send, Undo2, UserPlus } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { cn, getBusinessDate } from '@/shared/lib/utils'
import { parsearPedido } from '../lib/parser'
import {
  useCrearPedido,
  useEliminarPedido,
  useTodosLosClientesPedidos,
  useUltimoPedidoCliente,
} from '../lib/queries'
import type { ClientePedido, UNIDAD_LABEL as UnidadLabel } from '../lib/types'
import { UNIDAD_LABEL } from '../lib/types'
import { ClienteModal } from './ClienteModal'

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function splitClienteYProductos(texto: string): { cliente: string; productos: string } {
  const trimmed = texto.trim()
  const idx = trimmed.indexOf(':')
  if (idx > 0) {
    return { cliente: trimmed.slice(0, idx).trim(), productos: trimmed.slice(idx + 1).trim() }
  }
  // Sin ":" — primera línea como cliente, resto como productos
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return { cliente: '', productos: '' }
  return { cliente: lines[0], productos: lines.slice(1).join('\n') }
}

type Match = { cliente: ClientePedido; score: number; tipo: 'exacto' | 'startsWith' | 'contains' }

function matchClientes(query: string, clientes: ClientePedido[]): Match[] {
  const q = normalizar(query)
  if (q.length < 2) return []
  const matches: Match[] = []
  for (const c of clientes) {
    const n = normalizar(c.nombre_normalizado || c.nombre)
    if (n === q) matches.push({ cliente: c, score: 100, tipo: 'exacto' })
    else if (n.startsWith(q)) matches.push({ cliente: c, score: 80 - (n.length - q.length), tipo: 'startsWith' })
    else if (n.includes(q)) matches.push({ cliente: c, score: 50 - (n.length - q.length), tipo: 'contains' })
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, 5)
}

function pedidoToText(cliente: string, lineas: { cantidad: number; unidad: string; producto: string }[]): string {
  const parts = lineas.map(l => {
    const u = (UNIDAD_LABEL as typeof UnidadLabel)[l.unidad as keyof typeof UnidadLabel] ?? l.unidad
    return `${l.cantidad} ${u} ${l.producto}`.trim()
  })
  return `${cliente}: ${parts.join(' / ')}`
}

// ── Web Speech API wrapper ───────────────────────────────────────────────────

type SpeechHook = {
  available: boolean
  listening: boolean
  start: () => void
  stop: () => void
}

type SpeechRecognitionResultListLike = {
  length: number
  [index: number]: { isFinal: boolean; 0: { transcript: string } }
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: SpeechRecognitionResultListLike
}

type SpeechRecognitionErrorEventLike = {
  error: string
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

function useSpeech(onFinal: (text: string) => void): SpeechHook {
  const [listening, setListening] = useState(false)
  const ref = useRef<SpeechRecognitionLike | null>(null)
  const SpeechRecognition =
    typeof window !== 'undefined' &&
    (((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition) ?? null)

  const available = !!SpeechRecognition

  const start = () => {
    if (!available) {
      toast({ title: 'Dictado no disponible', description: 'Tu navegador no soporta voz. Prueba en Safari iOS o Chrome.', variant: 'error' })
      return
    }
    try {
      const r = new SpeechRecognition()
      r.lang = 'es-ES'
      r.continuous = true
      r.interimResults = false
      r.onresult = (e) => {
        let text = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) text += e.results[i][0].transcript
        }
        if (text) onFinal(text.trim())
      }
      r.onerror = (e) => {
        setListening(false)
        if (e.error !== 'aborted') {
          toast({ title: 'Error dictado', description: e.error, variant: 'error' })
        }
      }
      r.onend = () => setListening(false)
      r.start()
      ref.current = r
      setListening(true)
    } catch (err: unknown) {
      toast({ title: 'No pude iniciar dictado', description: errorMessage(err), variant: 'error' })
    }
  }

  const stop = () => {
    try { ref.current?.stop() } catch {
      // El navegador puede lanzar si el dictado ya terminó.
    }
    setListening(false)
  }

  useEffect(() => () => { try { ref.current?.stop() } catch {
    // Limpieza defensiva al desmontar.
  } }, [])

  return { available, listening, start, stop }
}

// ── Componente principal ────────────────────────────────────────────────────

type Guardado = { id: string; cliente: string; lineas: number; fecha: string; ts: number }

export function CapturaRapida() {
  const [texto, setTexto] = useState('')
  const [guardados, setGuardados] = useState<Guardado[]>([])
  const [showClienteNew, setShowClienteNew] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { data: clientes = [] } = useTodosLosClientesPedidos()
  const crear = useCrearPedido()
  const eliminar = useEliminarPedido()

  // Detección cliente en vivo
  const { cliente: rawCliente, productos: rawProductos } = useMemo(
    () => splitClienteYProductos(texto),
    [texto],
  )
  const matches = useMemo(
    () => matchClientes(rawCliente, clientes.filter(c => c.activo)),
    [rawCliente, clientes],
  )
  const exacto = matches.find(m => m.tipo === 'exacto') ?? matches[0]
  const clienteMatch = exacto?.cliente ?? null

  // Última pedido del cliente identificado
  const { data: ultimo } = useUltimoPedidoCliente(clienteMatch?.id ?? null)

  // Voz
  const speech = useSpeech((dictado) => {
    setTexto(t => (t ? `${t} ${dictado}` : dictado))
  })

  const cargarUltimo = () => {
    if (!ultimo || !clienteMatch || !ultimo.lineas?.length) return
    const t = pedidoToText(
      clienteMatch.nombre,
      ultimo.lineas.map(l => ({
        cantidad: l.cantidad,
        unidad: l.unidad,
        producto: l.producto_normalizado,
      })),
    )
    setTexto(t)
    inputRef.current?.focus()
  }

  const limpiar = () => {
    setTexto('')
    inputRef.current?.focus()
  }

  const guardar = useCallback(async () => {
    if (!texto.trim()) return
    if (!clienteMatch) {
      toast({
        title: 'Cliente no identificado',
        description: rawCliente ? `Crea "${rawCliente}" o usa una sugerencia` : 'Empieza con el nombre del cliente',
        variant: 'error',
      })
      return
    }
    try {
      const parsed = await parsearPedido(rawProductos || texto, clienteMatch.nombre)
      const lineas = parsed.lineas
      const fecha = format(getBusinessDate(), 'yyyy-MM-dd')
      const r = await crear.mutateAsync({
        cliente_id: clienteMatch.id,
        fecha,
        texto_original: texto,
        notas_admin: parsed.notasAdmin,
        faltas: null,
        lineas,
      })
      setGuardados(g => [
        { id: r.pedido_id, cliente: clienteMatch.nombre, lineas: lineas.length, fecha, ts: Date.now() },
        ...g,
      ].slice(0, 20))
      toast({ title: `${clienteMatch.nombre} · ${lineas.length} líneas`, variant: 'success' })
      setTexto('')
      inputRef.current?.focus()
    } catch (e: unknown) {
      toast({ title: 'Error al guardar', description: errorMessage(e), variant: 'error' })
    }
  }, [clienteMatch, crear, rawCliente, rawProductos, texto])

  // Atajos
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        void guardar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [guardar])

  const deshacer = async (g: Guardado) => {
    try {
      await eliminar.mutateAsync({ id: g.id, fecha: g.fecha })
      setGuardados(arr => arr.filter(x => x.id !== g.id))
      toast({ title: 'Pedido deshecho', variant: 'success' })
    } catch (e: unknown) {
      toast({ title: 'Error al deshacer', description: errorMessage(e), variant: 'error' })
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]">
      <section className="ao-card">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium tracking-[-0.01em] text-[var(--ink)]">Captura rápida</h2>
              <span className="ao-chip ao-chip-mint">⌘ Enter</span>
            </div>
            <p className="mt-1 text-[12px] text-[var(--ink-mute)]">
              Formato: <code className="rounded bg-[rgba(255,255,255,.04)] px-1 text-[var(--ink-dim)]">cliente: prod1 / prod2 / prod3</code>
            </p>
          </div>
          <div className="mono text-right text-[10px] uppercase tracking-[0.14em] text-[var(--ink-mute)]">
            {guardados.length} esta sesión
          </div>
        </header>

        <div className={cn(
          'relative rounded-[var(--radius-lg)] border p-4 transition-colors',
          speech.listening
            ? 'border-[var(--coral)] bg-[oklch(30%_.12_25_/_0.14)] shadow-[0_0_0_4px_oklch(70%_.18_25_/_0.14)]'
            : clienteMatch
              ? 'border-[var(--mint)] bg-[oklch(20%_.04_158_/_0.25)] shadow-[0_0_0_4px_var(--mint-glow),inset_0_0_30px_oklch(40%_.12_158_/_0.12)]'
              : 'border-[var(--line)] bg-[rgba(255,255,255,.02)]',
        )}>
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            disabled={!speech.available}
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-30',
              speech.listening
                ? 'animate-pulse bg-[var(--coral)] text-[#160b09]'
                : 'bg-[var(--mint)] text-[#0a1310] hover:bg-[var(--mint-2)]',
            )}
            title={speech.listening ? 'Detener dictado' : 'Iniciar dictado'}
            aria-label="Dictar"
          >
            {speech.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>

          <textarea
            ref={inputRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Bar Hollywood: lechuga 2 / tom 5 kg / pim 1 caja"
            rows={3}
            autoFocus
            className="min-h-[132px] flex-1 resize-none rounded-[var(--radius)] border border-transparent bg-transparent px-2 py-1 text-base leading-relaxed text-[var(--ink)] outline-none placeholder:text-[var(--ink-mute)] focus:border-transparent"
          />
        </div>

        {/* Estado cliente */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {clienteMatch ? (
            <span className="ao-chip ao-chip-mint">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {clienteMatch.nombre}
              <span className="font-normal text-[var(--ink-mute)]">
                · {clienteMatch.repartidor}{clienteMatch.horario ? ` · ${clienteMatch.horario}` : ''}
              </span>
            </span>
          ) : rawCliente.length >= 2 ? (
            <>
              <span className="text-[var(--ink-mute)]">Sin match para "<span className="font-semibold text-[var(--ink-dim)]">{rawCliente}</span>"</span>
              <button
                type="button"
                onClick={() => setShowClienteNew(rawCliente)}
                className="ao-chip ao-chip-mint"
              >
                <UserPlus className="h-3 w-3" />
                Crear "{rawCliente}"
              </button>
            </>
          ) : (
            <span className="text-[var(--ink-mute)]">Empieza con el nombre del cliente</span>
          )}

          {/* Sugerencias secundarias */}
          {matches.slice(clienteMatch ? 1 : 0, 4).map(m => (
            <button
              key={m.cliente.id}
              type="button"
              onClick={() => {
                const nuevo = `${m.cliente.nombre}${rawProductos ? `: ${rawProductos}` : ': '}`
                setTexto(nuevo)
                inputRef.current?.focus()
              }}
              className="ao-chip text-[var(--ink-dim)] hover:text-[var(--mint)]"
            >
              {m.cliente.nombre}
            </button>
          ))}
        </div>

        {/* Acciones */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {clienteMatch && ultimo?.lineas?.length ? (
            <Button size="sm" variant="outline" onClick={cargarUltimo}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Mismo que el último ({ultimo.lineas.length} líneas)
            </Button>
          ) : null}
          {texto && (
            <Button size="sm" variant="ghost" onClick={limpiar}>Limpiar</Button>
          )}
          <Button
            size="sm"
            onClick={guardar}
            disabled={!texto.trim() || !clienteMatch || crear.isPending}
            className="ml-auto"
          >
            <Send className="mr-1 h-3.5 w-3.5" />
            Guardar
          </Button>
        </div>
        </div>
      </section>

      <aside className="ao-card">
        <header className="mb-4">
          <h3 className="text-base font-medium text-[var(--ink)]">Detección en vivo</h3>
          <p className="mono mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--ink-mute)]">
            {speech.available ? 'voz disponible' : 'voz no disponible'} · parser local
          </p>
        </header>

        <div className="space-y-3">
          <div className="ao-panel p-3">
            <div className="label-caps mb-2">Cliente</div>
            {clienteMatch ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium uppercase text-[var(--ink)]">{clienteMatch.nombre}</div>
                  <div className="mono mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">
                    {clienteMatch.repartidor}{clienteMatch.horario ? ` · ${clienteMatch.horario}` : ''}
                  </div>
                </div>
                <span className="ao-chip ao-chip-mint">match</span>
              </div>
            ) : (
              <div className="text-sm text-[var(--ink-mute)]">{rawCliente.length >= 2 ? `Sin match para ${rawCliente}` : 'Esperando cliente'}</div>
            )}
          </div>

          <div className="ao-panel p-3">
            <div className="label-caps mb-2">Lineas detectadas</div>
            {rawProductos.trim() ? (
              <div className="space-y-2">
                {rawProductos.split('/').map((linea) => linea.trim()).filter(Boolean).slice(0, 6).map((linea, i) => (
                  <div key={`${linea}-${i}`} className="rounded-[var(--radius)] border border-[var(--line)] bg-[rgba(255,255,255,.018)] px-3 py-2">
                    <div className="mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">linea {i + 1}</div>
                    <div className="mt-1 text-sm text-[var(--ink)]">{linea}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-[var(--ink-mute)]">Escribe productos separados por / o por lineas.</div>
            )}
          </div>
        </div>
      </aside>

      {/* Lista sesión */}
      {guardados.length > 0 && (
        <div className="ao-card p-0 xl:col-span-2">
          <div className="border-b border-[var(--line)] px-3 py-2 label-caps">
            Guardados esta sesión
          </div>
          <ul className="max-h-60 divide-y divide-[var(--line)] overflow-y-auto">
            {guardados.map(g => (
              <li key={g.id} className="group flex items-center gap-2 px-3 py-1.5 text-sm">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--mint)]" />
                <span className="flex-1 truncate text-[var(--ink)]">{g.cliente}</span>
                <span className="mono text-[10px] text-[var(--ink-mute)]">
                  {g.lineas} líneas · {format(new Date(g.ts), 'HH:mm')}
                </span>
                <button
                  type="button"
                  onClick={() => deshacer(g)}
                  className="rounded-sm p-0.5 text-[var(--ink-mute)] opacity-0 hover:bg-[rgba(255,255,255,.04)] hover:text-[var(--coral)] group-hover:opacity-100"
                  title="Deshacer"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Modal cliente nuevo */}
      {showClienteNew && (
        <ClienteModal
          cliente={null}
          nombreInicial={showClienteNew}
          onClose={() => setShowClienteNew(null)}
          onSaved={(c) => {
            // Sustituye el nombre raw por el oficial creado
            const { productos } = splitClienteYProductos(texto)
            setTexto(`${c.nombre}${productos ? `: ${productos}` : ': '}`)
            inputRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}
