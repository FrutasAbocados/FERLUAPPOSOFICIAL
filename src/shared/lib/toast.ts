export type ToastVariant = 'default' | 'success' | 'error'

export type Toast = {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
}

let toasts: Toast[] = []
const listeners = new Set<() => void>()

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot() {
  return toasts
}

function emit() {
  for (const l of listeners) l()
}

export function toast(t: Omit<Toast, 'id'>) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  toasts = [...toasts, { id, variant: 'default', ...t }]
  emit()
  return id
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}
