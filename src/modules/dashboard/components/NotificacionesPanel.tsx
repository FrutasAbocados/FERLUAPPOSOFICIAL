import { Bell, Calendar, CheckCircle2, MessageSquare, Star, ThumbsUp, X, XCircle } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useNotificaciones, useMarcarLeida, useMarcarTodasLeidas, type Notificacion, type NotificacionTipo } from '../lib/notificaciones'

const ICONOS: Record<string, { Icon: typeof Bell; color: string; bg: string }> = {
  vacaciones_solicitada: { Icon: Calendar,      color: 'text-amber-700',   bg: 'bg-amber-100' },
  vacaciones_aprobada:   { Icon: CheckCircle2,  color: 'text-emerald-700', bg: 'bg-emerald-100' },
  vacaciones_denegada:   { Icon: XCircle,       color: 'text-red-700',     bg: 'bg-red-100' },
  puntos_dia:            { Icon: Star,          color: 'text-yellow-700',  bg: 'bg-yellow-100' },
  tarea_completada:      { Icon: CheckCircle2,  color: 'text-emerald-700', bg: 'bg-emerald-100' },
  motivacion_ia:         { Icon: ThumbsUp,      color: 'text-blue-700',    bg: 'bg-blue-100' },
  penalizacion_ia:       { Icon: MessageSquare, color: 'text-orange-700',  bg: 'bg-orange-100' },
  neutral_ia:            { Icon: MessageSquare, color: 'text-slate-700',   bg: 'bg-slate-100' },
}

function iconoPara(tipo: NotificacionTipo) {
  return ICONOS[tipo] ?? { Icon: Bell, color: 'text-slate-700', bg: 'bg-slate-100' }
}

export function NotificacionesPanel() {
  const { data, isLoading } = useNotificaciones()
  const marcarLeida = useMarcarLeida()
  const marcarTodas = useMarcarTodasLeidas()

  if (isLoading || !data || data.length === 0) return null

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-2)]">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-ink)]">Notificaciones</h2>
            <p className="text-xs text-[var(--color-ink-3)]">{data.length} sin leer</p>
          </div>
        </div>
        {data.length > 1 && (
          <button
            type="button"
            onClick={() => marcarTodas.mutate(data.map(n => n.id))}
            disabled={marcarTodas.isPending}
            className="text-xs font-medium text-[var(--color-primary-2)] hover:underline disabled:opacity-50"
          >
            Marcar todas
          </button>
        )}
      </header>

      <ul className="space-y-1.5">
        {data.map(n => (
          <NotifItem key={n.id} n={n} onClose={() => marcarLeida.mutate(n.id)} />
        ))}
      </ul>
    </section>
  )
}

function NotifItem({ n, onClose }: { n: Notificacion; onClose: () => void }) {
  const { Icon, color, bg } = iconoPara(n.tipo)
  const cuando = (() => {
    try { return formatDistanceToNow(parseISO(n.created_at), { locale: es, addSuffix: true }) }
    catch { return '' }
  })()

  return (
    <li className="group flex items-start gap-3 rounded-lg border border-transparent px-2 py-2 transition hover:border-[var(--color-border)] hover:bg-[var(--color-surface-2,_#fafafa)]">
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${bg}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium text-[var(--color-ink)]">{n.titulo}</p>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--color-ink-3)]">{cuando}</span>
        </div>
        {n.cuerpo && (
          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-ink-2,_#525252)]">{n.cuerpo}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Marcar leída"
        className="shrink-0 rounded p-1 text-[var(--color-ink-3)] opacity-0 transition hover:bg-slate-100 hover:text-[var(--color-ink)] group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}
