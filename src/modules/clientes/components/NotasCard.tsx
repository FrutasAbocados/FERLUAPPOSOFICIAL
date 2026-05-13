import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { confirm } from '@/shared/lib/confirm'
import { toast } from '@/shared/lib/toast'
import { useAddNota, useDeleteNota, useNotas } from '../lib/hooks'

export function NotasCard({ name }: { name: string }) {
  const { data: notas = [] } = useNotas(name)
  const add = useAddNota()
  const del = useDeleteNota()
  const [texto, setTexto] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = texto.trim()
    if (!t) return
    try {
      await add.mutateAsync({ contact_name_canon: name, texto: t })
      setTexto('')
      toast({ title: 'Nota añadida', variant: 'success' })
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'error' })
    }
  }

  const onDelete = async (id: string) => {
    const ok = await confirm({ title: '¿Eliminar nota?', variant: 'danger', confirmLabel: 'Eliminar' })
    if (!ok) return
    try {
      await del.mutateAsync(id)
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'error' })
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
        Notas internas <span className="ml-1 text-[var(--color-ink-3)]">({notas.length})</span>
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <Input
          placeholder="Añadir nota (ej: pidió cambio a 10:00 por ruta)"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="h-8 flex-1 text-sm"
        />
        <Button size="sm" type="submit" disabled={!texto.trim() || add.isPending}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
      {notas.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-[var(--color-ink-3)]">Sin notas todavía</div>
      ) : (
        <ul className="max-h-72 divide-y divide-[var(--color-border)] overflow-y-auto">
          {notas.map((n) => (
            <li key={n.id} className="group flex items-start gap-2 px-3 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="text-[var(--color-ink-2)]">{n.texto}</div>
                <div className="mt-0.5 text-[10px] text-[var(--color-ink-3)] tabular-nums">
                  {format(parseISO(n.created_at), "d LLL yy 'a las' HH:mm", { locale: es })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDelete(n.id)}
                className="rounded-sm p-0.5 text-[var(--color-ink-3)] opacity-0 hover:bg-[var(--color-surface-2)] hover:text-[#dc2626] group-hover:opacity-100"
                title="Eliminar nota"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
