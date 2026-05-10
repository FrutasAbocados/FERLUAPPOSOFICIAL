import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// El "día de negocio" no cambia a las 00:00 — Ferlu trabaja hasta las 02-03h.
// Antes de las 10:00 seguimos siendo el día anterior.
export function getBusinessDate(): Date {
  const now = new Date()
  if (now.getHours() < 10) {
    const prev = new Date(now)
    prev.setDate(prev.getDate() - 1)
    return prev
  }
  return now
}
