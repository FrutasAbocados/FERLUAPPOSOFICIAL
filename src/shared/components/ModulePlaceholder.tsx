import { Sprout } from 'lucide-react'

type Props = {
  title: string
  subtitle: string
  description: string
}

export function ModulePlaceholder({ title, subtitle, description }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:py-12">
      <header className="mb-8 border-b border-[var(--color-border)] pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          Módulo
        </p>
        <h1 className="font-display text-3xl font-bold text-[var(--color-ink)] md:text-4xl">
          {title}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-2)]">{subtitle}</p>
      </header>

      <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]">
          <Sprout className="h-6 w-6" />
        </div>
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
          En construcción
        </h2>
        <p className="mx-auto mt-2 max-w-prose text-sm text-[var(--color-ink-2)]">
          {description}
        </p>
      </div>
    </div>
  )
}
