import { Loader2, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/shared/components/ui/button'
import { useSyncManual, useUltimoSync } from '../lib/queries'
import { toast } from '@/shared/lib/toast'

export function SyncBar() {
  const ultimo = useUltimoSync()
  const sync = useSyncManual()

  async function onSync() {
    try {
      const r = await sync.mutateAsync()
      toast({
        variant: r.ok ? 'success' : 'error',
        title: r.ok ? 'Sync completado' : 'Sync con errores',
        description: `${r.ventas} ventas · ${r.compras} compras · ${r.lineas} líneas`,
      })
    } catch (e) {
      toast({ variant: 'error', title: 'Error de sync', description: e instanceof Error ? e.message : String(e) })
    }
  }

  const last = ultimo.data
  const lastTxt = last
    ? `${last.trigger} · hace ${formatDistanceToNow(new Date(last.started_at), { locale: es })}`
    : 'sin syncs aún'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="text-sm text-[var(--color-ink-2)]">
        <span className="font-medium text-[var(--color-ink)]">Holded → Supabase:</span>{' '}
        {lastTxt}
        {last && !last.ok && <span className="ml-2 text-red-600">⚠ {last.error?.slice(0, 80)}</span>}
      </div>
      <Button onClick={onSync} disabled={sync.isPending} size="sm">
        {sync.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
        Sincronizar ahora
      </Button>
    </div>
  )
}
