export type Role = 'admin_full' | 'admin_op' | 'responsable' | 'empleado' | 'operaciones' | 'gestor_cobros'

export type Profile = {
  id: string
  email: string
  display_name: string
  role: Role
  created_at: string
}

export type ModuleKey = 'manager' | 'cash' | 'trabajadores' | 'tareas' | 'turnos' | 'cobros' | 'agente' | 'bbdd_trabajadores' | 'sueldos' | 'pedidos_wa' | 'gastos' | 'clientes'

export const MODULE_ACCESS: Record<ModuleKey, Role[]> = {
  manager:           ['admin_full', 'admin_op', 'responsable', 'gestor_cobros'],
  cash:              ['admin_full', 'admin_op'],
  trabajadores:      ['admin_full', 'admin_op', 'responsable', 'empleado', 'gestor_cobros'],
  tareas:            ['admin_full', 'admin_op', 'responsable'],
  turnos:            ['admin_full', 'admin_op', 'responsable'],
  cobros:            ['admin_full', 'admin_op', 'responsable', 'gestor_cobros'],
  agente:            ['admin_full', 'admin_op'],
  bbdd_trabajadores: ['admin_full', 'admin_op', 'responsable'],
  sueldos:           ['admin_full', 'admin_op'],
  pedidos_wa:        ['admin_full', 'admin_op', 'responsable', 'empleado', 'gestor_cobros'],
  gastos:            ['admin_full', 'admin_op'],
  clientes:          ['admin_full', 'admin_op', 'responsable', 'empleado', 'gestor_cobros'],
}

export const canAccess = (mod: ModuleKey, role: Role): boolean =>
  MODULE_ACCESS[mod].includes(role)
