import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CalendarClock, Loader2, Pencil, Plus, Repeat, Trash2, Zap } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Card } from '@/shared/components/ui/card'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { cn, getBusinessDate } from '@/shared/lib/utils'
import {
  useClientesPedidosWa,
  useDeleteRecurrente,
  useGenerarRecurrentes,
  useRecurrentes,
  useToggleRecurrente,
  useUpsertRecurrente,
  type Recurrente,
  type RecurrenteLinea,
} from '../lib/queries'
import { UNIDAD_LABEL, type Unidad } from '../lib/types'

const DIAS = [
  { iso: 1, label: 'L' },
  { iso: 2, label: 'M' },
  { iso: 3, label: 'X' },
  { iso: 4, label: 'J' },
  { iso: 5, label: 'V' },
  { iso: 6, label: 'S' },
  { iso: 7, label: 'D' },
]

const UNIDADES: Unidad[] = ['caja', 'caja_pequena', 'kg', 'saco', 'bolsa', 'manojo', 'bandeja', 'lecho', 'carton', 'unidad']

export function Recurrentes() {
  const { data: recurrentes, isLoading } = useRecurrentes()
  const generar = useGenerarRecurrentes()
  const [editando, setEditando] = useState<Recurrente | null>(null)
  const [creando, setCreando] = useState(false)

  const onGenerarHoy = async () => {
    const fecha = format(getBusinessDate(), 'yyyy-MM-dd')
    const res = await generar.mutateAsync(fecha)
    const creados = res.filter(r => r.status === 'creado').length
    const yaExistian = res.filter(r => r.status === 'ya_existia').length
    toast({
      title: `${creados} pedido${creados === 1 ? '' : 's'} generado${creados === 1 ? '' : 's'}`,
      description: yaExistian > 0 ? `${yaExistian} ya existían (no duplicados)` : 'Listos en la pestaña "Hoy"',
      variant: 'success',
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--color-ink-3)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando recurrentes…
      </div>
    )
  }

  const lista = recurrentes ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-ink)]">Pedidos recurrentes</h2>
          <p className="text-xs text-[var(--color-ink-3)]">
            Cron diario 06:30 UTC genera los pedidos del día. Puedes adelantarlo manualmente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onGenerarHoy} disabled={generar.isPending}>
            {generar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Generar hoy
          </Button>
          <Button size="sm" onClick={() => setCreando(true)}>
            <Plus className="h-3.5 w-3.5" /> Nuevo recurrente
          </Button>
        </div>
      </div>

      {lista.length === 0 && !creando ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-ink-3)]">
          Aún no hay recurrentes. Crea uno y se generará solo en los días marcados.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {creando && (
            <FormularioRecurrente
              onClose={() => setCreando(false)}
            />
          )}
          {lista.map(r => (
            editando?.id === r.id ? (
              <FormularioRecurrente
                key={r.id}
                inicial={r}
                onClose={() => setEditando(null)}
              />
            ) : (
              <RecurrenteCard
                key={r.id}
                rec={r}
                onEdit={() => setEditando(r)}
              />
            )
          ))}
        </div>
      )}
    </div>
  )
}

function RecurrenteCard({ rec, onEdit }: { rec: Recurrente; onEdit: () => void }) {
  const toggle = useToggleRecurrente()
  const del = useDeleteRecurrente()

  const eliminar = async () => {
    const ok = await confirm({
      title: `¿Eliminar recurrente "${rec.nombre}"?`,
      description: 'No se puede deshacer.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    del.mutate(rec.id, {
      onSuccess: () => toast({ title: 'Eliminado', variant: 'success' }),
      onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
    })
  }

  return (
    <Card className={cn('p-4', !rec.activo && 'opacity-60')}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 shrink-0 text-[var(--color-ink-3)]" />
            <h3 className="truncate font-display font-bold text-[var(--color-ink)]">
              {rec.nombre}
            </h3>
            {!rec.activo && (
              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-zinc-600">
                pausado
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[var(--color-ink-2)]">
            {rec.cliente?.nombre ?? '—'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => toggle.mutate({ id: rec.id, activo: !rec.activo })}
            className={cn(
              'rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              rec.activo
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
            )}
          >
            {rec.activo ? 'activo' : 'inactivo'}
          </button>
          <Button size="sm" variant="ghost" onClick={onEdit} title="Editar">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm" variant="ghost"
            onClick={eliminar}
            disabled={del.isPending}
            className="text-red-600 hover:bg-red-50"
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1">
        {DIAS.map(d => (
          <span
            key={d.iso}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold',
              rec.dias_semana.includes(d.iso)
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-2)] text-[var(--color-ink-3)]',
            )}
            title={['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][d.iso - 1]}
          >
            {d.label}
          </span>
        ))}
      </div>

      <div className="text-xs text-[var(--color-ink-3)]">
        {(rec.lineas ?? []).length} línea{(rec.lineas ?? []).length === 1 ? '' : 's'}
        {rec.ultima_generacion && (
          <span className="ml-2 inline-flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            últ. {rec.ultima_generacion}
          </span>
        )}
      </div>

      {(rec.lineas ?? []).length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-[var(--color-border)] pt-2 text-[11px] text-[var(--color-ink-2)]">
          {rec.lineas!.map(l => (
            <li key={l.id}>
              <span className="font-semibold tabular-nums">{Number(l.cantidad)} {UNIDAD_LABEL[l.unidad as Unidad] ?? l.unidad}</span>
              {' · '}
              {l.producto_normalizado}
              {l.es_gratis && <span className="text-emerald-700"> · GRATIS</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function FormularioRecurrente({ inicial, onClose }: { inicial?: Recurrente; onClose: () => void }) {
  const { data: clientes } = useClientesPedidosWa()
  const upsert = useUpsertRecurrente()

  const [clienteId, setClienteId] = useState(inicial?.cliente_id ?? '')
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [dias, setDias] = useState<number[]>(inicial?.dias_semana ?? [1, 2, 3, 4, 5])
  const [activo, setActivo] = useState(inicial?.activo ?? true)
  const [notas, setNotas] = useState(inicial?.notas_admin ?? '')
  const [lineas, setLineas] = useState<Array<Omit<RecurrenteLinea, 'id' | 'recurrente_id'>>>(
    inicial?.lineas?.map(l => ({
      orden: l.orden,
      producto_normalizado: l.producto_normalizado,
      cantidad: Number(l.cantidad),
      unidad: l.unidad,
      es_gratis: l.es_gratis,
      subseccion: l.subseccion,
      notas: l.notas,
    })) ?? [{ orden: 0, producto_normalizado: '', cantidad: 1, unidad: 'caja', es_gratis: false, subseccion: null, notas: null }],
  )

  const clientesFiltrados = useMemo(
    () => (clientes ?? []).filter(c => c.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [clientes],
  )

  const toggleDia = (d: number) => setDias(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort())
  const updateLinea = (i: number, patch: Partial<typeof lineas[0]>) =>
    setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  const removeLinea = (i: number) => setLineas(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i))
  const addLinea = () => setLineas(prev => [...prev, { orden: prev.length, producto_normalizado: '', cantidad: 1, unidad: 'caja', es_gratis: false, subseccion: null, notas: null }])

  const guardar = async () => {
    if (!clienteId) return toast({ title: 'Falta cliente', variant: 'error' })
    if (!nombre.trim()) return toast({ title: 'Falta nombre', variant: 'error' })
    if (dias.length === 0) return toast({ title: 'Selecciona al menos un día', variant: 'error' })
    const lineasValidas = lineas.filter(l => l.producto_normalizado.trim().length > 0)
    if (lineasValidas.length === 0) return toast({ title: 'Falta al menos una línea', variant: 'error' })
    upsert.mutate(
      {
        id: inicial?.id,
        cliente_id: clienteId,
        nombre: nombre.trim(),
        dias_semana: dias,
        activo,
        notas_admin: notas.trim() || null,
        lineas: lineasValidas.map((l, idx) => ({ ...l, orden: idx })),
      },
      {
        onSuccess: () => { toast({ title: 'Guardado', variant: 'success' }); onClose() },
        onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'error' }),
      },
    )
  }

  return (
    <Card className="border-[var(--color-primary)] p-4 ring-2 ring-[var(--color-primary)]/30">
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-3)]">Cliente</label>
            <select
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className="block h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
            >
              <option value="">— Selecciona —</option>
              {clientesFiltrados.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-3)]">Nombre</label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Pedido lunes" className="h-9" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-3)]">Días</label>
          <div className="flex gap-1">
            {DIAS.map(d => (
              <button
                key={d.iso}
                type="button"
                onClick={() => toggleDia(d.iso)}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                  dias.includes(d.iso)
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-ink-3)] hover:bg-[var(--color-surface-3,#e5e7eb)]',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-3)]">
            Líneas
            <Button size="sm" variant="ghost" onClick={addLinea} className="h-6 text-xs"><Plus className="h-3 w-3" /> Añadir</Button>
          </label>
          <div className="space-y-1">
            {lineas.map((l, i) => (
              <div key={i} className="flex items-center gap-1">
                <Input
                  type="number" step="0.01" min="0"
                  value={l.cantidad}
                  onChange={(e) => updateLinea(i, { cantidad: Number(e.target.value) })}
                  className="h-8 w-16 text-sm tabular-nums"
                />
                <select
                  value={l.unidad}
                  onChange={(e) => updateLinea(i, { unidad: e.target.value })}
                  className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 text-xs"
                >
                  {UNIDADES.map(u => <option key={u} value={u}>{UNIDAD_LABEL[u]}</option>)}
                </select>
                <Input
                  value={l.producto_normalizado}
                  onChange={(e) => updateLinea(i, { producto_normalizado: e.target.value })}
                  placeholder="Producto"
                  className="h-8 flex-1 text-sm"
                />
                <Button size="sm" variant="ghost" onClick={() => removeLinea(i)} className="text-red-600">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-3)]">Notas (opcional)</label>
          <textarea
            value={notas} onChange={(e) => setNotas(e.target.value)}
            rows={2} placeholder=""
            className="block w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4" />
          Activo
        </label>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] pt-3">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={guardar} disabled={upsert.isPending}>
            {upsert.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {inicial ? 'Guardar' : 'Crear'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
