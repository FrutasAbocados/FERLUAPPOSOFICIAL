import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Mic, MicOff, RotateCcw, Send, Undo2, UserPlus } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/lib/toast'
import { cn } from '@/shared/lib/utils'
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

function useSpeech(onFinal: (text: string) => void): SpeechHook {
  const [listening, setListening] = useState(false)
  const ref = useRef<any>(null)
  const SpeechRecognition: any =
    typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

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
      r.onresult = (e: any) => {
        let text = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) text += e.results[i][0].transcript
        }
        if (text) onFinal(text.trim())
      }
      r.onerror = (e: any) => {
        setListening(false)
        if (e.error !== 'aborted') {
          toast({ title: 'Error dictado', description: e.error, variant: 'error' })
        }
      }
      r.onend = () => setListening(false)
      r.start()
      ref.current = r
      setListening(true)
    } catch (err: any) {
      toast({ title: 'No pude iniciar dictado', description: err?.message, variant: 'error' })
    }
  }

  const stop = () => {
    try { ref.current?.stop() } catch {}
    setListening(false)
  }

  useEffect(() => () => { try { ref.current?.stop() } catch {} }, [])

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
  }, [texto, clienteMatch])

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

  const guardar = async () => {
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
      const fecha = format(new Date(), 'yyyy-MM-dd')
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
    } catch (e: any) {
      toast({ title: 'Error al guardar', description: e?.message, variant: 'error' })
    }
  }

  const deshacer = async (g: Guardado) => {
    try {
      await eliminar.mutateAsync({ id: g.id, fecha: g.fecha })
      setGuardados(arr => arr.filter(x => x.id !== g.id))
      toast({ title: 'Pedido deshecho', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'Error al deshacer', description: e?.message, variant: 'error' })
    }
  }

  return (
    <div className="space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">Captura rápida</h2>
          <p className="text-[11px] text-[var(--color-ink-3)]">
            Formato: <code className="rounded bg-[var(--color-surface-2)] px-1">cliente: prod1 / prod2 / prod3</code> · ⌘/Ctrl+Enter guarda · {speech.available ? '🎙 disponible' : '🎙 no disponible en este navegador'}
          </p>
        </div>
        <div className="text-xs text-[var(--color-ink-3)] tabular-nums">{guardados.length} esta sesión</div>
      </header>

      {/* Bloque de captura */}
      <div className={cn(
        'rounded-[var(--radius-md)] border-2 bg-[var(--color-surface)] p-3 transition-colors',
        speech.listening
          ? 'border-[#dc2626] ring-4 ring-red-100'
          : clienteMatch
            ? 'border-[var(--color-primary)]'
            : 'border-[var(--color-border)]',
      )}>
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            disabled={!speech.available}
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-colors disabled:opacity-30',
              speech.listening
                ? 'animate-pulse bg-[#dc2626]'
                : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-2)]',
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
            className="flex-1 resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        {/* Estado cliente */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {clienteMatch ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 font-semibold text-[var(--color-primary-2)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {clienteMatch.nombre}
              <span className="font-normal text-[var(--color-ink-3)]">
                · {clienteMatch.repartidor}{clienteMatch.horario ? ` · ${clienteMatch.horario}` : ''}
              </span>
            </span>
          ) : rawCliente.length >= 2 ? (
            <>
              <span className="text-[var(--color-ink-3)]">Sin match para "<span className="font-semibold">{rawCliente}</span>"</span>
              <button
                type="button"
                onClick={() => setShowClienteNew(rawCliente)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-primary)] px-2 py-0.5 font-semibold text-[var(--color-primary-2)] hover:bg-[var(--color-primary-soft)]"
              >
                <UserPlus className="h-3 w-3" />
                Crear "{rawCliente}"
              </button>
            </>
          ) : (
            <span className="text-[var(--color-ink-3)]">Empieza con el nombre del cliente</span>
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
              className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[var(--color-ink-2)] hover:bg-[var(--color-surface-3,#e2e8f0)]"
            >
              {m.cliente.nombre}
            </button>
          ))}
        </div>

        {/* Acciones */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
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

      {/* Lista sesión */}
      {guardados.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
            Guardados esta sesión
          </div>
          <ul className="max-h-60 divide-y divide-[var(--color-border)] overflow-y-auto">
            {guardados.map(g => (
              <li key={g.id} className="group flex items-center gap-2 px-3 py-1.5 text-sm">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#10b981]" />
                <span className="flex-1 truncate text-[var(--color-ink)]">{g.cliente}</span>
                <span className="text-[10px] text-[var(--color-ink-3)] tabular-nums">
                  {g.lineas} líneas · {format(new Date(g.ts), 'HH:mm')}
                </span>
                <button
                  type="button"
                  onClick={() => deshacer(g)}
                  className="rounded-sm p-0.5 text-[var(--color-ink-3)] opacity-0 hover:bg-[var(--color-surface-2)] hover:text-[#dc2626] group-hover:opacity-100"
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
