// Horas de fichaje siempre en hora de Madrid, con independencia del navegador.
// El servidor recibe `timestamp` sin zona y lo interpreta como Europe/Madrid.

const PARTES = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** ISO (con zona) → 'YYYY-MM-DDTHH:mm' en hora de Madrid, para <input type="datetime-local">. */
export function isoAMadridLocal(iso: string): string {
  const p = Object.fromEntries(PARTES.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

/** 'YYYY-MM-DDTHH:mm' de un input → valor para un parámetro `timestamp` de la RPC. */
export function madridLocalARpc(local: string): string {
  return local.length === 16 ? `${local}:00` : local
}

/** Hora HH:mm en Madrid. */
export function horaMadrid(iso: string): string {
  return isoAMadridLocal(iso).slice(11, 16)
}

/** Fecha dd/MM en Madrid. */
export function fechaMadrid(iso: string): string {
  const l = isoAMadridLocal(iso)
  return `${l.slice(8, 10)}/${l.slice(5, 7)}`
}
