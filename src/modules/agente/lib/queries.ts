import { useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentToolCall {
  name: string
  input: unknown
  summary?: string
}

export interface AgentReply {
  reply: string
  toolCalls: AgentToolCall[]
}

export function useAgentChat() {
  // Si el usuario navega fuera de /agente con una llamada en vuelo, abortamos
  // — la edge function deja de facturarse aunque la respuesta llegue tarde.
  const ctrlRef = useRef<AbortController | null>(null)
  useEffect(() => () => ctrlRef.current?.abort(), [])

  return useMutation({
    mutationFn: async (messages: AgentMessage[]): Promise<AgentReply> => {
      ctrlRef.current?.abort()
      const ctrl = new AbortController()
      ctrlRef.current = ctrl
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase.functions.invoke('agent-chat', {
        body: { messages, currentDate: today },
        signal: ctrl.signal,
      })
      if (error) throw error
      const r = data as { reply?: string; toolCalls?: AgentToolCall[]; error?: string }
      if (r?.error) throw new Error(r.error)
      return { reply: r?.reply ?? '', toolCalls: r?.toolCalls ?? [] }
    },
  })
}
