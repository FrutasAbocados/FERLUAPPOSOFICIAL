export type Role = 'admin_full' | 'admin_op' | 'empleado'

export type Profile = {
  id: string
  email: string
  display_name: string
  role: Role
  created_at: string
}

export type ModuleKey = 'manager' | 'cash' | 'trabajadores' | 'turnos' | 'cobros' | 'agente' | 'bbdd_trabajadores' | 'sueldos'

export const MODULE_ACCESS: Record<ModuleKey, Role[]> = {
  manager: ['admin_full'],
  cash: ['admin_full', 'admin_op'],
  trabajadores: ['admin_full', 'admin_op', 'empleado'],
  turnos: ['admin_full', 'admin_op', 'empleado'],
  cobros: ['admin_full', 'admin_op'],
  agente: ['admin_full'],
  bbdd_trabajadores: ['admin_full', 'admin_op'],
  sueldos: ['admin_full', 'admin_op'],
}

export const canAccess = (mod: ModuleKey, role: Role): boolean =>
  MODULE_ACCESS[mod].includes(role)
