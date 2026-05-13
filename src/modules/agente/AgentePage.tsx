import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, Send, Sparkles, User, Wrench } from 'lucide-react'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { Button } from '@/shared/components/ui/button'
import { useAgentChat, type AgentMessage, type AgentToolCall } from './lib/queries'

interface ChatTurn extends AgentMessage {
  toolCalls?: AgentToolCall[]
}

const SUGERENCIAS = [
  '¿Cómo va el mes?',
  'Top 5 clientes este mes por margen',
  '¿Qué clientes han parado de pedir?',
  'Análisis de Casa Roberto últimos 30 días',
  'Recomendaciones para mejorar margen',
  '¿Qué productos están bajando?',
]

export function AgentePage() {
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const chat = useAgentChat()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, chat.isPending])

  const enviar = async (texto: string) => {
    const trimmed = texto.trim()
    if (!trimmed || chat.isPending) return
    const newUser: ChatTurn = { role: 'user', content: trimmed }
    const nextTurns = [...turns, newUser]
    setTurns(nextTurns)
    setInput('')
    try {
      const reply = await chat.mutateAsync(nextTurns.map(t => ({ role: t.role, content: t.content })))
      setTurns([...nextTurns, { role: 'assistant', content: reply.reply, toolCalls: reply.toolCalls }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setTurns([...nextTurns, { role: 'assistant', content: `❌ ${msg}` }])
    }
  }

  return (
    <div className="flex h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] flex-col md:h-dvh">
      <PageTopbar
        breadcrumb="IA · AGENTE"
        title="Agente IA"
        subtitle="Asistente experto en tus datos del Manager."
      />
      <div className="ao-page flex max-w-5xl flex-1 flex-col overflow-hidden py-4 md:py-5">

      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
        {turns.length === 0 && (
          <div className="ao-card space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
              <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
              Prueba con
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGERENCIAS.map(s => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  className="ao-card-hover rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-sm text-[var(--color-ink-2)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-ink)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <Mensaje key={i} turn={t} />
        ))}

        {chat.isPending && (
          <div className="flex items-start gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary-soft)]">
              <Bot className="h-4 w-4 text-[var(--color-primary-2)]" />
            </div>
            <div className="ao-card rounded-2xl rounded-tl-sm px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary)]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary)]" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-primary)]" style={{ animationDelay: '300ms' }} />
                <span className="ml-2 text-xs text-[var(--color-ink-3)]">pensando…</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="mt-3 border-t border-[var(--color-border)] pt-3">
        <form
          onSubmit={(e) => { e.preventDefault(); enviar(input) }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregunta al agente sobre tus ventas, clientes, productos…"
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
            disabled={chat.isPending}
          />
          <Button type="submit" size="sm" disabled={chat.isPending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
        {turns.length > 0 && (
          <button
            onClick={() => setTurns([])}
            className="mt-2 text-xs text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
          >
            Nueva conversación
          </button>
        )}
      </div>
      </div>
    </div>
  )
}

function Mensaje({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === 'user'
  return (
    <div className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        isUser ? 'bg-[var(--color-ink-3)]/10' : 'bg-[var(--color-primary-soft)]'
      }`}>
        {isUser ? <User className="h-4 w-4 text-[var(--color-ink-2)]" /> : <Bot className="h-4 w-4 text-[var(--color-primary-2)]" />}
      </div>
      <div className={`max-w-[88%] space-y-1 ${isUser ? 'items-end' : ''}`}>
        <div className={`rounded-2xl px-3 py-2 text-sm ${
          isUser
            ? 'rounded-tr-sm bg-[var(--color-primary)] text-[#06100d]'
            : 'ao-card rounded-tl-sm text-[var(--color-ink)]'
        }`}>
          {isUser ? (
            <p>{turn.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-invert prose-headings:font-sans prose-table:text-xs prose-th:bg-[rgba(255,255,255,.025)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content || '(sin respuesta)'}</ReactMarkdown>
            </div>
          )}
        </div>
        {turn.toolCalls && turn.toolCalls.length > 0 && (
          <details className="text-xs text-[var(--color-ink-3)]">
            <summary className="inline-flex cursor-pointer items-center gap-1 hover:text-[var(--color-ink-2)]">
              <Wrench className="h-3 w-3" /> {turn.toolCalls.length} consulta(s) a datos
            </summary>
            <ul className="mt-1 space-y-0.5 pl-4">
              {turn.toolCalls.map((tc, i) => (
                <li key={i}><code className="rounded bg-[rgba(255,255,255,.05)] px-1 text-[10px] text-[var(--mint)]">{tc.name}</code> {tc.summary}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}
