import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, MessageCircle } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { supabase } from '@/shared/lib/supabase'
import { toast } from '@/shared/lib/toast'
import { fechaMadrid, horaMadrid, isoAMadridLocal, madridLocalARpc } from '../lib/fichajeHora'
import { KEY_MIS_INCIDENCIAS } from '../lib/fichajesKeys'

interface Incidencia {
  id: string
  ts_in: string
  estado: 'pendiente' | 'avisado'
  salida_propuesta: string | null
  avisado_at: string | null
}

/**
 * Fichajes propios apartados por olvido de salida. El trabajador indica a qué hora
 * salió y avisa a Álvaro: queda constancia en la app, llega un push a administración
 * y se abre su WhatsApp con el mensaje escrito.
 */
export function FichajeIncidenciasAviso() {
  const lista = useQuery({
    queryKey: KEY_MIS_INCIDENCIAS,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Incidencia[]> => {
      const { data, error } = await supabase.rpc('trabajadores_fichajes_mis_incidencias')
      if (error) throw error
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id ?? ''),
        ts_in: String(r.ts_in ?? ''),
        estado: r.estado === 'avisado' ? 'avisado' : 'pendiente',
        salida_propuesta: r.salida_propuesta == null ? null : String(r.salida_propuesta),
        avisado_at: r.avisado_at == null ? null : String(r.avisado_at),
      }))
    },
  })
  const [abierta, setAbierta] = useState<Incidencia | null>(null)

  if (!lista.data?.length) return null

  return (
    <div className="space-y-1.5">
      {lista.data.map((i) => (
        <div
          key={i.id}
          className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
          style={{ borderColor: 'oklch(75% .15 70 / .35)', background: 'oklch(30% .07 70 / .25)' }}
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--amber, #f5b74a)' }} />
          <div className="min-w-0 flex-1 text-xs text-[var(--ink)]">
            <div className="font-semibold">
              {fechaMadrid(i.ts_in)}: entrada {horaMadrid(i.ts_in)} sin salida
            </div>
            <div className="text-[var(--ink-mute)]">
              {i.estado === 'avisado' && i.salida_propuesta
                ? `Avisado · salida ${horaMadrid(i.salida_propuesta)} · pendiente de Álvaro`
                : 'Ese día no cuenta hasta que Álvaro lo corrija'}
            </div>
          </div>
          <Button size="sm" variant={i.estado === 'avisado' ? 'outline' : 'primary'} onClick={() => setAbierta(i)}>
            <MessageCircle className="h-3.5 w-3.5" />
            {i.estado === 'avisado' ? 'Reenviar' : 'Avisar a Álvaro'}
          </Button>
        </div>
      ))}
      {abierta && <AvisarAlvaroModal incidencia={abierta} onClose={() => setAbierta(null)} />}
    </div>
  )
}

function AvisarAlvaroModal({ incidencia, onClose }: { incidencia: Incidencia; onClose: () => void }) {
  const qc = useQueryClient()
  const entradaLocal = isoAMadridLocal(incidencia.ts_in)
  const [salida, setSalida] = useState(
    incidencia.salida_propuesta ? isoAMadridLocal(incidencia.salida_propuesta) : entradaLocal,
  )
  const [comentario, setComentario] = useState('')
  const [whatsapp, setWhatsapp] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)

  const avisar = useMutation({
    mutationFn: async () => {
      if (salida <= entradaLocal) throw new Error('La salida tiene que ser posterior a la entrada')
      const { data, error } = await supabase.rpc('trabajadores_fichaje_avisar_alvaro', {
        p_incidencia_id: incidencia.id,
        p_salida_local: madridLocalARpc(salida),
        p_comentario: comentario.trim() || null,
      })
      if (error) throw error
      return data as { telefono: string | null; texto: string }
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: KEY_MIS_INCIDENCIAS })
      setEnviado(true)
      setWhatsapp(r.telefono ? `https://wa.me/${r.telefono}?text=${encodeURIComponent(r.texto)}` : null)
    },
    onError: (e) => toast({ title: 'No se pudo avisar', description: (e as Error).message, variant: 'error' }),
  })

  return (
    <Modal onClose={onClose} size="sm" ariaLabel="Avisar a Álvaro">
      <div className="space-y-3 p-5">
        <h3 className="font-display text-lg font-bold text-[var(--ink)]">Avisar a Álvaro</h3>
        {!enviado ? (
          <>
            <p className="text-xs text-[var(--ink-mute)]">
              El {fechaMadrid(incidencia.ts_in)} fichaste la entrada a las {horaMadrid(incidencia.ts_in)} y no la
              salida. Indica a qué hora saliste; Álvaro lo revisará y lo corregirá.
            </p>
            <label className="block">
              <span className="text-xs font-medium text-[var(--ink-dim)]">Hora de salida</span>
              <Input type="datetime-local" value={salida} min={entradaLocal} onChange={(e) => setSalida(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[var(--ink-dim)]">Comentario (opcional)</span>
              <Input type="text" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ej. se me olvidó al terminar el reparto" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={() => avisar.mutate()} disabled={avisar.isPending || salida <= entradaLocal}>
                {avisar.isPending ? 'Enviando…' : 'Enviar aviso'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="flex items-start gap-2 text-sm text-[var(--ink)]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--mint)]" />
              Aviso registrado. A Álvaro le ha llegado una notificación en la app.
            </p>
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                onClick={onClose}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] text-sm font-semibold text-[#06210f]"
              >
                <MessageCircle className="h-4 w-4" /> Enviar también por WhatsApp
              </a>
            ) : (
              <p className="text-xs text-[var(--ink-mute)]">El WhatsApp de Álvaro aún no está configurado en la app.</p>
            )}
            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>Cerrar</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
