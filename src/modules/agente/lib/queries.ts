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
  return useMutation({
    mutationFn: async (messages: AgentMessage[]): Promise<AgentReply> => {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase.functions.invoke('agent-chat', {
        body: { messages, currentDate: today },
      })
      if (error) throw error
      const r = data as { reply?: string; toolCalls?: AgentToolCall[]; error?: string }
      if (r?.error) throw new Error(r.error)
      return { reply: r?.reply ?? '', toolCalls: r?.toolCalls ?? [] }
    },
  })
}
