export type ShiftType =
  | 'compra'
  | 'manana'
  | 'media_manana'
  | 'tarde'
  | 'apoyo'
  | 'power'
  | 'vacaciones'
  | 'libre'

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
  hora_inicio: string | null
  hora_fin: string | null
  notas: string | null
}

export type TurnosByKey = Record<string, Turno>

export const turnoKey = (empleadoId: string, fechaISO: string) =>
  `${empleadoId}|${fechaISO}`

export type TurnoMap = Map<string, Turno>

export function mapTurnos(turnos: Turno[] | undefined): TurnoMap {
  const m: TurnoMap = new Map()
  for (const t of turnos ?? []) m.set(turnoKey(t.empleado_id, t.fecha), t)
  return m
}
