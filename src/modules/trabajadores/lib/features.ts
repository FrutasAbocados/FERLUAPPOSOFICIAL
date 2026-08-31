// Funcionalidades históricas de incentivos. Se mantienen en código y BBDD para
// poder auditarlas o reactivarlas, pero no se muestran mientras estén retiradas.
export const INCENTIVOS_TRABAJADORES_VISIBLES = false

const TABS_INCENTIVOS = new Set(['puntos', 'premios', 'turnos', 'ruleta', 'productividad'])

export const esTabIncentivos = (tab: string): boolean => TABS_INCENTIVOS.has(tab)

const NOTIFICACIONES_INCENTIVOS = new Set([
  'puntos_dia',
  'motivacion_ia',
  'penalizacion_ia',
  'neutral_ia',
])

export const esNotificacionIncentivos = (tipo: string): boolean => NOTIFICACIONES_INCENTIVOS.has(tipo)
