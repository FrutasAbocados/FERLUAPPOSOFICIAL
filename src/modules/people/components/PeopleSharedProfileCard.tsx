import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { EyeOff, LockKeyhole, Pencil, Save, Trash2, UserRoundCheck, X } from 'lucide-react'
import { useAuth } from '@/shared/auth/useAuth'
import { confirm } from '@/shared/lib/confirm'
import { env } from '@/shared/lib/env'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'

type ProfileCategory = 'motivator' | 'communication_preference' | 'support_preference' | 'energizer' | 'friction' | 'strength_candidate' | 'growth_interest'

interface SharedProfileItem {
  id: string
  category: ProfileCategory
  statement: string
  manager_guidance: string | null
  visibility: 'private_employee' | 'shared_company'
  shared_at: string | null
  revoked_at: string | null
}

const CATEGORY_LABELS: Record<ProfileCategory, string> = {
  motivator: 'Qué te mueve',
  communication_preference: 'Cómo comunicar contigo',
  support_preference: 'Qué apoyo te ayuda',
  energizer: 'Qué te activa',
  friction: 'Fricción operativa',
  strength_candidate: 'Fortaleza que reconoces',
  growth_interest: 'Dónde quieres crecer',
}

export function PeopleSharedProfileCard() {
  const { session, user } = useAuth()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [statementDraft, setStatementDraft] = useState('')
  const [guidanceDraft, setGuidanceDraft] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const profileQuery = useQuery({
    queryKey: ['people', 'shared-profile', user?.id] as const,
    enabled: Boolean(user),
    queryFn: async (): Promise<SharedProfileItem[]> => {
      const { data, error } = await supabase
        .from('people_coach_profile_items')
        .select('id,category,statement,manager_guidance,visibility,shared_at,revoked_at')
        .eq('user_id', user!.id)
        .eq('decision', 'approved')
        .order('shared_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as SharedProfileItem[]
    },
  })

  const callAction = async (body: Record<string, unknown>) => {
    if (!session?.access_token) throw new Error('missing_session')
    const response = await fetch(`${env.supabaseUrl}/functions/v1/people-coach`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: env.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error('profile_action_failed')
  }

  const startEdit = (item: SharedProfileItem) => {
    setEditingId(item.id)
    setStatementDraft(item.statement)
    setGuidanceDraft(item.manager_guidance ?? '')
  }

  const saveEdit = async (itemId: string) => {
    const statement = statementDraft.trim()
    if (!statement) {
      toast({ title: 'El texto no puede quedar vacío', variant: 'error' })
      return
    }
    setSavingId(itemId)
    try {
      await callAction({
        action: 'profile_update',
        itemId,
        statement,
        managerGuidance: guidanceDraft.trim() || null,
      })
      await profileQuery.refetch()
      setEditingId(null)
      toast({ title: 'Perfil actualizado', description: 'RRHH verá exactamente el texto guardado.', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo actualizar el perfil', variant: 'error' })
    } finally {
      setSavingId(null)
    }
  }

  const withdraw = async (item: SharedProfileItem) => {
    const accepted = await confirm({
      title: '¿Retirar este elemento de RRHH?',
      description: 'Dejará de estar disponible para RRHH inmediatamente. Esto no deshace lo que alguien ya hubiera leído. Seguirás viéndolo aquí hasta que decidas olvidarlo.',
      confirmLabel: 'Retirar',
      variant: 'danger',
    })
    if (!accepted) return
    setSavingId(item.id)
    try {
      await callAction({ action: 'profile_withdraw', itemId: item.id })
      await profileQuery.refetch()
      toast({ title: 'Elemento retirado', description: 'Ya no está disponible en el perfil de RRHH.', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo retirar el elemento', variant: 'error' })
    } finally {
      setSavingId(null)
    }
  }

  const forget = async (item: SharedProfileItem) => {
    const accepted = await confirm({
      title: '¿Olvidar este elemento para siempre?',
      description: 'Se eliminará todo el texto recuperable. Solo quedará un evento técnico sin contenido personal.',
      confirmLabel: 'Olvidar definitivamente',
      variant: 'danger',
    })
    if (!accepted) return
    setSavingId(item.id)
    try {
      await callAction({ action: 'profile_forget', itemId: item.id })
      await profileQuery.refetch()
      toast({ title: 'Elemento olvidado', description: 'El contenido ya no es recuperable.', variant: 'success' })
    } catch {
      toast({ title: 'No se pudo olvidar el elemento', variant: 'error' })
    } finally {
      setSavingId(null)
    }
  }

  const items = profileQuery.data ?? []
  const activeCount = items.filter((item) => item.visibility === 'shared_company' && !item.revoked_at).length

  return (
    <section className="ao-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--mint-glow)] text-[var(--mint)]">
            <UserRoundCheck className="h-5 w-5" strokeWidth={1.7} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">Mi perfil compartido</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink-mute)]">
              Tú decides el texto exacto que puede ver RRHH. Puedes corregirlo, retirarlo u olvidarlo.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-2.5 py-1 text-[10px] font-medium text-[var(--ink-mute)]">
          <LockKeyhole className="h-3 w-3" /> {activeCount} visible{activeCount === 1 ? '' : 's'}
        </span>
      </div>

      {profileQuery.isLoading ? (
        <p className="mt-4 text-xs text-[var(--ink-mute)]">Cargando tu perfil…</p>
      ) : profileQuery.isError ? (
        <p className="mt-4 text-xs text-[var(--coral)]">No se pudo cargar tu perfil compartido.</p>
      ) : items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-[var(--line)] bg-[oklch(16%_.02_165_/_0.45)] p-3 text-xs leading-relaxed text-[var(--ink-mute)]">
          Aún no has compartido ninguna señal profesional. Nada aparece en RRHH sin tu confirmación.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item) => {
            const active = item.visibility === 'shared_company' && !item.revoked_at
            const editing = editingId === item.id
            return (
              <article key={item.id} className="rounded-xl border border-[var(--line)] bg-[oklch(16%_.02_165_/_0.55)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--mint)]">{CATEGORY_LABELS[item.category]}</p>
                  <span className={`inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide ${active ? 'text-[var(--mint)]' : 'text-[var(--ink-mute)]'}`}>
                    {active ? <UserRoundCheck className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {active ? 'Visible en RRHH' : 'Retirado de RRHH'}
                  </span>
                </div>

                {editing ? (
                  <div className="mt-2 space-y-2">
                    <label className="block text-[10px] text-[var(--ink-mute)]">
                      Lo que quieres compartir
                      <textarea
                        value={statementDraft}
                        maxLength={350}
                        onChange={(event) => setStatementDraft(event.target.value)}
                        className="mt-1 min-h-20 w-full resize-y rounded-lg border border-[var(--line)] bg-[oklch(13%_.018_165)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--mint)]"
                      />
                    </label>
                    <label className="block text-[10px] text-[var(--ink-mute)]">
                      Cómo puede ayudar la empresa · opcional
                      <textarea
                        value={guidanceDraft}
                        maxLength={350}
                        onChange={(event) => setGuidanceDraft(event.target.value)}
                        className="mt-1 min-h-16 w-full resize-y rounded-lg border border-[var(--line)] bg-[oklch(13%_.018_165)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--mint)]"
                      />
                    </label>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingId(null)} className="flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-2 text-xs text-[var(--ink-mute)]">
                        <X className="h-3.5 w-3.5" /> Cancelar
                      </button>
                      <button type="button" disabled={savingId === item.id} onClick={() => void saveEdit(item.id)} className="flex items-center gap-1 rounded-lg bg-[var(--mint)] px-2.5 py-2 text-xs font-semibold text-[oklch(15%_.03_158)] disabled:opacity-50">
                        <Save className="h-3.5 w-3.5" /> Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--ink)]">{item.statement}</p>
                    {item.manager_guidance && <p className="mt-1 text-xs leading-relaxed text-[var(--ink-mute)]"><strong className="font-medium text-[var(--ink-dim)]">Orientación: </strong>{item.manager_guidance}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={Boolean(savingId)} onClick={() => startEdit(item)} className="flex items-center gap-1 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--ink-mute)] disabled:opacity-50">
                        <Pencil className="h-3 w-3" /> Editar
                      </button>
                      {active && (
                        <button type="button" disabled={Boolean(savingId)} onClick={() => void withdraw(item)} className="flex items-center gap-1 rounded-lg border border-[var(--amber)]/30 px-2.5 py-1.5 text-[10px] font-medium text-[var(--amber)] disabled:opacity-50">
                          <EyeOff className="h-3 w-3" /> Retirar de RRHH
                        </button>
                      )}
                      <button type="button" disabled={Boolean(savingId)} onClick={() => void forget(item)} className="flex items-center gap-1 rounded-lg border border-[var(--coral)]/30 px-2.5 py-1.5 text-[10px] font-medium text-[var(--coral)] disabled:opacity-50">
                        <Trash2 className="h-3 w-3" /> Olvidar
                      </button>
                    </div>
                  </>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
