import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const eur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
})

const eurCompact = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export const euros = (n: number | null | undefined): string =>
  eur.format(Number(n ?? 0))

export const eurosShort = (n: number | null | undefined): string =>
  eurCompact.format(Number(n ?? 0))

export const fmtDate = (iso: string, fmt = "EEE d 'de' MMM"): string =>
  format(parseISO(iso), fmt, { locale: es })

export const fmtDayNumber = (iso: string): string =>
  format(parseISO(iso), 'd')

export const fmtWeekday = (iso: string): string =>
  format(parseISO(iso), 'EEEE', { locale: es })
