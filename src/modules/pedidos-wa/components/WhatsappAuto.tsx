import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clipboard,
  Loader2,
  Phone,
  RefreshCw,
  Save,
  Send,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { cn, getBusinessDate } from '@/shared/lib/utils'
import {
  useActualizarWhatsappFila,
  useCrearPedido,
  useCrearWhatsappMensajeManual,
  useProcesarWhatsappPendientes,
  useTodosLosClientesPedidos,
  useVincularTelefonoWhatsapp,
  useWhatsappFilas,
  useWhatsappMensajes,
  useWhatsappTelefonos,
  type WhatsappFila,
  type WhatsappMensaje,
} from '../lib/queries'
import { parsearPedido } from '../lib/parser'
import type { ClientePedido } from '../lib/types'

const HEADER = ['CLIENTE', 'HORARIO', 'FACTURA', 'PEDIDO', 'FALTAS', 'REPARTO']

export function WhatsappAuto() {
  const [fecha, setFecha] = useState(() => format(getBusinessDate(), 'yyyy-MM-dd'))
  const { data: filas = [], isLoading: loadingFilas, error: errorFilas } = useWhatsappFilas(fecha)
  const { data: mensajes = [], isLoading: loadingMensajes } = useWhatsappMensajes(fecha)
  const { data: telefonos = [] } = useWhatsappTelefonos()
  const { data: clientes = [] } = useTodosLosClientesPedidos()
  const procesar = useProcesarWhatsappPendientes()

  const filasOrdenadas = useMemo(
    () => [...filas].sort((a, b) => {
      const ha = a.cliente?.horario ?? ''
      const hb = b.cliente?.horario ?? ''
      if (ha !== hb) return ha.localeCompare(hb)
      return (a.cliente?.nombre ?? '').localeCompare(b.cliente?.nombre ?? '')
    }),
    [filas],
  )

  const sinCliente = useMemo(() => {
    const map = new Map<string, WhatsappMensaje[]>()
    for (const m of mensajes) {
      if (m.cliente_id) continue
      const arr = map.get(m.telefono_norm) ?? []
      arr.push(m)
      map.set(m.telefono_norm, arr)
    }
    return [...map.entries()].map(([telefono, rows]) => ({ telefono, rows }))
  }, [mensajes])

  const stats = useMemo(() => ({
    filas: filas.length,
    listos: filas.filter(f => f.estado === 'listo').length,
    revisar: filas.filter(f => f.estado === 'revisar' || f.estado === 'error').length,
    mensajes: mensajes.length,
    sinCliente: sinCliente.length,
    telefonos: telefonos.filter(t => t.activo).length,
  }), [filas, mensajes.length, sinCliente.length, telefonos])

  const copyRows = async (includeHeader: boolean) => {
    const tsv = buildTsv(filasOrdenadas, includeHeader)
    if (!tsv.trim()) {
      toast({ title: 'Sin filas para copiar', variant: 'error' })
      return
    }
    await navigator.clipboard.writeText(tsv)
    toast({ title: includeHeader ? 'Tabla copiada' : 'Filas copiadas', variant: 'success' })
  }

  const onProcesar = () => {
    procesar.mutate(fecha, {
      onSuccess: () => toast({ title: 'WhatsApps procesados', variant: 'success' }),
      onError: (err) => toast({ title: 'Error procesando', description: errorMessage(err), variant: 'error' }),
    })
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-[var(--mint)]" />
            <h2 className="text-lg font-medium tracking-[-0.01em] text-[var(--ink)]">
              WhatsApp automatico
            </h2>
          </div>
          <p className="mono mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--ink-mute)]">
            {stats.mensajes} mensajes · {stats.filas} filas · {stats.revisar} revisar · {stats.telefonos} telefonos
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-8 w-[150px] text-xs"
          />
          <Button size="sm" variant="secondary" onClick={onProcesar} disabled={procesar.isPending}>
            {procesar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Procesar IA
          </Button>
          <Button size="sm" variant="outline" onClick={() => void copyRows(false)} disabled={filasOrdenadas.length === 0}>
            <Clipboard className="h-3.5 w-3.5" />
            Copiar filas
          </Button>
          <Button size="sm" onClick={() => void copyRows(true)} disabled={filasOrdenadas.length === 0}>
            <Clipboard className="h-3.5 w-3.5" />
            Copiar tabla
          </Button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Listos" value={stats.listos} tone="mint" />
        <StatCard label="Revisar" value={stats.revisar} tone="amber" />
        <StatCard label="Sin cliente" value={stats.sinCliente} tone="coral" />
        <StatCard label="Mensajes" value={stats.mensajes} tone="sky" />
      </div>

      <ManualBox fecha={fecha} clientes={clientes.filter(c => c.activo)} />

      {sinCliente.length > 0 && (
        <SinClientePanel
          fecha={fecha}
          grupos={sinCliente}
          clientes={clientes.filter(c => c.activo)}
          loading={loadingMensajes}
        />
      )}

      <section className="ao-card p-0">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2">
          <div className="label-caps">Formato pegable</div>
          <div className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-mute)]">
            {stats.listos}/{stats.filas} listos
          </div>
        </div>

        {loadingFilas ? (
          <div className="flex items-center gap-2 p-4 text-sm text-[var(--ink-mute)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
          </div>
        ) : errorFilas ? (
          <div className="p-4 text-sm text-[var(--coral)]">
            {errorMessage(errorFilas)}
          </div>
        ) : filasOrdenadas.length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--ink-mute)]">
            Sin filas generadas para esta fecha.
          </div>
        ) : (
          <WhatsappTable fecha={fecha} filas={filasOrdenadas} />
        )}
      </section>

      <MensajesPanel mensajes={mensajes} loading={loadingMensajes} />
    </div>
  )
}

function ManualBox({ fecha, clientes }: { fecha: string; clientes: ClientePedido[] }) {
  const [texto, setTexto] = useState('')
  const [clienteId, setClienteId] = useState('')
  const crearManual = useCrearWhatsappMensajeManual()
  const procesar = useProcesarWhatsappPendientes()

  const split = useMemo(() => splitClienteYPedido(texto), [texto])
  const sugerido = useMemo(
    () => matchCliente(split.cliente, clientes),
    [clientes, split.cliente],
  )
  const effectiveClienteId = clienteId || sugerido?.id || ''

  const onEnviar = async () => {
    const cliente = clientes.find(c => c.id === effectiveClienteId)
    if (!cliente) {
      toast({ title: 'Elige cliente', description: 'Pon "CLIENTE: pedido" o selecciona el cliente.', variant: 'error' })
      return
    }
    const pedidoTexto = (split.pedido || texto).trim()
    if (!pedidoTexto) {
      toast({ title: 'Pedido vacío', variant: 'error' })
      return
    }
    try {
      await crearManual.mutateAsync({ fecha, cliente_id: cliente.id, texto: pedidoTexto })
      await procesar.mutateAsync(fecha)
      setTexto('')
      setClienteId('')
      toast({ title: `${cliente.nombre} enviado a WA auto`, variant: 'success' })
    } catch (err) {
      toast({ title: 'No se pudo procesar', description: errorMessage(err), variant: 'error' })
    }
  }

  return (
    <section className="ao-card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-[var(--mint)]" />
            <h3 className="text-base font-medium text-[var(--ink)]">Box manual</h3>
          </div>
          <p className="mono mt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--ink-mute)]">
            Pega un pedido de WhatsApp · revisa en WA auto · pasa a Hoy
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={effectiveClienteId}
            onChange={(e) => setClienteId(e.currentTarget.value)}
            className="h-8 min-w-[220px] rounded-[var(--radius)] border border-[var(--line)] bg-[rgba(255,255,255,.02)] px-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--mint)]"
          >
            <option value="">{sugerido ? sugerido.nombre : 'Cliente...'}</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={() => void onEnviar()}
            disabled={!texto.trim() || crearManual.isPending || procesar.isPending}
          >
            {(crearManual.isPending || procesar.isPending) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            Enviar a WA auto
          </Button>
        </div>
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.currentTarget.value)}
        placeholder="AZURA BEACH: 1 kg tom pera / 1 perejil / 1 ajo pelado"
        rows={3}
        className="min-h-[96px] w-full resize-y rounded-[var(--radius)] border border-[var(--line)] bg-[rgba(255,255,255,.018)] px-3 py-2 text-sm leading-relaxed text-[var(--ink)] outline-none placeholder:text-[var(--ink-mute)] focus:border-[var(--mint)] focus:shadow-[0_0_0_4px_var(--mint-glow)]"
      />
      {sugerido && !clienteId ? (
        <div className="mt-2 text-xs text-[var(--ink-mute)]">
          Cliente detectado: <span className="font-semibold uppercase text-[var(--mint)]">{sugerido.nombre}</span>
        </div>
      ) : null}
    </section>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'mint' | 'amber' | 'coral' | 'sky' }) {
  const toneClass = {
    mint: 'text-[var(--mint)]',
    amber: 'text-[var(--amber)]',
    coral: 'text-[var(--coral)]',
    sky: 'text-[var(--sky)]',
  }[tone]
  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[rgba(255,255,255,.018)] px-3 py-2">
      <div className="label-caps">{label}</div>
      <div className={cn('mono mt-1 text-xl font-semibold tabular-nums', toneClass)}>{value}</div>
    </div>
  )
}

function WhatsappTable({ fecha, filas }: { fecha: string; filas: WhatsappFila[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1300px] w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] bg-[rgba(255,255,255,.035)] text-left">
            {HEADER.map(h => (
              <th key={h} className="px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--ink)]">
                {h}
              </th>
            ))}
            <th className="w-[110px] px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--ink)]">
              Estado
            </th>
            <th className="w-[120px] px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--ink)]">
              Hoy
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {filas.map(row => (
            <WhatsappRow key={row.id} fecha={fecha} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WhatsappRow({ fecha, row }: { fecha: string; row: WhatsappFila }) {
  const actualizar = useActualizarWhatsappFila()
  const crearPedido = useCrearPedido()
  const cliente = row.cliente
  const estadoTone = row.estado === 'listo'
    ? 'border-[var(--mint-glow)] text-[var(--mint)]'
    : row.estado === 'error'
      ? 'border-[oklch(70%_.18_25_/_0.35)] text-[var(--coral)]'
      : 'border-[oklch(80%_.16_85_/_0.35)] text-[var(--amber)]'

  const commit = (patch: Parameters<typeof actualizar.mutate>[0]['patch']) => {
    actualizar.mutate(
      { id: row.id, fecha, patch },
      { onError: (err) => toast({ title: 'No se pudo guardar', description: errorMessage(err), variant: 'error' }) },
    )
  }

  const pasarAHoy = async () => {
    if (!cliente) {
      toast({ title: 'Sin cliente', variant: 'error' })
      return
    }
    if (!row.pedido.trim()) {
      toast({ title: 'Pedido vacío', variant: 'error' })
      return
    }
    try {
      const parsed = await parsearPedido(row.pedido, cliente.nombre)
      const result = await crearPedido.mutateAsync({
        cliente_id: cliente.id,
        fecha,
        texto_original: row.pedido,
        notas_admin: parsed.notasAdmin,
        faltas: row.faltas,
        lineas: parsed.lineas,
      })
      await actualizar.mutateAsync({
        id: row.id,
        fecha,
        patch: { pedido_id: result.pedido_id, estado: 'listo' },
      })
      toast({ title: `${cliente.nombre} ya está en Hoy`, variant: 'success' })
    } catch (err) {
      toast({ title: 'No se pudo pasar a Hoy', description: errorMessage(err), variant: 'error' })
    }
  }

  return (
    <tr className={cn(row.estado !== 'listo' && 'bg-[oklch(30%_.08_65_/_0.12)]')}>
      <td className="w-[190px] px-3 py-2 align-top">
        <div className="font-semibold uppercase text-[var(--ink)]">{cliente?.nombre ?? 'Sin cliente'}</div>
      </td>
      <td className="w-[90px] px-3 py-2 align-top mono text-[13px] text-[var(--ink)] tabular-nums">
        {cliente?.horario ?? ''}
      </td>
      <td className="w-[100px] px-3 py-2 align-top font-semibold text-[var(--ink)]">
        {facturaLabel(cliente?.tipo_factura)}
      </td>
      <td className="min-w-[430px] px-3 py-2 align-top">
        <textarea
          defaultValue={row.pedido}
          onBlur={(e) => {
            const value = e.currentTarget.value.trim()
            if (value !== row.pedido) commit({ pedido: value, estado: row.estado === 'error' ? 'revisar' : row.estado })
          }}
          rows={3}
          className="min-h-[74px] w-full resize-y rounded-[var(--radius)] border border-transparent bg-transparent px-2 py-1 font-semibold leading-snug text-[var(--ink)] outline-none focus:border-[var(--mint)] focus:bg-[rgba(255,255,255,.025)]"
        />
      </td>
      <td className="min-w-[300px] px-3 py-2 align-top">
        <textarea
          defaultValue={row.faltas ?? ''}
          onBlur={(e) => {
            const value = e.currentTarget.value.trim() || null
            if (value !== (row.faltas ?? null)) commit({ faltas: value })
          }}
          rows={3}
          className="min-h-[74px] w-full resize-y rounded-[var(--radius)] border border-transparent bg-transparent px-2 py-1 leading-snug text-[var(--ink-dim)] outline-none focus:border-[var(--mint)] focus:bg-[rgba(255,255,255,.025)]"
        />
        {row.error ? <div className="mt-1 text-xs text-[var(--coral)]">{row.error}</div> : null}
      </td>
      <td className="w-[110px] px-3 py-2 align-top font-semibold text-[var(--ink)]">
        {cliente?.repartidor ?? ''}
      </td>
      <td className="w-[110px] px-3 py-2 align-top">
        <select
          value={row.estado}
          onChange={(e) => commit({ estado: e.currentTarget.value as WhatsappFila['estado'] })}
          className={cn(
            'h-8 rounded-[var(--radius)] border bg-[rgba(255,255,255,.02)] px-2 text-xs font-semibold outline-none',
            estadoTone,
          )}
        >
          <option value="listo">LISTO</option>
          <option value="revisar">REVISAR</option>
          <option value="pendiente">PEND.</option>
          <option value="error">ERROR</option>
        </select>
        {row.confianza != null ? (
          <div className="mono mt-1 text-[10px] text-[var(--ink-mute)] tabular-nums">
            {Math.round(row.confianza * 100)}%
          </div>
        ) : null}
      </td>
      <td className="w-[120px] px-3 py-2 align-top">
        <Button
          size="sm"
          variant={row.pedido_id ? 'outline' : 'secondary'}
          onClick={() => void pasarAHoy()}
          disabled={!!row.pedido_id || crearPedido.isPending || actualizar.isPending || !row.pedido.trim()}
          className="h-8 w-full text-xs"
        >
          {row.pedido_id ? <CheckCircle2 className="h-3.5 w-3.5" /> : (crearPedido.isPending || actualizar.isPending) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
          {row.pedido_id ? 'En Hoy' : 'Pasar'}
        </Button>
      </td>
    </tr>
  )
}

function SinClientePanel({
  fecha,
  grupos,
  clientes,
  loading,
}: {
  fecha: string
  grupos: Array<{ telefono: string; rows: WhatsappMensaje[] }>
  clientes: ClientePedido[]
  loading: boolean
}) {
  const [selected, setSelected] = useState<Record<string, string>>({})
  const vincular = useVincularTelefonoWhatsapp()
  const procesar = useProcesarWhatsappPendientes()

  const onVincular = (telefono: string) => {
    const clienteId = selected[telefono]
    if (!clienteId) {
      toast({ title: 'Elige cliente', variant: 'error' })
      return
    }
    vincular.mutate(
      { fecha, telefono, cliente_id: clienteId },
      {
        onSuccess: () => {
          procesar.mutate(fecha)
          toast({ title: 'Telefono vinculado', variant: 'success' })
        },
        onError: (err) => toast({ title: 'Error vinculando', description: errorMessage(err), variant: 'error' }),
      },
    )
  }

  return (
    <section className="ao-card p-0">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--amber)]" />
          <div className="label-caps">Telefonos sin cliente</div>
        </div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-[var(--ink-mute)]" /> : null}
      </div>
      <div className="divide-y divide-[var(--line)]">
        {grupos.map(({ telefono, rows }) => {
          const first = rows[0]
          return (
            <div key={telefono} className="grid gap-2 px-3 py-2 md:grid-cols-[180px_1fr_280px_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-1 font-semibold text-[var(--ink)]">
                  <Phone className="h-3.5 w-3.5 text-[var(--ink-mute)]" />
                  {telefono}
                </div>
                <div className="truncate text-xs text-[var(--ink-mute)]">{first?.perfil_nombre ?? 'Sin nombre'}</div>
              </div>
              <div className="truncate text-sm text-[var(--ink-dim)]">{first?.texto ?? first?.message_type ?? ''}</div>
              <select
                value={selected[telefono] ?? ''}
                onChange={(e) => setSelected(s => ({ ...s, [telefono]: e.currentTarget.value }))}
                className="h-8 rounded-[var(--radius)] border border-[var(--line)] bg-[rgba(255,255,255,.02)] px-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--mint)]"
              >
                <option value="">Cliente...</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onVincular(telefono)}
                disabled={vincular.isPending}
              >
                <Save className="h-3.5 w-3.5" />
                Vincular
              </Button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function MensajesPanel({ mensajes, loading }: { mensajes: WhatsappMensaje[]; loading: boolean }) {
  return (
    <section className="ao-card p-0">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
        <div className="label-caps">Entrada WhatsApp</div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-[var(--ink-mute)]" /> : null}
      </div>
      {mensajes.length === 0 ? (
        <div className="p-4 text-sm text-[var(--ink-mute)]">Sin mensajes.</div>
      ) : (
        <div className="max-h-72 divide-y divide-[var(--line)] overflow-y-auto">
          {mensajes.slice(0, 80).map(m => (
            <div key={m.id} className="grid gap-2 px-3 py-2 text-sm md:grid-cols-[150px_180px_1fr_110px]">
              <div className="mono text-[11px] text-[var(--ink-mute)] tabular-nums">
                {format(new Date(m.received_at), 'HH:mm:ss')}
              </div>
              <div className="truncate font-semibold uppercase text-[var(--ink)]">
                {m.cliente?.nombre ?? m.perfil_nombre ?? m.telefono_norm}
              </div>
              <div className="truncate text-[var(--ink-dim)]">{m.texto ?? m.message_type}</div>
              <MensajeEstado estado={m.estado} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function MensajeEstado({ estado }: { estado: WhatsappMensaje['estado'] }) {
  const listo = estado === 'procesado'
  const warn = estado === 'sin_cliente' || estado === 'sin_texto'
  return (
    <span className={cn(
      'inline-flex h-6 items-center justify-center gap-1 rounded-[var(--radius)] border px-2 text-[10px] font-semibold uppercase tracking-[0.08em]',
      listo && 'border-[var(--mint-glow)] text-[var(--mint)]',
      warn && 'border-[oklch(80%_.16_85_/_0.35)] text-[var(--amber)]',
      estado === 'error' && 'border-[oklch(70%_.18_25_/_0.35)] text-[var(--coral)]',
      estado === 'recibido' && 'border-[var(--line)] text-[var(--ink-mute)]',
    )}>
      {listo ? <CheckCircle2 className="h-3 w-3" /> : null}
      {estado.replace('_', ' ')}
    </span>
  )
}

function buildTsv(filas: WhatsappFila[], includeHeader: boolean) {
  const rows = filas.map(row => {
    const cliente = row.cliente
    const faltas = [
      row.faltas ?? '',
      row.estado === 'revisar' ? 'REVISAR' : '',
      row.estado === 'error' ? `ERROR: ${row.error ?? 'IA'}` : '',
    ].filter(Boolean).join(' / ')
    return [
      cliente?.nombre ?? '',
      cliente?.horario ?? '',
      facturaLabel(cliente?.tipo_factura),
      row.pedido,
      faltas,
      cliente?.repartidor ?? '',
    ].map(safeCell).join('\t')
  })
  return (includeHeader ? [HEADER.join('\t'), ...rows] : rows).join('\n')
}

function facturaLabel(tipo?: ClientePedido['tipo_factura']) {
  if (tipo === 'NINGUNA') return 'NADA'
  return tipo ?? ''
}

function safeCell(value: string) {
  return value.replace(/\t/g, ' ').replace(/\r?\n/g, ' ').trim()
}

function splitClienteYPedido(texto: string): { cliente: string; pedido: string } {
  const trimmed = texto.trim()
  const idx = trimmed.indexOf(':')
  if (idx > 0) {
    return {
      cliente: trimmed.slice(0, idx).trim(),
      pedido: trimmed.slice(idx + 1).trim(),
    }
  }
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length <= 1) return { cliente: '', pedido: trimmed }
  return { cliente: lines[0], pedido: lines.slice(1).join('\n') }
}

function matchCliente(raw: string, clientes: ClientePedido[]): ClientePedido | null {
  const q = normalizarTexto(raw)
  if (q.length < 2) return null
  let best: { cliente: ClientePedido; score: number } | null = null
  for (const cliente of clientes) {
    const n = normalizarTexto(cliente.nombre_normalizado || cliente.nombre)
    const score = n === q
      ? 100
      : n.startsWith(q)
        ? 80 - Math.max(0, n.length - q.length)
        : n.includes(q)
          ? 50 - Math.max(0, n.length - q.length)
          : 0
    if (score > 0 && (!best || score > best.score)) best = { cliente, score }
  }
  return best?.cliente ?? null
}

function normalizarTexto(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}
