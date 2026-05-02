// Confirm dialog as a promise-returning function. Mismo patrón que `toast.ts`:
// store externo + render por <ConfirmDialog/> en AppShell.
//
// Uso:
//   const ok = await confirm({ title: '¿Borrar factura?', variant: 'danger' })
//   if (!ok) return

export type ConfirmVariant = 'default' | 'danger'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

let current: PendingConfirm | null = null
const listeners = new Set<() => void>()

function emit() { for (const l of listeners) l() }

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot(): PendingConfirm | null { return current }

export function confirm(options: ConfirmOptions): Promise<boolean> {
  if (current) {
    // Si ya hay un confirm abierto, lo cancelamos automáticamente para evitar
    // colas (raro en práctica, pero defensivo).
    current.resolve(false)
    current = null
  }
  return new Promise<boolean>((resolve) => {
    current = { ...options, resolve }
    emit()
  })
}

export function resolveConfirm(ok: boolean) {
  if (!current) return
  current.resolve(ok)
  current = null
  emit()
}
