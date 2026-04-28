import { Link } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-5 py-16 text-center">
      <div className="font-mono text-xs uppercase tracking-widest text-[var(--color-ink-3)]">
        404
      </div>
      <h1 className="font-display text-2xl font-bold text-[var(--color-ink)]">
        Esa ruta no existe
      </h1>
      <Link to="/">
        <Button variant="outline">Volver al inicio</Button>
      </Link>
    </div>
  )
}
