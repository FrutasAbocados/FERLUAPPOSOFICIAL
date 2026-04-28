import { addDays, differenceInCalendarDays, endOfMonth, format, nextSunday, startOfMonth } from 'date-fns'
import type { Estado, FormaPago, Movimiento } from './types'

export const isoDate = (d: Date) => format(d, 'yyyy-MM-dd')

export const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n)

/** Convierte un número serial Excel (epoch 1900-01-01, con bug año bisiesto) a Date. */
export function excelSerialToDate(serial: number): Date {
  // Excel cuenta el día ficticio 1900-02-29; serial 60 = 1900-02-29 inexistente.
  // Para serials >= 60, restamos 1; para los menores, usamos el offset directo.
  const utcDays = serial - 25569 - (serial >= 60 ? 1 : 0)
  return new Date(utcDays * 86_400_000)
}

/** Calcula la fecha de vencimiento según forma_pago, partiendo de fecha_factura. */
export function calcVencimiento(fechaFactura: Date, forma: FormaPago): Date {
  switch (forma) {
    case 'Contado':
      return fechaFactura
    case '1_dia':
      return addDays(fechaFactura, 1)
    case '7_dias':
      return addDays(fechaFactura, 7)
    case '30_dias':
      return addDays(fechaFactura, 30)
    case 'Semanal_V': {
      // Domingo siguiente a la fecha (si ya es domingo, el siguiente)
      return nextSunday(fechaFactura)
    }
    case 'Mensual_V': {
      // Día 1 del mes siguiente
      const next = startOfMonth(fechaFactura)
      next.setMonth(next.getMonth() + 1)
      return next
    }
  }
}

/** Importe pendiente de un movimiento. */
export function importePendiente(m: Movimiento): number {
  if (m.pagado) return 0
  return Number(m.importe) - Number(m.importe_cobrado ?? 0)
}

/** Antigüedad en días desde fecha_factura hasta hoy. 0 si está pagado. */
export function antiguedadDias(m: Movimiento, hoy = new Date()): number {
  if (m.pagado) return 0
  return Math.max(0, differenceInCalendarDays(hoy, new Date(m.fecha_factura)))
}

/** Estado del movimiento. */
export function estadoMovimiento(m: Movimiento, hoy = new Date()): Estado {
  if (m.pagado) return 'Cobrado'
  const venc = new Date(m.fecha_vencimiento)
  const diff = differenceInCalendarDays(venc, hoy)
  if (diff < 0) return 'Vencido'
  if (diff <= 7) return 'Próximo'
  return 'Pendiente'
}

/** Devuelve el "peor" estado de un conjunto: Vencido > Próximo > Pendiente > Cobrado. */
export function peorEstado(estados: Estado[]): Estado {
  const order: Record<Estado, number> = { Vencido: 3, Próximo: 2, Pendiente: 1, Cobrado: 0 }
  let best: Estado = 'Cobrado'
  for (const e of estados) if (order[e] > order[best]) best = e
  return best
}

/** Mes (YYYY-MM) a partir de una fecha ISO. */
export const monthOf = (iso: string) => iso.slice(0, 7)

export const startOfThisMonth = () => isoDate(startOfMonth(new Date()))
export const endOfThisMonth = () => isoDate(endOfMonth(new Date()))
