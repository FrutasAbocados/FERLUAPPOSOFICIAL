import { useEffect, type ReactNode } from 'react'

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
}: Props) {
  useEffect(() => {
    if (!closeOnEscape) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeOnEscape, onClose])

  const handleOverlay = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!closeOnOverlay) return
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-2 backdrop-blur-sm md:p-6"
      onClick={handleOverlay}
      role="dialog"
      aria-modal="true"
    >
      <div className={`ao-card w-full ${SIZE[size]} [overflow:clip] p-0 ${className}`}>
        {children}
      </div>
    </div>
  )
}
