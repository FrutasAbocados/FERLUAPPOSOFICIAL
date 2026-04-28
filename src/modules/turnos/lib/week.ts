import {
  addDays,
  addWeeks,
  format,
  isSameDay,
  parseISO,
  startOfWeek,
} from 'date-fns'

const WEEK_OPTS = { weekStartsOn: 1 as const }

export const weekStart = (d: Date): Date => startOfWeek(d, WEEK_OPTS)

export const weekDays = (anchor: Date): Date[] => {
  const start = weekStart(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export const shiftWeek = (anchor: Date, by: number): Date =>
  addWeeks(weekStart(anchor), by)

export const isoDate = (d: Date): string => format(d, 'yyyy-MM-dd')

export const fromISO = (iso: string): Date => parseISO(iso)

export const formatRange = (anchor: Date): string => {
  const days = weekDays(anchor)
  const start = days[0]
  const end = days[6]
  const sameMonth = start.getMonth() === end.getMonth()
  const startFmt = sameMonth ? format(start, 'd') : format(start, "d 'de' MMM")
  const endFmt = format(end, "d 'de' MMM yyyy")
  return `${startFmt} – ${endFmt}`
}

export const isToday = (d: Date): boolean => isSameDay(d, new Date())

export const SHORT_DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export const dayLabel = (d: Date): string => format(d, 'EEE d')
