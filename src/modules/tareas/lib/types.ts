export type TareaEstado = 'pendiente' | 'en_progreso' | 'hecha' | 'cancelada'
export type TareaPrioridad = 'baja' | 'media' | 'alta'

export type Tarea = {
  id: string
  titulo: string
  descripcion: string | null
  estado: TareaEstado
  prioridad: TareaPrioridad
  asignado_a: string | null
  categoria: string | null
  fecha_vencimiento: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export type TareaInput = {
  titulo: string
  descripcion: string | null
  prioridad: TareaPrioridad
  asignado_a: string | null
  categoria: string | null
  fecha_vencimiento: string | null
}

export const ESTADO_LABEL: Record<TareaEstado, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En curso',
  hecha: 'Hecha',
  cancelada: 'Cancelada',
}

export const PRIORIDAD_LABEL: Record<TareaPrioridad, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
}

export const PRIORIDAD_ORDER: Record<TareaPrioridad, number> = {
  alta: 0,
  media: 1,
  baja: 2,
}
