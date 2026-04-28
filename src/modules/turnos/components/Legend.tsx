import { SHIFT_META, SHIFT_ORDER } from '../lib/shift-meta'

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {SHIFT_ORDER.map((t) => {
        const m = SHIFT_META[t]
        return (
          <div
            key={t}
            className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1"
          >
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold"
              style={{ background: m.bg, color: m.fg }}
            >
              {m.short}
            </span>
            <span className="text-[var(--color-ink-2)]">{m.label}</span>
          </div>
        )
      })}
    </div>
  )
}
