export type ShiftType = 'compra' | 'manana' | 'libre' | 'power'

export type Empleado = {
  id: string
  user_id: string | null
  nombre: string
  alias: string | null
  color: string | null
  activo: boolean
  orden: number
}

export type Turno = {
  id: string
  empleado_id: string
  fecha: string
  tipo: ShiftType
  notas: string | null
}

export type TurnosByKey = Record<string, Turno>

export const turnoKey = (empleadoId: string, fechaISO: string) =>
  `${empleadoId}|${fechaISO}`
