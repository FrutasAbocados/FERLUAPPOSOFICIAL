import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ScrollText, Users } from 'lucide-react'
import { useAuth } from '@/shared/auth/useAuth'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'

interface MisCondiciones {
  empleado_id: string
  nombre: string
  puesto: string | null
  fecha_alta: string | null
  sueldo_base: number | null
  plus_transporte: number | null
  plus_responsabilidad: number | null
  plus_otros: number | null
  plus_otros_concepto: string | null
  jornada_horas_semana: number | null
  jornada_dias_semana: number | null
  horario_entrada: string | null
  horario_salida: string | null
  dias_descanso: string | null
  contrato_tipo: string | null
  fecha_inicio_contrato: string | null
  fecha_fin_contrato: string | null
  vacaciones_dias_anuales: number | null
  texto_libre: string | null
}

const CONTRATO_LABEL: Record<string, string> = {
  indefinido: 'Indefinido',
  temporal: 'Temporal',
  practicas: 'Prácticas',
  autonomo: 'Autónomo',
  otro: 'Otro',
}

const N = (v: number | null | undefined) => Number(v ?? 0)

function fmtFecha(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtHora(t: string | null) {
  if (!t) return '—'
  return t.slice(0, 5) // 'HH:MM:SS' → 'HH:MM'
}

export function CondicionesPage() {
  const { profile } = useAuth()
  const esAdmin = profile?.role === 'admin_full' || profile?.role === 'admin_op'

  const { data, isLoading } = useQuery({
    queryKey: ['mis-condiciones', profile?.id] as const,
    enabled: !!profile?.id && !esAdmin,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MisCondiciones | null> => {
      const { data, error } = await supabase.rpc('mis_condiciones')
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return (row as MisCondiciones) ?? null
    },
  })

  /* ── Vista admin: las condiciones se editan en BBDD ── */
  if (esAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-5 pb-28 md:px-6 md:py-8">
        <Header />
        <div className="ao-panel mt-5 p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--mint-glow)]">
            <Users className="h-6 w-6 text-[var(--mint)]" strokeWidth={1.6} />
          </div>
          <p className="text-sm text-[var(--color-ink-2)]">
            Cada empleado ve aquí sus condiciones laborales en solo lectura.
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-2)]">
            Para editar sueldos, pluses y condiciones de cada trabajador, ve a la BBDD.
          </p>
          <Link
            to="/bbdd-trabajadores"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[var(--mint)] px-3 py-1.5 text-xs font-semibold text-[#0a1310] hover:bg-[var(--mint-2)]"
          >
            <Users className="h-4 w-4" /> Ir a BBDD Trabajadores
          </Link>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-[var(--color-ink-3)]">
        Cargando…
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-5 pb-28 md:px-6 md:py-8">
        <Header />
        <div className="ao-panel mt-5 p-6 text-center text-sm text-[var(--color-ink-2)]">
          No hay condiciones registradas para tu cuenta todavía.
        </div>
      </div>
    )
  }

  const totalMes =
    N(data.sueldo_base) + N(data.plus_transporte) +
    N(data.plus_responsabilidad) + N(data.plus_otros)

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 pb-28 md:px-6 md:py-8">
      <Header />

      {/* Retribución */}
      <section className="ao-panel mt-5 p-4 md:p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">
          Retribución mensual
        </h2>
        <div className="space-y-1.5">
          <Row label="Sueldo base" value={euros(N(data.sueldo_base))} />
          {N(data.plus_transporte) > 0 && (
            <Row label="Plus transporte" value={euros(N(data.plus_transporte))} />
          )}
          {N(data.plus_responsabilidad) > 0 && (
            <Row label="Plus responsabilidad" value={euros(N(data.plus_responsabilidad))} />
          )}
          {N(data.plus_otros) > 0 && (
            <Row
              label={data.plus_otros_concepto || 'Plus productividad (si se cumple objetivo)'}
              value={euros(N(data.plus_otros))}
            />
          )}
          <div className="mt-2 flex items-center justify-between border-t border-[var(--line)] pt-2.5">
            <span className="text-sm font-semibold text-[var(--ink)]">Total bruto/mes</span>
            <span className="text-base font-bold tabular-nums text-[var(--mint)]">
              {euros(totalMes)}
            </span>
          </div>
        </div>
      </section>

      {/* Jornada */}
      <section className="ao-panel mt-4 p-4 md:p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">
          Jornada y horario
        </h2>
        <div className="space-y-1.5">
          <Row
            label="Jornada"
            value={
              data.jornada_horas_semana
                ? `${data.jornada_horas_semana} h/semana${data.jornada_dias_semana ? ` · ${data.jornada_dias_semana} días` : ''}`
                : '—'
            }
          />
          <Row
            label="Horario"
            value={
              data.horario_entrada || data.horario_salida
                ? `${fmtHora(data.horario_entrada)} – ${fmtHora(data.horario_salida)}`
                : '—'
            }
          />
          <Row label="Días de descanso" value={data.dias_descanso || '—'} />
          <Row
            label="Vacaciones anuales"
            value={data.vacaciones_dias_anuales ? `${data.vacaciones_dias_anuales} días` : '—'}
          />
        </div>
      </section>

      {/* Contrato */}
      <section className="ao-panel mt-4 p-4 md:p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">
          Contrato
        </h2>
        <div className="space-y-1.5">
          <Row label="Puesto" value={data.puesto || '—'} />
          <Row
            label="Tipo de contrato"
            value={data.contrato_tipo ? (CONTRATO_LABEL[data.contrato_tipo] ?? data.contrato_tipo) : '—'}
          />
          <Row label="Alta en empresa" value={fmtFecha(data.fecha_alta)} />
          <Row label="Inicio contrato" value={fmtFecha(data.fecha_inicio_contrato)} />
          {data.fecha_fin_contrato && (
            <Row label="Fin contrato" value={fmtFecha(data.fecha_fin_contrato)} />
          )}
        </div>
      </section>

      {data.texto_libre && (
        <section className="ao-panel mt-4 p-4 md:p-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-mute)]">
            Notas
          </h2>
          <p className="whitespace-pre-wrap text-sm text-[var(--color-ink-2)]">{data.texto_libre}</p>
        </section>
      )}

      <p className="mt-4 text-center text-xs text-[var(--ink-mute)]">
        Estas condiciones las fija la empresa. Si ves algo incorrecto, habla con administración.
      </p>
    </div>
  )
}

function Header() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-[var(--mint-glow)]">
        <ScrollText className="h-5 w-5 text-[var(--mint)]" strokeWidth={1.6} />
      </div>
      <div>
        <h1 className="text-lg font-bold text-[var(--ink)]">Mis condiciones</h1>
        <p className="text-xs text-[var(--ink-mute)]">Tu retribución, jornada y contrato</p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-[var(--color-ink-2)]">{label}</span>
      <span className="text-sm font-medium tabular-nums text-[var(--ink)]">{value}</span>
    </div>
  )
}
