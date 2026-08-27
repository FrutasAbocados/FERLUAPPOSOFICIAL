export const PEOPLE_COST_LIMIT_USD = 0.5
export const PEOPLE_AUTOCLOSE_USD = 0.35
export const PEOPLE_MAX_DURATION_SECONDS = 10 * 60

export interface RealtimeUsage {
  inputTokens: number
  outputTokens: number
  inputTextTokens: number
  inputAudioTokens: number
  cachedInputTextTokens: number
  cachedInputAudioTokens: number
  outputTextTokens: number
  outputAudioTokens: number
}

export function emptyRealtimeUsage(): RealtimeUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    inputTextTokens: 0,
    inputAudioTokens: 0,
    cachedInputTextTokens: 0,
    cachedInputAudioTokens: 0,
    outputTextTokens: 0,
    outputAudioTokens: 0,
  }
}

export function addRealtimeUsage(current: RealtimeUsage, response: unknown): RealtimeUsage {
  const root = record(response)
  const usage = record(root.usage)
  const input = record(usage.input_token_details)
  const output = record(usage.output_token_details)
  const cached = record(input.cached_tokens_details)
  return {
    inputTokens: current.inputTokens + count(usage.input_tokens),
    outputTokens: current.outputTokens + count(usage.output_tokens),
    inputTextTokens: current.inputTextTokens + count(input.text_tokens),
    inputAudioTokens: current.inputAudioTokens + count(input.audio_tokens),
    cachedInputTextTokens: current.cachedInputTextTokens + count(cached.text_tokens),
    cachedInputAudioTokens: current.cachedInputAudioTokens + count(cached.audio_tokens),
    outputTextTokens: current.outputTextTokens + count(output.text_tokens),
    outputAudioTokens: current.outputAudioTokens + count(output.audio_tokens),
  }
}

export function estimateRealtimeCost(usage: RealtimeUsage): number {
  const cachedText = Math.min(usage.cachedInputTextTokens, usage.inputTextTokens)
  const cachedAudio = Math.min(usage.cachedInputAudioTokens, usage.inputAudioTokens)
  const unknownInput = Math.max(0, usage.inputTokens - usage.inputTextTokens - usage.inputAudioTokens)
  const unknownOutput = Math.max(0, usage.outputTokens - usage.outputTextTokens - usage.outputAudioTokens)
  return (
    (usage.inputTextTokens - cachedText) * 0.6
    + cachedText * 0.06
    + (usage.inputAudioTokens - cachedAudio) * 10
    + cachedAudio * 0.3
    + unknownInput * 10
    + usage.outputTextTokens * 2.4
    + usage.outputAudioTokens * 20
    + unknownOutput * 20
  ) / 1_000_000
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}
