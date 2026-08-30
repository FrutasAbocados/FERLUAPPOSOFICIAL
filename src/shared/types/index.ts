export type Role = 'admin_full' | 'admin_op' | 'responsable' | 'empleado' | 'operaciones' | 'gestor_cobros' | 'gestor_gedofu'

export type Profile = {
  id: string
  email: string
  display_name: string
  role: Role
  created_at: string
}

export type ModuleKey = 'manager' | 'cash' | 'trabajadores' | 'tareas' | 'turnos' | 'cobros' | 'agente' | 'bbdd_trabajadores' | 'rrhh' | 'nominas' | 'condiciones' | 'sueldos' | 'pedidos_wa' | 'gastos' | 'clientes' | 'tesoreria' | 'listado_precios' | 'gestoria'

export const MODULE_ACCESS: Record<ModuleKey, Role[]> = {
  manager:           ['admin_full', 'admin_op', 'responsable', 'gestor_cobros'],
  cash:              ['admin_full', 'admin_op'],
  trabajadores:      ['admin_full', 'admin_op', 'responsable', 'empleado', 'gestor_cobros'],
  tareas:            ['admin_full', 'admin_op', 'responsable'],
  turnos:            ['admin_full', 'admin_op', 'responsable'],
  cobros:            ['admin_full', 'admin_op', 'responsable', 'gestor_cobros'],
  agente:            ['admin_full', 'admin_op'],
  bbdd_trabajadores: ['admin_full', 'admin_op', 'responsable'],
  rrhh:              ['admin_full', 'admin_op'],
  nominas:           ['admin_full', 'admin_op', 'responsable', 'empleado', 'gestor_cobros'],
  condiciones:       ['admin_full', 'admin_op', 'responsable', 'empleado', 'gestor_cobros'],
  sueldos:           ['admin_full', 'admin_op'],
  pedidos_wa:        ['admin_full', 'admin_op', 'responsable', 'empleado', 'gestor_cobros'],
  gastos:            ['admin_full', 'admin_op'],
  clientes:          ['admin_full', 'admin_op', 'responsable', 'empleado', 'gestor_cobros'],
  tesoreria:         ['admin_full', 'admin_op'],
  listado_precios:   ['admin_full', 'admin_op', 'responsable', 'empleado', 'operaciones', 'gestor_cobros'],
  gestoria:           ['admin_full', 'admin_op', 'gestor_gedofu'],
}

export const canAccess = (mod: ModuleKey, role: Role): boolean =>
  MODULE_ACCESS[mod].includes(role)
