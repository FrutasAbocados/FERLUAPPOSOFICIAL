export const METODOS_GASTO = ['domiciliado', 'transferencia', 'tarjeta', 'efectivo'] as const
export type MetodoGasto = typeof METODOS_GASTO[number]
