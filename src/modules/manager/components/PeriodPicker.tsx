import { useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { customPeriod, PRESET_OPTIONS, periodFromPreset, type Period, type PeriodPreset } from '../lib/period'

interface Props {
  value: Period
  onChange: (p: Period) => void
}

export function PeriodPicker({ value, onChange }: Props) {
  const [customOpen, setCustomOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(value.from)
  const [customTo, setCustomTo] = useState(value.to)

  const pick = (preset: Exclude<PeriodPreset, 'custom'>) => {
    setCustomOpen(false)
    onChange(periodFromPreset(preset))
  }

  const applyCustom = () => {
    if (customFrom && customTo && customFrom <= customTo) {
      onChange(customPeriod(customFrom, customTo))
      setCustomOpen(false)
    }
  }

  return (
    <div className="ao-card p-3">
      <div className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 no-scrollbar">
        {PRESET_OPTIONS.map(opt => {
          const active = value.preset === opt.value
          return (
            <Button
              key={opt.value}
              size="sm"
              variant={active ? 'primary' : 'outline'}
              onClick={() => pick(opt.value)}
              className="shrink-0"
            >
              {opt.label}
            </Button>
          )
        })}
        <Button
          size="sm"
          variant={value.preset === 'custom' ? 'primary' : 'outline'}
          onClick={() => setCustomOpen(o => !o)}
          className="shrink-0"
        >
          Personalizado
        </Button>
      </div>
      <div className="mt-1.5 text-right text-xs text-[var(--color-ink-3)] tabular-nums">
        {value.from} → {value.to}
      </div>

      {customOpen && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Desde</label>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-9 w-44"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Hasta</label>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-9 w-44"
            />
          </div>
          <Button size="sm" onClick={applyCustom}>Aplicar</Button>
        </div>
      )}
    </div>
  )
}
