import { useSyncExternalStore } from 'react'
import * as RadixToast from '@radix-ui/react-toast'
import { X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { dismissToast, getSnapshot, subscribe } from '@/shared/lib/toast'

const VARIANT_STYLES = {
  default:
    'border-[var(--line)] bg-[var(--panel)] text-[var(--ink)]',
  success:
    'border-[var(--mint-glow)] bg-[var(--mint-glow)] text-[var(--mint)]',
  error:
    'border-[oklch(70%_.18_25_/_0.24)] bg-[oklch(30%_.12_25_/_0.22)] text-[var(--coral)]',
} as const

export function Toaster() {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return (
    <RadixToast.Provider swipeDirection="right" duration={5000}>
      {toasts.map((t) => (
        <RadixToast.Root
          key={t.id}
          open
          onOpenChange={(open) => {
            if (!open) dismissToast(t.id)
          }}
          className={cn(
            'flex items-start gap-3 rounded-[var(--radius-lg)] border p-3 backdrop-blur-md',
            VARIANT_STYLES[t.variant ?? 'default'],
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out',
          )}
        >
          <div className="min-w-0 flex-1">
            {t.title && (
              <RadixToast.Title className="font-display text-sm font-bold">
                {t.title}
              </RadixToast.Title>
            )}
            {t.description && (
              <RadixToast.Description className="mt-0.5 text-xs opacity-90">
                {t.description}
              </RadixToast.Description>
            )}
          </div>
          <RadixToast.Close
            aria-label="Cerrar"
            className="rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </RadixToast.Close>
        </RadixToast.Root>
      ))}
      <RadixToast.Viewport className="fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 outline-none" />
    </RadixToast.Provider>
  )
}
