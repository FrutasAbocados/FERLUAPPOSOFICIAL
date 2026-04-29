// Festivos nacionales + Andalucía + Málaga.
// Algunos varían por año (Semana Santa). Lista mínima ampliable.

export interface Festivo {
  fecha: string  // yyyy-MM-dd
  nombre: string
  ambito: 'nacional' | 'andalucia' | 'malaga'
}

const FESTIVOS_FIJOS: Array<{ md: string; nombre: string; ambito: Festivo['ambito'] }> = [
  { md: '01-01', nombre: 'Año Nuevo', ambito: 'nacional' },
  { md: '01-06', nombre: 'Reyes', ambito: 'nacional' },
  { md: '02-28', nombre: 'Día de Andalucía', ambito: 'andalucia' },
  { md: '05-01', nombre: 'Día del Trabajo', ambito: 'nacional' },
  { md: '08-15', nombre: 'Asunción', ambito: 'nacional' },
  { md: '08-19', nombre: 'Feria de Málaga (local)', ambito: 'malaga' },
  { md: '10-12', nombre: 'Fiesta Nacional', ambito: 'nacional' },
  { md: '11-01', nombre: 'Todos los Santos', ambito: 'nacional' },
  { md: '12-06', nombre: 'Constitución', ambito: 'nacional' },
  { md: '12-08', nombre: 'Inmaculada', ambito: 'nacional' },
  { md: '12-25', nombre: 'Navidad', ambito: 'nacional' },
]

// Fechas Pascua / Semana Santa por año (para tener Viernes Santo)
const SEMANA_SANTA: Record<number, { jueves: string; viernes: string }> = {
  2025: { jueves: '2025-04-17', viernes: '2025-04-18' },
  2026: { jueves: '2026-04-02', viernes: '2026-04-03' },
  2027: { jueves: '2027-03-25', viernes: '2027-03-26' },
  2028: { jueves: '2028-04-13', viernes: '2028-04-14' },
}

export function festivosDelAnio(anio: number): Festivo[] {
  const out: Festivo[] = FESTIVOS_FIJOS.map(f => ({
    fecha: `${anio}-${f.md}`,
    nombre: f.nombre,
    ambito: f.ambito,
  }))
  const ss = SEMANA_SANTA[anio]
  if (ss) {
    out.push({ fecha: ss.jueves,  nombre: 'Jueves Santo',  ambito: 'andalucia' })
    out.push({ fecha: ss.viernes, nombre: 'Viernes Santo', ambito: 'nacional' })
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export function festivosMap(anio: number): Map<string, Festivo> {
  const m = new Map<string, Festivo>()
  for (const f of festivosDelAnio(anio)) m.set(f.fecha, f)
  return m
}
