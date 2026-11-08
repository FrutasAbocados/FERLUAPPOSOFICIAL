import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'
import { fechaMadrid, horaMadrid, isoAMadridLocal, madridLocalARpc } from '../lib/fichajeHora'

interface IncidenciaAdmin {
  id: string
  empleado_nombre: string
  tipo: string
  estado: string
  ts_in: string
  salida_propuesta: string | null
  comentario_trabajador: string | null
  avisado_at: string | null
  resuelta_at: string | null
  resolucion_motivo: string | null
}

const KEY = (todas: boolean) => ['fichajes', 'incidencias', todas ? 'todas' : 'abiertas'] as const

/**
 * Bandeja de administración: fichajes apartados por olvido de salida.
 * Confirmar exige hora real y motivo; el fichaje vuelve al registro como «corregido»
 * y todo queda en el historial.
 */
export function FichajesIncidenciasPanel() {
  const [todas, setTodas] = useState(false)
  const lista = useQuery({
    queryKey: KEY(todas),
    refetchInterval: 60_000,
    queryFn: async (): Promise<IncidenciaAdmin[]> => {
      const { data, error } = await supabase.rpc('trabajadores_fichajes_incidencias_admin', { p_solo_abiertas: !todas })
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id ?? ''),
        empleado_nombre: String(r.empleado_nombre ?? ''),
        tipo: String(r.tipo ?? ''),
        estado: String(r.estado ?? ''),
        ts_in: String(r.ts_in ?? ''),
        salida_propuesta: r.salida_propuesta == null ? null : String(r.salida_propuesta),
        comentario_trabajador: r.comentario_trabajador == null ? null : String(r.comentario_trabajador),
        avisado_at: r.avisado_at == null ? null : String(r.avisado_at),
        resuelta_at: r.resuelta_at == null ? null : String(r.resuelta_at),
        resolucion_motivo: r.resolucion_motivo == null ? null : String(r.resolucion_motivo),
      }))
    },
  })

  const filas = lista.data ?? []
  const abiertas = filas.filter(i => i.estado === 'pendiente' || i.estado === 'avisado')
  if (!todas && abiertas.length === 0) {
    return (
      <div className="flex justify-end">
        <button type="button" className="text-[11px] text-[var(--color-ink-3)] hover:underline" onClick={() => setTodas(true)}>
          Ver historial de incidencias
        </button>
      </div>
    )
  }

  return (
    <section className="ao-card p-0">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" style={{ color: 'var(--amber, #f5b74a)' }} />
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">
            Incidencias de fichaje <span className="tabular-nums text-[var(--color-ink-3)]">({abiertas.length} abiertas)</span>
          </h3>
        </div>
        <button type="button" className="text-[11px] text-[var(--color-ink-3)] hover:underline" onClick={() => setTodas(v => !v)}>
          {todas ? 'Solo abiertas' : 'Ver historial'}
        </button>
      </header>
      <p className="border-b border-[var(--color-border)] px-4 py-1.5 text-[11px] text-[var(--color-ink-3)]">
        Fichajes sin salida. No cuentan horas hasta que confirmes la hora real con el trabajador. Todo cambio queda registrado con su motivo.
      </p>
      <ul className="divide-y divide-[var(--color-border)]">
        {filas.map(i => <IncidenciaFila key={i.id} i={i} />)}
      </ul>
    </section>
  )
}

function IncidenciaFila({ i }: { i: IncidenciaAdmin }) {
  const qc = useQueryClient()
  const abierta = i.estado === 'pendiente' || i.estado === 'avisado'
  const entradaLocal = isoAMadridLocal(i.ts_in)
  const [salida, setSalida] = useState(i.salida_propuesta ? isoAMadridLocal(i.salida_propuesta) : '')
  const [motivo, setMotivo] = useState('')

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['fichajes'] })
  }

  const resolver = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('trabajadores_fichaje_incidencia_resolver', {
        p_incidencia_id: i.id, p_salida_local: madridLocalARpc(salida), p_motivo: motivo,
      })
      if (error) throw error
    },
    onSuccess: () => { invalidar(); toast({ title: 'Fichaje corregido', variant: 'success' }) },
    onError: (e) => toast({ title: 'No se pudo corregir', description: (e as Error).message, variant: 'error' }),
  })
  const descartar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('trabajadores_fichaje_incidencia_descartar', {
        p_incidencia_id: i.id, p_motivo: motivo,
      })
      if (error) throw error
    },
    onSuccess: () => { invalidar(); toast({ title: 'Incidencia descartada', variant: 'success' }) },
    onError: (e) => toast({ title: 'No se pudo descartar', description: (e as Error).message, variant: 'error' }),
  })

  const estadoTxt: Record<string, string> = {
    pendiente: 'sin avisar', avisado: 'avisado', corregida: 'corregida', descartada: 'descartada',
  }

  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
        <span className="font-semibold text-[var(--color-ink)]">{i.empleado_nombre}</span>
        <span className="tabular-nums text-[var(--color-ink-2)]">{fechaMadrid(i.ts_in)} · entrada {horaMadrid(i.ts_in)}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${abierta ? 'ao-text-warning' : 'text-[var(--color-ink-3)]'}`}>
          {i.tipo === 'prueba_sistema' ? 'prueba del sistema' : estadoTxt[i.estado] ?? i.estado}
        </span>
      </div>
      {i.salida_propuesta && (
        <div className="text-[11px] text-[var(--color-ink-3)] tabular-nums">
          El trabajador dice que salió a las {horaMadrid(i.salida_propuesta)}
          {fechaMadrid(i.salida_propuesta) !== fechaMadrid(i.ts_in) ? ` del ${fechaMadrid(i.salida_propuesta)}` : ''}
          {i.comentario_trabajador ? ` · «${i.comentario_trabajador}»` : ''}
        </div>
      )}
      {!abierta && i.resolucion_motivo && (
        <div className="text-[11px] text-[var(--color-ink-3)]">{i.resolucion_motivo}</div>
      )}
      {abierta && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr_auto]">
          <Input type="datetime-local" value={salida} min={entradaLocal} onChange={(e) => setSalida(e.target.value)} aria-label="Hora real de salida" />
          <Input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (obligatorio), ej. confirmado con el trabajador" />
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => resolver.mutate()} disabled={!salida || salida <= entradaLocal || !motivo.trim() || resolver.isPending}>
              <Check className="h-3.5 w-3.5" /> Confirmar
            </Button>
            <Button size="sm" variant="outline" onClick={() => descartar.mutate()} disabled={!motivo.trim() || descartar.isPending} title="No se trabajó o no se puede saber la hora">
              <X className="h-3.5 w-3.5" /> Descartar
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
