import { Sparkles, Wand2, Pencil } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { Metodo } from '../lib/types'

const STYLE: Record<Metodo, { label: string; className: string; Icon: typeof Wand2 }> = {
  regex: {
    label: 'auto',
    className: 'bg-[var(--mint-glow)] text-[var(--mint)] border-[var(--mint-glow)]',
    Icon: Wand2,
  },
  claude: {
    label: 'IA',
    className: 'bg-[oklch(30%_.10_295_/_0.22)] text-[var(--violet)] border-[oklch(72%_.16_295_/_0.25)]',
    Icon: Sparkles,
  },
  manual: {
    label: 'manual',
    className: 'bg-[oklch(30%_.10_70_/_0.25)] text-[var(--amber)] border-[oklch(78%_.16_70_/_0.25)]',
    Icon: Pencil,
  },
}

export function BadgeMetodo({ metodo, className }: { metodo: Metodo; className?: string }) {
  const s = STYLE[metodo]
  const Icon = s.Icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        s.className,
        className,
      )}
      title={`Parseado por ${s.label}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {s.label}
    </span>
  )
}
