import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { useCreateEmpleado } from '../lib/queries'

export function AddEmpleadoForm() {
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [alias, setAlias] = useState('')
  const create = useCreateEmpleado()

  const reset = () => {
    setNombre('')
    setAlias('')
    setOpen(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = nombre.trim()
    if (!n) return
    await create.mutateAsync({ nombre: n, alias: alias.trim() || null })
    reset()
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        Nuevo empleado
      </Button>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
    >
      <Input
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre"
        className="h-9 w-40"
        required
      />
      <Input
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
        placeholder="Alias (opcional)"
        className="h-9 w-36"
      />
      <Button type="submit" size="sm" disabled={create.isPending || !nombre.trim()}>
        {create.isPending ? 'Guardando…' : 'Guardar'}
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={reset} aria-label="Cancelar">
        <X className="h-4 w-4" />
      </Button>
      {create.error && (
        <p className="basis-full text-xs text-[var(--color-danger)]">
          {(create.error as Error).message}
        </p>
      )}
    </form>
  )
}
