import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { SHIFT_META, horario } from '../lib/shift-meta'
import { turnoKey, type Empleado, type TurnoMap } from '../lib/types'
import { isToday, isoDate } from '../lib/week'

/** Lista de los 7 días de un empleado: tipo, horario y nota. */
export function MiSemanaLista({ days, map, empleadoId }: { days: Date[]; map: TurnoMap; empleadoId: string }) {
  return (
    <div className="space-y-1.5">
      {days.map((d) => {
        const t = map.get(turnoKey(empleadoId, isoDate(d)))
        const meta = t ? SHIFT_META[t.tipo] : null
        const hoy = isToday(d)
        return (
          <div
            key={isoDate(d)}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${hoy ? 'border-[var(--mint)]' : 'border-[var(--line)]'}`}
          >
            <div className="w-12 flex-shrink-0">
              <div className={`text-[10px] font-bold uppercase ${hoy ? 'text-[var(--mint)]' : 'text-[var(--ink-mute)]'}`}>
                {hoy ? 'Hoy' : format(d, 'EEE', { locale: es })}
              </div>
              <div className="text-base font-semibold tabular-nums text-[var(--ink)]">{format(d, 'd')}</div>
            </div>
            <div
              className="flex flex-1 flex-wrap items-baseline gap-x-2 rounded-md px-3 py-1.5 text-sm font-bold"
              style={meta ? { background: meta.bg, color: meta.fg } : { color: 'var(--ink-mute)', background: 'rgba(255,255,255,.03)' }}
            >
              <span>{meta ? meta.label : 'Sin asignar'}</span>
              {horario(t) && <span className="tabular-nums">{horario(t)}</span>}
              {t?.notas && <span className="text-xs font-medium opacity-80">{t.notas}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Rejilla compacta del equipo para una semana, con la fila propia resaltada. */
export function EquipoSemanaTabla({
  days, map, equipo, empleadoId,
}: { days: Date[]; map: TurnoMap; equipo: Empleado[]; empleadoId: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th />
            {days.map((d) => (
              <th key={isoDate(d)} className={`px-1 py-1 text-center font-bold uppercase ${isToday(d) ? 'text-[var(--mint)]' : 'text-[var(--ink-mute)]'}`}>
                {format(d, 'EEEEE', { locale: es })}
                <div className="tabular-nums">{format(d, 'd')}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {equipo.map((e) => (
            <tr key={e.id}>
              <td className={`truncate pr-2 font-semibold ${e.id === empleadoId ? 'text-[var(--mint)]' : 'text-[var(--ink)]'}`}>
                {e.alias || e.nombre}
              </td>
              {days.map((d) => {
                const t = map.get(turnoKey(e.id, isoDate(d)))
                const meta = t ? SHIFT_META[t.tipo] : null
                return (
                  <td
                    key={isoDate(d)}
                    className="h-7 min-w-7 rounded text-center font-bold"
                    style={meta ? { background: meta.bg, color: meta.fg } : { color: 'var(--ink-mute)' }}
                    title={[meta?.label, horario(t)].filter(Boolean).join(' · ')}
                  >
                    {meta ? meta.short : '·'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
