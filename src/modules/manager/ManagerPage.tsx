import { useState } from 'react'
import { SyncBar } from './components/SyncBar'
import { PeriodPicker } from './components/PeriodPicker'
import { ResumenView } from './components/ResumenView'
import { periodFromPreset, type Period } from './lib/period'

export function ManagerPage() {
  const [period, setPeriod] = useState<Period>(() => periodFromPreset('mes'))

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
      <header className="mb-5 border-b border-[var(--color-border)] pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Módulo</p>
        <h1 className="font-display text-2xl font-bold text-[var(--color-ink)] md:text-3xl">Manager</h1>
        <p className="mt-0.5 text-sm text-[var(--color-ink-2)]">
          Análisis de ventas y compras en directo desde Holded · margen real con coste por línea.
        </p>
      </header>

      <div className="space-y-4">
        <SyncBar />
        <PeriodPicker value={period} onChange={setPeriod} />
        <ResumenView period={period} />
      </div>
    </div>
  )
}
