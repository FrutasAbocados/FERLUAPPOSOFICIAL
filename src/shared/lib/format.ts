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

// ── Números sin moneda ───────────────────────────────────────────────────────

const _numFull    = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })
const _numCompact = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
const _numDec     = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })

/** Número sin moneda, sin decimales (`1.234`). */
export const numFormat = (n: number | null | undefined): string =>
  _numFull.format(Number(n ?? 0))

/** Número compacto sin moneda — K para ≥1000 (`23,5K` o `456`). */
export const numCompact = (n: number | null | undefined): string => {
  const v = Number(n ?? 0)
  return v >= 1000 ? `${_numCompact.format(v / 1000)}K` : _numFull.format(v)
}

/** Número sin moneda con 2 decimales (`1.234,56`). Para cantidades/unidades. */
export const numDec = (n: number | null | undefined): string =>
  _numDec.format(Number(n ?? 0))

/** Formato fecha ISO → "lun 5 de may" (default). */
export const fmtDate = (iso: string, fmt = "EEE d 'de' MMM"): string =>
  format(parseISO(iso), fmt, { locale: es })

export const fmtDayNumber = (iso: string): string =>
  format(parseISO(iso), 'd')

export const fmtWeekday = (iso: string): string =>
  format(parseISO(iso), 'EEEE', { locale: es })
