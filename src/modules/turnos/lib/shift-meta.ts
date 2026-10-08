import type { ShiftType } from './types'

export type ShiftMeta = {
  label: string
  short: string
  bg: string
  fg: string
  border: string
  description: string
  /** Horario por defecto al asignar el tipo (HH:MM). */
  inicio?: string
  fin?: string
}

// Colores alineados con el cartel del plan rotativo (oct-2026).
export const SHIFT_META: Record<ShiftType, ShiftMeta> = {
  compra: {
    label: 'Compras',
    short: 'C',
    bg: '#f87171',
    fg: '#1f0a0a',
    border: '#dc2626',
    description: 'Compras en Mercabarna',
    inicio: '04:30',
    fin: '11:30',
  },
  manana: {
    label: 'Mañana',
    short: 'M',
    bg: '#4ade80',
    fg: '#052e16',
    border: '#16a34a',
    description: 'Turno de mañana en almacén',
    inicio: '05:30',
    fin: '12:30',
  },
  media_manana: {
    label: 'Media mañana',
    short: 'MM',
    bg: '#bef264',
    fg: '#1a2e05',
    border: '#84cc16',
    description: 'Turno de media mañana',
    inicio: '05:30',
    fin: '12:30',
  },
  tarde: {
    label: 'Tarde',
    short: 'T',
    bg: '#fbbf24',
    fg: '#1f1300',
    border: '#d97706',
    description: 'Turno de tarde / reparto',
    inicio: '06:00',
    fin: '13:00',
  },
  apoyo: {
    label: 'Apoyo',
    short: 'A',
    bg: '#60a5fa',
    fg: '#0b1a33',
    border: '#2563eb',
    description: 'Apoyo a compras',
    inicio: '06:00',
    fin: '09:30',
  },
  power: {
    label: 'Power',
    short: 'P',
    bg: '#c9a961',
    fg: '#1f2520',
    border: '#a8893f',
    description: 'Power day — refuerzo en jornada fuerte',
  },
  vacaciones: {
    label: 'Vacaciones',
    short: 'V',
    bg: '#5eead4',
    fg: '#042f2e',
    border: '#0d9488',
    description: '¡Disfruta!',
  },
  libre: {
    label: 'Libre',
    short: 'L',
    bg: '#94a3b8',
    fg: '#0f172a',
    border: '#64748b',
    description: 'Día libre',
  },
}

export const SHIFT_ORDER: ShiftType[] = ['compra', 'manana', 'media_manana', 'tarde', 'apoyo', 'power', 'vacaciones', 'libre']

/** "05:30:00" → "05:30" */
export const hhmm = (t: string | null | undefined): string | null => (t ? t.slice(0, 5) : null)

export const horario = (t: { hora_inicio: string | null; hora_fin: string | null } | null | undefined): string | null => {
  const a = hhmm(t?.hora_inicio)
  const b = hhmm(t?.hora_fin)
  return a && b ? `${a} – ${b}` : a ?? b
}
