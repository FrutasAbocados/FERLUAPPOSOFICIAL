import type { ShiftType } from './types'

export type ShiftMeta = {
  label: string
  short: string
  bg: string
  fg: string
  border: string
  description: string
}

export const SHIFT_META: Record<ShiftType, ShiftMeta> = {
  compra: {
    label: 'Compra',
    short: 'C',
    bg: '#1e40af',
    fg: '#ffffff',
    border: '#1e3a8a',
    description: 'Día de compra (madrugada en Mercabarna)',
  },
  manana: {
    label: 'Mañana',
    short: 'M',
    bg: '#f59e0b',
    fg: '#1f2520',
    border: '#d97706',
    description: 'Turno de mañana en almacén',
  },
  libre: {
    label: 'Libre',
    short: 'L',
    bg: '#94a3b8',
    fg: '#0f172a',
    border: '#64748b',
    description: 'Día libre',
  },
  power: {
    label: 'Power',
    short: 'P',
    bg: '#c9a961',
    fg: '#1f2520',
    border: '#a8893f',
    description: 'Power day — refuerzo en jornada fuerte',
  },
}

export const SHIFT_ORDER: ShiftType[] = ['compra', 'manana', 'libre', 'power']

// Cycle order for tap-to-edit. null = sin asignar (no row).
export const CYCLE: (ShiftType | null)[] = [null, 'compra', 'manana', 'libre', 'power']

export const nextInCycle = (current: ShiftType | null): ShiftType | null => {
  const i = CYCLE.indexOf(current)
  return CYCLE[(i + 1) % CYCLE.length]
}
