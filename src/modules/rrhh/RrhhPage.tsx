import { useEffect, useMemo, useState } from 'react'
import { HeartHandshake, LockKeyhole, Sparkles, UserRound } from 'lucide-react'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { supabase } from '@/shared/lib/supabase'

type ProfileCategory = 'motivator' | 'communication_preference' | 'support_preference' | 'energizer' | 'friction' | 'strength_candidate' | 'growth_interest'

interface Employee {
  id: string
  nombre: string
  puesto: string | null
}

interface ProfileItem {
  id: string
  employee_id: string
  category: ProfileCategory
  statement: string
  manager_guidance: string | null
  shared_at: string | null
}

interface SharedSummary {
  employee_id: string
  accepted_at: string
}

const CATEGORY_META: Record<ProfileCategory, { label: string; tone: string }> = {
  motivator: { label: 'Qué le mueve', tone: 'text-[var(--amber)]' },
  communication_preference: { label: 'Cómo comunicar', tone: 'text-[oklch(76%_.12_235)]' },
  support_preference: { label: 'Qué apoyo ayuda', tone: 'text-[var(--mint)]' },
  energizer: { label: 'Qué le activa', tone: 'text-[oklch(80%_.15_130)]' },
  friction: { label: 'Fricciones operativas', tone: 'text-[var(--coral)]' },
  strength_candidate: { label: 'Fortalezas reconocidas', tone: 'text-[oklch(75%_.14_310)]' },
  growth_interest: { label: 'Quiere crecer en', tone: 'text-[oklch(76%_.13_195)]' },
}

export function RrhhPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [items, setItems] = useState<ProfileItem[]>([])
  const [shares, setShares] = useState<SharedSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      const [employeesResult, itemsResult, sharesResult] = await Promise.all([
        supabase.from('empleados').select('id,nombre,puesto').eq('activo', true).order('nombre'),
        supabase
          .from('people_coach_profile_items')
          .select('id,employee_id,category,statement,manager_guidance,shared_at')
          .eq('visibility', 'shared_company')
          .eq('employee_confirmed', true)
          .is('revoked_at', null)
          .order('shared_at', { ascending: false }),
        supabase
          .from('people_coach_shares')
          .select('employee_id,accepted_at')
          .is('revoked_at', null)
          .order('accepted_at', { ascending: false }),
      ])
      if (!active) return
      const firstError = employeesResult.error ?? itemsResult.error ?? sharesResult.error
      if (firstError) {
        setError('No se pudo cargar el espacio RRHH.')
      } else {
        const nextEmployees = (employeesResult.data ?? []) as Employee[]
        setEmployees(nextEmployees)
        setItems((itemsResult.data ?? []) as ProfileItem[])
        setShares((sharesResult.data ?? []) as SharedSummary[])
        setSelectedId((current) => current ?? nextEmployees[0]?.id ?? null)
        setError(null)
      }
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [])

  const selected = employees.find((employee) => employee.id === selectedId) ?? null
  const selectedItems = useMemo(() => items.filter((item) => item.employee_id === selectedId), [items, selectedId])
  const lastSharedAt = shares.find((share) => share.employee_id === selectedId)?.accepted_at ?? null

  return (
    <div>
      <PageTopbar title="RRHH" subtitle="Desarrollo humano y colaboración" />
      <div className="ao-page space-y-4">
        <section className="ao-panel flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--mint-glow)] text-[var(--mint)]">
              <HeartHandshake className="h-5 w-5" strokeWidth={1.6} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink)]">Agente de Desarrollo Humano</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--ink-mute)]">
                Una vista práctica para adaptar comunicación, apoyo y crecimiento. No diagnostica, no puntúa personas y no decide sobre empleo o rendimiento.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] font-medium text-[var(--ink-mute)]">
            <LockKeyhole className="h-3 w-3" /> Solo datos confirmados
          </span>
        </section>

        {loading ? (
          <div className="py-16 text-center text-sm text-[var(--ink-mute)]">Cargando perfiles…</div>
        ) : error ? (
          <div className="ao-panel p-5 text-sm text-[var(--coral)]">{error}</div>
        ) : (
          <div className="grid min-h-[540px] gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="ao-panel overflow-hidden p-2">
              <p className="label-caps px-2 pb-2 pt-1">Equipo · {employees.length}</p>
              <div className="max-h-[680px] space-y-1 overflow-y-auto">
                {employees.map((employee) => {
                  const count = items.filter((item) => item.employee_id === employee.id).length
                  const active = employee.id === selectedId
                  return (
                    <button
                      key={employee.id}
                      type="button"
                      onClick={() => setSelectedId(employee.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? 'bg-[var(--mint-glow)]' : 'hover:bg-white/[.03]'}`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${active ? 'bg-[var(--mint)] text-[#0a1310]' : 'bg-[var(--line)] text-[var(--ink-mute)]'}`}>
                        <UserRound className="h-4 w-4" strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-[var(--ink)]">{employee.nombre}</span>
                        <span className="block truncate text-[10px] text-[var(--ink-mute)]">{employee.puesto ?? 'Sin puesto'} · {count} señal{count === 1 ? '' : 'es'}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </aside>

            <main className="ao-panel p-4 sm:p-5">
              {selected ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] pb-4">
                    <div>
                      <h1 className="text-xl font-semibold text-[var(--ink)]">{selected.nombre}</h1>
                      <p className="mt-1 text-xs text-[var(--ink-mute)]">{selected.puesto ?? 'Puesto sin indicar'}</p>
                    </div>
                    <div className="text-right text-[10px] text-[var(--ink-mute)]">
                      <p>{selectedItems.length} elementos confirmados</p>
                      <p className="mt-1">Último resumen: {lastSharedAt ? new Date(lastSharedAt).toLocaleDateString('es-ES') : 'ninguno'}</p>
                    </div>
                  </div>

                  {selectedItems.length === 0 ? (
                    <div className="flex min-h-80 flex-col items-center justify-center text-center">
                      <Sparkles className="h-7 w-7 text-[var(--ink-mute)]" strokeWidth={1.4} />
                      <p className="mt-3 text-sm font-medium text-[var(--ink)]">Aún no hay perfil compartido</p>
                      <p className="mt-1 max-w-md text-xs leading-relaxed text-[var(--ink-mute)]">
                        Aparecerá cuando esta persona confirme voluntariamente alguna señal profesional propuesta después de una charla.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      {(Object.keys(CATEGORY_META) as ProfileCategory[]).map((category) => {
                        const categoryItems = selectedItems.filter((item) => item.category === category)
                        if (!categoryItems.length) return null
                        const meta = CATEGORY_META[category]
                        return (
                          <section key={category} className="rounded-xl border border-[var(--line)] bg-[oklch(16%_.02_165_/_0.55)] p-3.5">
                            <h2 className={`text-[10px] font-semibold uppercase tracking-[.08em] ${meta.tone}`}>{meta.label}</h2>
                            <div className="mt-2 space-y-3">
                              {categoryItems.map((item) => (
                                <article key={item.id}>
                                  <p className="text-sm leading-relaxed text-[var(--ink)]">{item.statement}</p>
                                  {item.manager_guidance && <p className="mt-1 text-xs leading-relaxed text-[var(--ink-mute)]"><strong className="font-medium text-[var(--ink-dim)]">Orientación: </strong>{item.manager_guidance}</p>}
                                  <p className="mt-1.5 text-[9px] font-medium uppercase tracking-wide text-[var(--mint)]">Confirmado por el trabajador</p>
                                </article>
                              ))}
                            </div>
                          </section>
                        )
                      })}
                    </div>
                  )}
                </>
              ) : (
                <p className="py-16 text-center text-sm text-[var(--ink-mute)]">No hay trabajadores activos.</p>
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  )
}
