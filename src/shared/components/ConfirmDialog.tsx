import { useSyncExternalStore } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Button } from '@/shared/components/ui/button'
import { getSnapshot, resolveConfirm, subscribe } from '@/shared/lib/confirm'

export function ConfirmDialog() {
  const pending = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const open = pending !== null
  const variant = pending?.variant ?? 'default'

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => { if (!o) resolveConfirm(false) }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in" />
        <Dialog.Content
          className="ao-card fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 p-5 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in data-[state=open]:zoom-in-95"
        >
          <Dialog.Title className="text-lg font-medium tracking-[-0.01em] text-[var(--ink)]">
            {pending?.title ?? ''}
          </Dialog.Title>
          {pending?.description && (
            <Dialog.Description className="mt-2 text-sm text-[var(--ink-dim)]">
              {pending.description}
            </Dialog.Description>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => resolveConfirm(false)}>
              {pending?.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button
              size="sm"
              variant={variant === 'danger' ? 'danger' : 'primary'}
              onClick={() => resolveConfirm(true)}
            >
              {pending?.confirmLabel ?? 'Confirmar'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
