import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Loader2, Plus, Search, Trash2, Users, X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { useAuth } from '@/shared/auth/useAuth'

type Resumen = {
  empleado_id: string
  nombre: string
  num_clientes: number
  facturacion_mes: number
  comision: number
}

type Detalle = {
  contact_id: string
  nombre: string
  facturacion: number
  comision: number
  asignado_desde: string | null
  comision_pct: number
}

type ContactoOpt = { id: string; nombre: string }

const eur = euros

function useResumen(mesISO: string) {
  return useQuery({
    queryKey: ['colab-resumen', mesISO] as const,
    queryFn: async (): Promise<Resumen[]> => {
      const { data, error } = await supabase.rpc('trabajadores_colaboraciones_resumen_mes', { p_mes: mesISO })
      if (error) throw error
      return (data ?? []).map((r: Resumen) => ({
        ...r,
        num_clientes: Number(r.num_clientes),
        facturacion_mes: Number(r.facturacion_mes),
        comision: Number(r.comision),
      }))
    },
  })
}

function useDetalle(empleadoId: string | null, mesISO: string) {
  return useQuery({
    queryKey: ['colab-detalle', empleadoId, mesISO] as const,
    enabled: !!empleadoId,
    queryFn: async (): Promise<Detalle[]> => {
      const { data, error } = await supabase.rpc('trabajadores_colaboraciones_detalle_mes', {
        p_empleado: empleadoId,
        p_mes: mesISO,
      })
      if (error) throw error
      return (data ?? []).map((r: Detalle) => ({
        ...r,
        facturacion: Number(r.facturacion),
        comision: Number(r.comision),
        comision_pct: Number(r.comision_pct ?? 5),
      }))
    },
  })
}

function useBuscarContactos(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: ['colab-contactos', q] as const,
    enabled: q.length >= 2,
    queryFn: async (): Promise<ContactoOpt[]> => {
      const { data, error } = await supabase
        .from('manager_contactos')
        .select('id, nombre')
        .ilike('nombre', `%${q}%`)
        .order('nombre')
        .limit(15)
      if (error) throw error
      return (data ?? []).map((r) => ({ id: String(r.id), nombre: String(r.nombre) }))
    },
  })
}

function useAsignar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { empleado_id: string; contact_id: string }) => {
      const { data: u } = await supabase.auth.getUser()
      const { error } = await supabase.from('trabajadores_clientes_asignados').insert({
        empleado_id: input.empleado_id,
        contact_id: input.contact_id,
        creado_por: u.user?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['colab-resumen'] })
      qc.invalidateQueries({ queryKey: ['colab-detalle'] })
    },
  })
}

function useDesasignar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { empleado_id: string; contact_id: string }) => {
      const { error } = await supabase
        .from('trabajadores_clientes_asignados')
        .delete()
        .eq('empleado_id', input.empleado_id)
        .eq('contact_id', input.contact_id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['colab-resumen'] })
      qc.invalidateQueries({ queryKey: ['colab-detalle'] })
    },
  })
}

function useActualizarComision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { empleadoId: string; contactId: string; porcentaje: number }) => {
      const { error } = await supabase
        .from('trabajadores_clientes_asignados')
        .update({ comision_pct: input.porcentaje })
        .eq('empleado_id', input.empleadoId)
        .eq('contact_id', input.contactId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['colab-resumen'] })
      qc.invalidateQueries({ queryKey: ['colab-detalle'] })
    },
  })
}

export function ColaboradoresView() {
  const { profile } = useAuth()
  const mesISO = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const { data, isLoading } = useResumen(mesISO)
  const [selected, setSelected] = useState<Resumen | null>(null)
  const canManage = profile?.role === 'admin_full' || profile?.role === 'admin_op'

  const totalComision = useMemo(
    () => (data ?? []).reduce((s, r) => s + r.comision, 0),
    [data],
  )

  return (
    <section className="ao-card mb-5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--color-primary-2)]" />
          <h2 className="text-sm font-semibold text-[var(--color-ink)]">Colaboradores</h2>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">Total mes</div>
          <div className="font-display text-base font-bold tabular-nums text-[var(--mint)]">{eur(totalComision)}</div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      )}

      <ul className="grid gap-2 md:grid-cols-2">
        {data?.map((r) => (
          <li key={r.empleado_id}>
            <button
              onClick={() => setSelected(r)}
              className="grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-left transition hover:border-[var(--color-primary)]"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold text-[var(--color-ink)]">{r.nombre}</div>
                <div className="text-xs text-[var(--color-ink-3)]">
                  {r.num_clientes} cliente(s) · facturación {eur(r.facturacion_mes)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-base font-bold tabular-nums text-[var(--mint)]">{eur(r.comision)}</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">Comisión</div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <DetalleModal
          empleado={selected}
          mesISO={mesISO}
          canManage={canManage}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  )
}

function DetalleModal({ empleado, mesISO, canManage, onClose }: { empleado: Resumen; mesISO: string; canManage: boolean; onClose: () => void }) {
  const { data: detalle, isLoading } = useDetalle(empleado.empleado_id, mesISO)
  const desasignar = useDesasignar()
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const { data: opts } = useBuscarContactos(search)
  const asignar = useAsignar()
  const actualizarComision = useActualizarComision()

  const yaAsignados = useMemo(() => new Set((detalle ?? []).map((d) => d.contact_id)), [detalle])

  const submitAsignar = (c: ContactoOpt) => {
    asignar.mutate(
      { empleado_id: empleado.empleado_id, contact_id: c.id },
      {
        onSuccess: () => {
          toast({ title: 'Cliente asignado', description: c.nombre, variant: 'success' })
          setSearch('')
        },
        onError: (e) => toast({ title: 'No se pudo asignar', description: e instanceof Error ? e.message : '', variant: 'error' }),
      },
    )
  }

  const submitDesasignar = async (d: Detalle) => {
    const ok = await confirm({
      title: '¿Quitar cliente?',
      description: `${d.nombre} dejará de contar para ${empleado.nombre}.`,
      confirmLabel: 'Quitar',
      variant: 'danger',
    })
    if (!ok) return
    desasignar.mutate(
      { empleado_id: empleado.empleado_id, contact_id: d.contact_id },
      {
        onError: (e) => toast({ title: 'No se pudo quitar', description: e instanceof Error ? e.message : '', variant: 'error' }),
      },
    )
  }

  return (
    <Modal onClose={onClose} size="lg">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-2xl border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">{empleado.nombre}</h2>
            <p className="text-xs text-[var(--color-ink-3)]">
              {format(new Date(mesISO), "LLLL yyyy", { locale: es })} · {empleado.num_clientes} cliente(s) · {eur(empleado.facturacion_mes)} → <span className="ao-text-success font-semibold">{eur(empleado.comision)}</span>
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">Clientes asignados</h3>
              {canManage && !showAdd && (
                <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Asignar cliente
                </Button>
              )}
            </div>

            {showAdd && (
              <div className="mb-3 space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-[var(--color-ink-3)]" />
                  <Input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar cliente (mín. 2 letras)…"
                    className="h-8 flex-1"
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setSearch('') }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {opts && opts.length > 0 && (
                  <ul className="max-h-60 divide-y divide-[var(--color-border)] overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
                    {opts.map((o) => {
                      const ya = yaAsignados.has(o.id)
                      return (
                        <li key={o.id}>
                          <button
                            disabled={ya || asignar.isPending}
                            onClick={() => submitAsignar(o)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                          >
                            <span className="truncate text-[var(--color-ink)]">{o.nombre}</span>
                            {ya ? (
                              <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">ya asignado</span>
                            ) : (
                              <Plus className="h-3.5 w-3.5 text-[var(--color-primary-2)]" />
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}

            {isLoading && <p className="text-sm text-[var(--color-ink-3)]">Cargando…</p>}
            {detalle && detalle.length === 0 && !isLoading && (
              <p className="text-sm text-[var(--color-ink-3)]">Sin clientes asignados todavía.</p>
            )}

            {detalle && detalle.length > 0 && (
              <ul className="space-y-1">
                {detalle.map((d) => (
                  <li key={d.contact_id} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
                    <span className="truncate text-[var(--color-ink)]">{d.nombre}</span>
                    <span className="tabular-nums text-[var(--color-ink-3)]">{eur(d.facturacion)}</span>
                    <span className="ao-text-success tabular-nums font-semibold">{eur(d.comision)}</span>
                    {canManage ? (
                      <ComisionInput
                        detalle={d}
                        empleadoId={empleado.empleado_id}
                        pending={actualizarComision.isPending}
                        onSave={(porcentaje) => actualizarComision.mutate(
                          { empleadoId: empleado.empleado_id, contactId: d.contact_id, porcentaje },
                          { onError: (error) => toast({ title: 'No se pudo cambiar la comisión', description: error instanceof Error ? error.message : '', variant: 'error' }) },
                        )}
                      />
                    ) : (
                      <span className="text-xs tabular-nums text-[var(--color-ink-3)]">{d.comision_pct}%</span>
                    )}
                    {canManage ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => submitDesasignar(d)}
                        disabled={desasignar.isPending}
                        title="Quitar cliente"
                        className="ao-text-danger ao-hover-danger h-7 w-7 shrink-0 p-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : <span className="w-7" />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
    </Modal>
  )
}

function ComisionInput({
  detalle,
  empleadoId,
  pending,
  onSave,
}: {
  detalle: Detalle
  empleadoId: string
  pending: boolean
  onSave: (porcentaje: number) => void
}) {
  const [value, setValue] = useState(String(detalle.comision_pct))
  const commit = () => {
    const porcentaje = Number(value)
    if (!Number.isFinite(porcentaje) || porcentaje <= 0 || porcentaje > 100) {
      setValue(String(detalle.comision_pct))
      return
    }
    if (porcentaje !== detalle.comision_pct) onSave(porcentaje)
  }
  return (
    <div className="relative w-16">
      <Input
        aria-label={`Comisión de ${detalle.nombre} para ${empleadoId}`}
        type="number"
        min="0.01"
        max="100"
        step="0.25"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
        disabled={pending}
        className="h-7 pr-5 text-right text-xs tabular-nums"
      />
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--ink-mute)]">%</span>
    </div>
  )
}
