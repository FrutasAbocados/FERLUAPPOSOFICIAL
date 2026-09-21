// Formato y tipos compartidos por el handler y el PDF. Sin dependencias de
// pdf-lib: el handler se ejecuta también bajo el runner de Node en tests.
export type Informe = {
  fecha: string; inicio: string; mes_inicio: string; generado_at: string; ultima_sync: string | null;
  comision_pct: number; total_semana: number; total_anterior: number; total_mes: number;
  comision_semana: number; comision_mes: number;
  clientes: Array<{ nombre: string; semana: number; anterior: number; mes: number; documentos: number;
    comision_semana: number; comision_mes: number; ultima_venta: string | null }>;
  documentos: Array<{ cliente: string; fecha: string; numero: string; tipo: string; subtotal: number; comision: number }>;
};
export const eur = (n: number) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }).format(Number(n))} €`;
export const dia = (s: string) => s.slice(8, 10) + '/' + s.slice(5, 7);
export const momento = (s: string | null) => s
  ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(s))
  : 'Sin sincronización';
export function variacion(actual: number, anterior: number): string {
  actual = Number(actual); anterior = Number(anterior);
  if (anterior <= 0) return actual === 0 ? 'Sin variación' : 'Sin base comparable';
  const p = (actual - anterior) / anterior * 100;
  return `${p > 0 ? '+' : ''}${p.toFixed(1).replace('.', ',')}%`;
}
