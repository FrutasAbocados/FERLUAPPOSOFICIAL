import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const eur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
})

export const euros = (n: number | null | undefined): string =>
  eur.format(Number(n ?? 0))

export const fmtDate = (iso: string | null | undefined, fmt = "d MMM yyyy"): string => {
  if (!iso) return '—'
  return format(parseISO(iso), fmt, { locale: es })
}

export const fmtFecha = (iso: string): string =>
  format(parseISO(iso), "d 'de' MMM", { locale: es })

export const isAtrasado = (vencimientoISO: string, today = new Date()): boolean => {
  const venc = parseISO(vencimientoISO)
  return venc.getTime() < new Date(today.toDateString()).getTime()
}
