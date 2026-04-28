export type Role = 'admin_full' | 'admin_op' | 'empleado'

export type Profile = {
  id: string
  email: string
  display_name: string
  role: Role
  created_at: string
}

export type ModuleKey = 'manager' | 'cash' | 'tareas' | 'turnos' | 'cobros' | 'agente'

export const MODULE_ACCESS: Record<ModuleKey, Role[]> = {
  manager: ['admin_full'],
  cash: ['admin_full', 'admin_op'],
  tareas: ['admin_full', 'admin_op'],
  turnos: ['admin_full', 'admin_op', 'empleado'],
  cobros: ['admin_full', 'admin_op'],
  agente: ['admin_full'],
}

export const canAccess = (mod: ModuleKey, role: Role): boolean =>
  MODULE_ACCESS[mod].includes(role)
