import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'

type Size = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'
const SIZE: Record<Size, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-xl',
  xl: 'max-w-2xl',
  '2xl': 'max-w-3xl',
  '3xl': 'max-w-5xl',
  '4xl': 'max-w-4xl',
}

type Props = {
  onClose: () => void
  children: ReactNode
  size?: Size
  /** Permite cerrar con tecla Escape. Default: true */
  closeOnEscape?: boolean
  /** Click en el overlay cierra. Default: true */
  closeOnOverlay?: boolean
  className?: string
  /** Nombre accesible del diálogo cuando su título visual vive dentro de children. */
  ariaLabel?: string
}

/**
 * Overlay modal estándar de Abocados OS.
 *
 * - Centrado con scroll en mobile (`items-start`) y desktop.
 * - Click fuera cierra (`closeOnOverlay`), Escape cierra (`closeOnEscape`).
 * - El contenedor interno usa la superficie visual `ao-card`.
 *   El consumidor decide qué meter dentro: header sticky, secciones, footer…
 *
 * Patrón establecido en CLAUDE.md. Reemplaza el boilerplate
 * `fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50`
 * que se repite en 20 archivos.
 */
export function Modal({
  onClose,
  children,
  size = 'md',
  closeOnEscape = true,
  closeOnOverlay = true,
  className = '',
  ariaLabel = 'Ventana de Abocados OS',
}: Props) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in" />
        <Dialog.Content
          aria-label={ariaLabel}
          onEscapeKeyDown={(event) => {
            if (!closeOnEscape) event.preventDefault()
          }}
          onPointerDownOutside={(event) => {
            if (!closeOnOverlay) event.preventDefault()
          }}
          className={`fixed left-1/2 top-2 z-50 max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] -translate-x-1/2 overflow-y-auto outline-none md:top-6 md:max-h-[calc(100dvh-3rem)] ${SIZE[size]}`}
        >
          <div className={`ao-card w-full [overflow:clip] p-0 ${className}`}>
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
