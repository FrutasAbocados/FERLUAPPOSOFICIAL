import { useEffect, useState } from 'react'
import { Plus, Search, Trash2, X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { confirm } from '@/shared/lib/confirm'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import {
  useAddAliasCliente,
  useAliasesDe,
  useDeleteAliasCliente,
  useNombresParecidos,
} from '../lib/hooks'
import { eurosShort } from '@/shared/lib/format'

export function AliasesCard({ canon }: { canon: string }) {
  const { data: aliases = [] } = useAliasesDe(canon)
  const add = useAddAliasCliente()
  const del = useDeleteAliasCliente()
  const [open, setOpen] = useState(false)

  const onDelete = async (id: string, alias: string) => {
    const ok = await confirm({
      title: `¿Quitar alias “${alias}”?`,
      description: 'Las facturas con ese nombre raw dejarán de unificarse a este cliente.',
      variant: 'danger',
      confirmLabel: 'Quitar alias',
    })
    if (!ok) return
    try {
      await del.mutateAsync(id)
      toast({ title: 'Alias eliminado', variant: 'success' })
    } catch (e: unknown) {
      toast({ title: 'Error', description: errorMessage(e), variant: 'error' })
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
          Aliases / unificar duplicados <span className="ml-1 text-[var(--color-ink-3)]">({aliases.length})</span>
        </h3>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Unir duplicado
        </Button>
      </div>
      {aliases.length === 0 ? (
        <div className="px-3 py-3 text-xs text-[var(--color-ink-3)]">
          Sin alias. Usa "Unir duplicado" si Holded tiene este cliente con otros nombres distintos.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {aliases.map((a) => (
            <li key={a.id} className="group flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="flex-1 truncate text-[var(--color-ink-2)]">
                {a.alias_from} <span className="text-[var(--color-ink-3)]">→ {a.alias_to}</span>
              </span>
              <button
                type="button"
                onClick={() => onDelete(a.id, a.alias_from)}
                className="rounded-sm p-0.5 text-[var(--color-ink-3)] opacity-0 hover:bg-[var(--color-danger-soft)] hover:text-[var(--coral)] group-hover:opacity-100"
                title="Quitar alias"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <UnirDuplicadoModal canon={canon} onClose={() => setOpen(false)} onAdded={() => add.reset()} />}
    </div>
  )
}

function UnirDuplicadoModal({ canon, onClose, onAdded }: { canon: string; onClose: () => void; onAdded: () => void }) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const { data: candidatos = [], isFetching } = useNombresParecidos(debounced)
  const add = useAddAliasCliente()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250)
    return () => clearTimeout(t)
  }, [q])

  const fusionar = async (alias_from: string) => {
    if (alias_from === canon) {
      toast({ title: 'No puedes fusionarlo consigo mismo', variant: 'error' })
      return
    }
    try {
      await add.mutateAsync({ alias_from, alias_to: canon })
      toast({ title: `“${alias_from}” unificado a “${canon}”`, variant: 'success' })
      onAdded()
      onClose()
    } catch (e: unknown) {
      toast({ title: 'Error', description: errorMessage(e), variant: 'error' })
    }
  }

  return (
    <Modal onClose={onClose} size="lg">
        <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-5 py-3">
          <h2 className="font-display text-base font-bold text-[var(--color-ink)]">
            Unir cliente duplicado a "{canon}"
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)]">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <p className="text-xs text-[var(--color-ink-3)]">
            Busca el nombre tal y como aparece en Holded. Las facturas con ese nombre se unificarán bajo "{canon}".
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-3)]" />
            <Input
              placeholder="Buscar nombre (ej: BAR HOLLYWOOD S.L.)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 pl-8"
              autoFocus
            />
          </div>
          {q.trim().length < 2 ? (
            <div className="text-xs text-[var(--color-ink-3)]">Escribe al menos 2 letras…</div>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-md border border-[var(--color-border)]">
              {isFetching && <div className="px-3 py-3 text-xs text-[var(--color-ink-3)]">Buscando…</div>}
              {!isFetching && candidatos.length === 0 && (
                <div className="px-3 py-3 text-xs text-[var(--color-ink-3)]">Sin coincidencias en Holded</div>
              )}
              {candidatos.map((c) => (
                <button
                  key={c.contact_name}
                  type="button"
                  onClick={() => fusionar(c.contact_name)}
                  disabled={add.isPending || c.contact_name === canon}
                  className="flex w-full items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[var(--color-ink)]">{c.contact_name}</div>
                    <div className="text-[10px] text-[var(--color-ink-3)] tabular-nums">{c.docs} docs · {eurosShort(c.total)}</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-primary-2)]">
                    {c.contact_name === canon ? 'es este' : 'fusionar →'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
    </Modal>
  )
}
