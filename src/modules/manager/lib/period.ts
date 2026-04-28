import {
  endOfMonth, endOfYear, format,
  startOfMonth, startOfYear, subDays, subMonths,
} from 'date-fns'

export type PeriodPreset =
  | 'hoy'
  | '7d'
  | '30d'
  | 'mes'
  | 'mes_anterior'
  | 'ytd'
  | 'custom'

export interface Period {
  preset: PeriodPreset
  from: string  // YYYY-MM-DD
  to: string    // YYYY-MM-DD
  label: string
}

const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

export function periodFromPreset(preset: Exclude<PeriodPreset, 'custom'>, anchor: Date = new Date()): Period {
  switch (preset) {
    case 'hoy':
      return { preset, from: fmt(anchor), to: fmt(anchor), label: 'Hoy' }
    case '7d':
      return { preset, from: fmt(subDays(anchor, 6)), to: fmt(anchor), label: 'Últimos 7 días' }
    case '30d':
      return { preset, from: fmt(subDays(anchor, 29)), to: fmt(anchor), label: 'Últimos 30 días' }
    case 'mes':
      return { preset, from: fmt(startOfMonth(anchor)), to: fmt(endOfMonth(anchor)), label: 'Mes actual' }
    case 'mes_anterior': {
      const prev = subMonths(anchor, 1)
      return { preset, from: fmt(startOfMonth(prev)), to: fmt(endOfMonth(prev)), label: 'Mes anterior' }
    }
    case 'ytd':
      return { preset, from: fmt(startOfYear(anchor)), to: fmt(endOfYear(anchor)), label: 'Año en curso' }
  }
}

export function customPeriod(from: string, to: string): Period {
  return { preset: 'custom', from, to, label: `${from} → ${to}` }
}

export const PRESET_OPTIONS: Array<{ value: Exclude<PeriodPreset, 'custom'>; label: string }> = [
  { value: 'hoy',          label: 'Hoy' },
  { value: '7d',           label: '7 días' },
  { value: '30d',          label: '30 días' },
  { value: 'mes',          label: 'Mes actual' },
  { value: 'mes_anterior', label: 'Mes anterior' },
  { value: 'ytd',          label: 'YTD' },
]
