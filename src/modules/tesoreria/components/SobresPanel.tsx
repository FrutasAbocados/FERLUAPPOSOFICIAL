import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { confirm } from '@/shared/lib/confirm'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { useBorrarSobre, useGuardarSobre, useSobres } from '../lib/queries'
import type { SobreResumen } from '../lib/types'

export function SobresPanel({ desde, hasta }: { desde: string; hasta: string }) {
  const sobres = useSobres(desde, hasta)
  const guardar = useGuardarSobre()
  const borrar = useBorrarSobre()
  const [editing, setEditing] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    try {
      await guardar.mutateAsync({ id: editing ?? undefined, nombre })
      setNombre('')
      setEditing(null)
    } catch (err) {
      toast({ variant: 'error', title: 'No se pudo guardar el sobre', description: (err as { code?: string }).code === '23505' ? 'Ya existe un sobre con ese nombre.' : String((err as { message?: string }).message ?? err) })
    }
  }

  async function remove(sobre: SobreResumen) {
    if (!await confirm({ title: 'Eliminar sobre', description: `¿Eliminar el sobre «${sobre.nombre}»?`, variant: 'danger', confirmLabel: 'Eliminar' })) return
    try {
      await borrar.mutateAsync(sobre.id)
    } catch {
      toast({ variant: 'error', title: 'No se pudo eliminar', description: 'Si tiene movimientos, reasígnalos antes de eliminar el sobre.' })
    }
  }

  return (
    <section className="grid gap-2" aria-label="Sobres de Tesorería">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Sobres</h2>
        <form onSubmit={e => { void save(e) }} className="flex flex-wrap items-center gap-2">
          <Input aria-label="Nombre del sobre" value={nombre} maxLength={60} onChange={e => setNombre(e.target.value)} placeholder={editing ? 'Renombrar sobre' : 'Nombre del nuevo sobre'} className="h-8 w-44" required />
          <Button size="sm" disabled={guardar.isPending || !nombre.trim()}>{editing ? 'Guardar' : '+ Sobre'}</Button>
          {editing && <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(null); setNombre('') }}>Cancelar</Button>}
        </form>
      </div>
      <p className="text-xs text-[var(--ink-mute)]">Acumulado total = salidas asignadas − entradas de devolución. Clasificar no genera otro movimiento de caja.</p>
      {sobres.isError ? (
        <div role="alert" className="text-sm text-[var(--coral)]">No se pudieron cargar los sobres. <button onClick={() => { void sobres.refetch() }} className="underline">Reintentar</button></div>
      ) : sobres.isPending ? <p className="text-xs text-[var(--ink-mute)]">Cargando sobres…</p> : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {sobres.data.map(s => (
            <div key={s.id} className="ao-panel px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-[var(--ink)]">{s.nombre}</span>
                <div className="flex gap-2 text-[var(--ink-mute)]">
                  <button aria-label={`Renombrar ${s.nombre}`} onClick={() => { setEditing(s.id); setNombre(s.nombre) }}><Pencil className="h-3.5 w-3.5" /></button>
                  <button aria-label={`Eliminar ${s.nombre}`} disabled={s.movimientos > 0 || borrar.isPending} title={s.movimientos > 0 ? 'Reasigna sus movimientos antes de eliminarlo' : 'Eliminar sobre'} className="disabled:opacity-30" onClick={() => { void remove(s) }}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="tabular-nums text-lg font-semibold text-[var(--mint)]">{euros(s.acumulado)}</div>
              <div className="tabular-nums text-[11px] text-[var(--ink-mute)]">Salidas {euros(s.salidas_total)} · Devoluciones {euros(s.devoluciones_total)}</div>
              <div className="tabular-nums text-[11px] text-[var(--ink-mute)]">Mes seleccionado: {euros(s.neto_periodo)}</div>
            </div>
          ))}
          {sobres.data.length === 0 && <p className="text-xs text-[var(--ink-mute)]">Crea tu primer sobre y asígnalo al crear o editar movimientos.</p>}
        </div>
      )}
    </section>
  )
}
