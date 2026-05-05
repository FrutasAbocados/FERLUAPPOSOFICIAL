import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const eurFull = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
})

const eurShort = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

/** Importe en euros con 2 decimales (`12,50 €`). Acepta null/undefined → `0,00 €`. */
export const euros = (n: number | null | undefined): string =>
  eurFull.format(Number(n ?? 0))

/** Importe en euros sin decimales (`13 €`). Útil en KPI tiles. */
export const eurosShort = (n: number | null | undefined): string =>
  eurShort.format(Number(n ?? 0))

/** Importe en euros con guión si null (`12,50 €` o `—`). Para tablas BBDD donde NULL = sin dato. */
export const eurosOrDash = (n: number | null | undefined): string =>
  n == null ? '—' : eurFull.format(Number(n))

/** Importe en euros sin decimales con guión si null (`13 €` o `—`). KPI compact + null-safe. */
export const eurosShortOrDash = (n: number | null | undefined): string =>
  n == null ? '—' : eurShort.format(Number(n))

/** Formato fecha ISO → "lun 5 de may" (default). */
export const fmtDate = (iso: string, fmt = "EEE d 'de' MMM"): string =>
  format(parseISO(iso), fmt, { locale: es })

export const fmtDayNumber = (iso: string): string =>
  format(parseISO(iso), 'd')

export const fmtWeekday = (iso: string): string =>
  format(parseISO(iso), 'EEEE', { locale: es })
