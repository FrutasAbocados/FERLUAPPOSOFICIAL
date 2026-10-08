import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from '@/shared/lib/toast'
import { ESTADOS_COLA_ACTIVOS, useColaCompras } from '../lib/compras-cola'

/**
 * Barra fina sobre cualquier pantalla mientras el servidor procesa una tanda
 * de facturas de proveedor. Al terminar avisa con un toast (el push al móvil
 * lo manda el servidor).
 */
export function ColaComprasBarra() {
  const { data } = useColaCompras()
  const cola = useMemo(() => data ?? [], [data])
  const activas = cola.filter((it) => ESTADOS_COLA_ACTIVOS.includes(it.estado)).length
  const total = cola.length
  const hechas = total - activas
  const habiaActivas = useRef(false)

  useEffect(() => {
    if (activas > 0) { habiaActivas.current = true; return }
    if (!habiaActivas.current) return
    habiaActivas.current = false
    const ok = cola.filter((it) => it.estado === 'ok').length
    const revisar = cola.filter((it) => it.estado === 'revisar').length
    const fallos = cola.filter((it) => it.estado === 'error').length
    toast({
      title: 'Tanda de facturas terminada',
      description: [
        `${ok} subidas a Holded`,
        revisar > 0 ? `${revisar} para revisar` : null,
        fallos > 0 ? `${fallos} con error` : null,
      ].filter(Boolean).join(' · '),
      variant: fallos > 0 ? 'error' : undefined,
    })
  }, [activas, cola])

  if (activas === 0) return null
  const pct = total > 0 ? Math.round((hechas / total) * 100) : 0
  return (
    <Link
      to="/pedidos-wa?tab=compras-prov"
      className="block border-b border-[var(--line)] bg-[var(--color-panel)] px-4 py-1.5 text-xs text-[var(--ink-dim)] no-underline"
    >
      <div className="flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--mint)]" />
        <span className="tabular-nums">Facturas de proveedor · {hechas}/{total}</span>
        <span className="ml-auto hidden sm:inline">sigue aunque salgas de la app</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,.06)]">
        <div className="h-full bg-[var(--mint)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </Link>
  )
}
