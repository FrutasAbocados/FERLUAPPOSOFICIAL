// motd.ts — Mensaje del Día for Abocados OS
// Rotates by day-of-year so it changes every 24h but is deterministic
// (same date = same message for everyone on the team).

export const MOTD_LIST: readonly string[] = [
  "Hoy se mueve la fruta.",
  "El día empieza cuando arde la cámara.",
  "Cada caja cuenta. Cada cliente más.",
  "Hoy es buen día para cobrar lo de ayer.",
  "Mercado lleno, agenda corta. A trabajar.",
  "El aguacate no espera, nosotros tampoco.",
  "Primero la fruta, después el café.",
  "Que salgan los albaranes redondos.",
  "Día de números limpios y manos limpias.",
  "Mejor un sí pequeño que un no grande.",
  "Hoy se factura, mañana se descansa.",
  "Que ningún kilo se quede atrás.",
  "Llegamos antes que el sol y nos vamos después.",
  "Frío en cámara, calor en el equipo.",
  "Cliente contento, semana redonda.",
  "Si se ve bonito, se vende mejor.",
  "Quien madruga, factura.",
  "La fruta buena se nota a la primera.",
  "Hoy toca apretar — el viernes nos vemos cobrando.",
  "Sin prisa pero sin pausa, como el aguacate maduro.",
  "Un buen pedido vale más que diez promesas.",
  "Que el margen no se duerma en la nevera.",
  "Si está fresco, se mueve solo.",
  "Hoy es un día para decir menos y hacer más.",
  "Donde otros ven una caja, nosotros vemos clientes.",
  "El kilo que sale hoy es el cliente que vuelve mañana.",
  "Operar es decidir rápido y bien.",
  "Hoy se vende, mañana se cuenta.",
  "La calidad nunca está de oferta.",
  "Pequeñas cuentas, gran negocio.",
  "Sumamos kilos, sumamos confianza.",
] as const;

export function getMOTD(date = new Date()): string {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86400000);
  return MOTD_LIST[day % MOTD_LIST.length];
}

export function getGreeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 6)  return "Buenas noches, equipo.";
  if (h < 13) return "Buenos días, equipo.";
  if (h < 20) return "Buenas tardes, equipo.";
  return "Buenas noches, equipo.";
}
