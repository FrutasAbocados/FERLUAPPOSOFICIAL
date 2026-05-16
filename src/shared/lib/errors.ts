export function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' ? message : String(message ?? '')
  }
  if (typeof error === 'string') return error
  return undefined
}
