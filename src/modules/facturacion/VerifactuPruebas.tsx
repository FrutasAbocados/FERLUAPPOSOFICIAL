import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/components/ui/button'
import { confirm } from '@/shared/lib/confirm'
import { errorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/lib/toast'

type Status = { enabled: boolean; reasons: string[]; endpoint: string }
type Evento = { id: number; estado: string; created_at: string; http_status: number | null; resumen: { estado_envio?: string; csv?: string; lineas?: Array<{ estado: string; codigo: string; descripcion: string }> } }
const keys = ['facturacion', 'pruebas-a9'] as const

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('verifactu-pruebas', { body })
  if (error) throw error
  if (data?.error) throw new Error(String(data.error))
  return data as T
}

export function VerifactuPruebas({ xmlId, vigente = false }: { xmlId?: number; vigente?: boolean }) {
  const client = useQueryClient()
  const status = useQuery({ queryKey: [...keys, 'status'], queryFn: () => invoke<Status>({ action: 'status' }), staleTime: 30000, retry: false })
  const history = useQuery({
    queryKey: [...keys, 'history', xmlId], enabled: !!xmlId,
    queryFn: async () => {
      const { data, error } = await supabase.from('facturacion_verifactu_envio_prueba_eventos')
        .select('id,estado,created_at,http_status,resumen').eq('xml_id', xmlId!).order('id', { ascending: false }).limit(10)
      if (error) throw error
      return (data ?? []) as Evento[]
    },
  })
  const test = useMutation({ mutationFn: () => invoke<{ok: boolean}>({ action: 'selftest' }), onSuccess: (result) => {
    if (result.ok) toast({ variant: 'success', title: 'Autotest A9 correcto. Sin conexión con AEAT.' })
    else toast({ variant: 'error', title: 'Autotest A9 fallido' })
  }, onError: (e) => toast({ variant: 'error', title: errorMessage(e) }) })
  const send = useMutation({
    mutationFn: () => invoke({ action: 'send', xml_id: xmlId, confirmation: 'ENVIAR SOLO A PRUEBAS AEAT' }),
    onSuccess: () => toast({ variant: 'success', title: 'Intento de pruebas registrado. Consulte el resultado.' }),
    onError: () => toast({ variant: 'error', title: 'Envío bloqueado o resultado incierto. Revise el historial antes de repetir.' }),
    onSettled: () => client.invalidateQueries({ queryKey: keys }),
  })
  const latest = history.data?.[0]
  return <div className="rounded border border-[var(--line)] bg-[var(--panel)] p-2 text-xs text-[var(--ink)]">
    <div className="font-semibold">A9 · Entorno de pruebas AEAT</div>
    <p className="mt-1 text-[var(--ink-mute)]">Simulación técnica. No emite facturas ni consume numeración fiscal.</p>
    {status.isPending && <p>Comprobando controles de envío…</p>}
    {status.isError && <p className="text-amber-500">No se pudo comprobar el backend. Envío bloqueado.</p>}
    {status.data && <p className="mt-1">{status.data.enabled ? 'Transporte de pruebas habilitado' : status.data.reasons.join(' · ')}</p>}
    <div className="mt-2 flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>Autotest sin envío</Button>
      {xmlId && <Button size="sm" disabled={!status.data?.enabled || !vigente || !history.isSuccess || !!latest || send.isPending} onClick={async () => {
        if (await confirm({ title: 'Enviar simulación a pruebas AEAT', description: 'Se remitirá este XML técnico al entorno de preproducción de AEAT. El intento es único y quedará auditado; no se reintentará automáticamente.', confirmLabel: 'Enviar a pruebas' })) send.mutate()
      }}>Enviar XML a pruebas</Button>}
      <Button size="sm" variant="ghost" onClick={() => void client.invalidateQueries({ queryKey: keys })}>Actualizar</Button>
    </div>
    {xmlId && !vigente && <p className="mt-1 text-amber-500">XML obsoleto: envío bloqueado.</p>}
    {history.isError && <p className="mt-1 text-amber-500">Historial no disponible: envío bloqueado.</p>}
    {latest && <div className="mt-2 border-t border-[var(--line)] pt-2">
      <div className="tabular-nums">{latest.estado === 'iniciado' ? 'Intento iniciado, resultado pendiente o incierto. No repetir.' : latest.estado} · {new Date(latest.created_at).toLocaleString('es-ES')}{latest.http_status && ` · HTTP ${latest.http_status}`}</div>
      {latest.resumen.estado_envio && <div>Estado comunicado por AEAT en pruebas: {latest.resumen.estado_envio}</div>}
      {latest.resumen.csv && <div className="font-mono">CSV de pruebas: {latest.resumen.csv}</div>}
      {latest.resumen.lineas?.map((line, i) => <div key={i}>{line.estado} {line.codigo} {line.descripcion}</div>)}
      <div className="text-[var(--ink-mute)]">Un HTTP 200 por sí solo no acredita aceptación. El XML conserva su carácter de simulación.</div>
    </div>}
  </div>
}
