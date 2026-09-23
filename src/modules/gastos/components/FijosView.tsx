import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { euros, eurosShort } from '@/shared/lib/format'
import { confirm } from '@/shared/lib/confirm'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'
import {
  ESTADOS_DATO,
  GRUPOS_RESUMEN,
  PERIODICIDADES,
  computa,
  mensualEquivalente,
  parseImporte,
  resumir,
  totalPeriodo,
  type EstadoDato,
  type Periodicidad,
} from '../lib/calc'
import {
  type Categoria,
  type GastoFijo,
  type GastoFijoInput,
  useActualizarGastoFijo,
  useEliminarGastoFijo,
} from '../lib/queries'
import { GastoFijoModal } from './GastoFijoModal'

type Props = {
  gastos: GastoFijo[]
  categorias: Categoria[]
}

const CELL_INPUT =
  'h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-sm text-[var(--ink)] hover:border-[var(--line)] focus:border-[var(--mint)] focus:bg-[var(--color-surface)] focus:outline-none'

const numStr = (n: number | null) => (n == null ? '' : String(n).replace('.', ','))

function CeldaTexto({ value, onSave, className, placeholder }: {
  value: string
  onSave: (v: string) => void
  className?: string
  placeholder?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft != null && draft.trim() !== value) onSave(draft.trim())
    setDraft(null)
  }
  return (
    <input
      value={draft ?? value}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() }
      }}
      className={cn(CELL_INPUT, className)}
    />
  )
}

function CeldaImporte({ value, onSave, permitirVacio }: {
  value: number | null
  onSave: (v: number | null) => void
  permitirVacio: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft == null) return
    const n = parseImporte(draft)
    setDraft(null)
    if (n == null && !permitirVacio) return onSave(0)
    if (n != null && (!Number.isFinite(n) || n < 0)) {
      toast({ title: 'Importe no válido', variant: 'error' })
      return
    }
    if (n !== value) onSave(n)
  }
  return (
    <input
      inputMode="decimal"
      value={draft ?? numStr(value)}
      placeholder="—"
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() }
      }}
      className={cn(CELL_INPUT, 'mono text-right tabular-nums')}
    />
  )
}

const chipEstado = (e: EstadoDato) => ESTADOS_DATO.find(s => s.value === e)!

export function FijosView({ gastos, categorias }: Props) {
  const actualizar = useActualizarGastoFijo()
  const eliminar = useEliminarGastoFijo()
  const [modal, setModal] = useState<{ gasto: GastoFijo | null; categoriaId?: string | null } | null>(null)

  const hoy = format(new Date(), 'yyyy-MM-dd')
  const catById = useMemo(() => new Map(categorias.map(c => [c.id, c])), [categorias])

  const resumen = useMemo(() => resumir(
    gastos.map(g => ({ ...g, grupo_resumen: (g.categoria_id && catById.get(g.categoria_id)?.grupo_resumen) || 'otros' })),
    hoy,
  ), [gastos, catById, hoy])

  const secciones = useMemo(() => {
    const porCat = new Map<string | null, GastoFijo[]>()
    for (const g of gastos) {
      const k = g.categoria_id && catById.has(g.categoria_id) ? g.categoria_id : null
      porCat.set(k, [...(porCat.get(k) ?? []), g])
    }
    const ordenadas = categorias
      .filter(c => porCat.has(c.id) || (c.activo && c.nombre === 'Otros'))
      .map(c => ({ id: c.id as string | null, nombre: c.nombre, color: c.color, items: porCat.get(c.id) ?? [] }))
    if (porCat.has(null)) ordenadas.push({ id: null, nombre: 'Sin categoría', color: null, items: porCat.get(null)! })
    return ordenadas
  }, [gastos, categorias, catById])

  const pendientes = gastos.filter(g => g.activo && g.estado_dato !== 'confirmado').length

  const guardar = (g: GastoFijo, patch: Partial<GastoFijoInput>) => {
    actualizar.mutate({ id: g.id, patch }, {
      onError: (err) => toast({ title: 'No se pudo guardar', description: errorMessage(err), variant: 'error' }),
    })
  }

  const guardarImporte = (g: GastoFijo, importe: number | null) => {
    const estado_dato: EstadoDato = importe == null
      ? 'pendiente_introducir'
      : g.estado_dato === 'pendiente_introducir' ? 'confirmado' : g.estado_dato
    guardar(g, { importe, estado_dato })
  }

  const borrar = async (g: GastoFijo) => {
    const ok = await confirm({
      title: `¿Eliminar "${g.nombre}"?`,
      description: 'Se borra definitivamente. Si solo deja de pagarse, mejor desactívalo.',
      confirmLabel: 'Eliminar',
      variant: 'danger',
    })
    if (!ok) return
    eliminar.mutate(g.id, {
      onSuccess: () => toast({ title: 'Gasto eliminado', variant: 'success' }),
      onError: (err) => toast({ title: 'No se pudo eliminar', description: errorMessage(err), variant: 'error' }),
    })
  }

  return (
    <div className="space-y-4">
      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <div className="ao-card col-span-2 border-2 border-[var(--mint)] bg-[var(--mint-glow)] p-3 sm:col-span-4 lg:col-span-1">
          <div className="label-caps text-[var(--mint)]">Total fijos / mes</div>
          <div className="mono mt-1 text-xl font-semibold text-[var(--mint)] tabular-nums">{eurosShort(resumen.total)}</div>
        </div>
        {GRUPOS_RESUMEN.map(g => (
          <div key={g.value} className="ao-card p-3">
            <div className="label-caps">{g.label}</div>
            <div className="mono mt-1 text-lg font-semibold text-[var(--ink)] tabular-nums">{eurosShort(resumen.porGrupo[g.value])}</div>
          </div>
        ))}
      </div>

      <div className="ao-card flex flex-wrap items-center justify-between gap-2 p-4">
        <div>
          <div className="label-caps">Total gastos fijos mensuales estimados</div>
          <div className="mt-0.5 text-xs text-[var(--ink-dim)]">
            Activos y vigentes · no mensuales convertidos a equivalente mensual · IVA incluido
            {pendientes > 0 && <> · <span className="text-[var(--amber)]">{pendientes} sin confirmar</span></>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="mono text-3xl font-semibold text-[var(--mint)] tabular-nums">{euros(resumen.total)}</div>
          <Button size="sm" onClick={() => setModal({ gasto: null })}>
            <Plus className="mr-1 h-4 w-4" /> Añadir gasto
          </Button>
        </div>
      </div>

      {/* Listado por categoría */}
      {secciones.map(sec => (
        <section key={sec.id ?? 'none'} className="ao-card overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: sec.color ?? 'var(--ink-mute)' }} />
            <h3 className="text-sm font-semibold text-[var(--ink)]">{sec.nombre}</h3>
            <span className="text-xs text-[var(--ink-mute)]">{sec.items.length}</span>
            <span className="mono ml-auto text-sm font-semibold text-[var(--ink)] tabular-nums">
              {euros(resumen.porCategoria.get(sec.id) ?? 0)}<span className="ml-1 text-xs font-normal text-[var(--ink-mute)]">/mes</span>
            </span>
            <Button size="sm" variant="ghost" title="Añadir gasto en esta categoría" onClick={() => setModal({ gasto: null, categoriaId: sec.id })}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {sec.items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[var(--ink-mute)]">Sin gastos. Usa + para añadir.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--ink-mute)]">
                    <th className="px-2 py-1.5 font-medium">Concepto</th>
                    <th className="px-2 py-1.5 font-medium">Proveedor / persona</th>
                    <th className="w-28 px-2 py-1.5 text-right font-medium">Importe</th>
                    <th className="w-24 px-2 py-1.5 text-right font-medium">Comisión</th>
                    <th className="w-28 px-2 py-1.5 font-medium">Periodo</th>
                    <th className="w-24 px-2 py-1.5 text-right font-medium">Total</th>
                    <th className="w-24 px-2 py-1.5 text-right font-medium">€/mes</th>
                    <th className="w-44 px-2 py-1.5 font-medium">Estado</th>
                    <th className="w-24 px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {sec.items.map(g => {
                    const cuenta = computa(g, hoy)
                    const est = chipEstado(g.estado_dato)
                    return (
                      <tr key={g.id} className={cn('align-middle', !g.activo && 'opacity-50')}>
                        <td className="px-1 py-1"><CeldaTexto value={g.nombre} onSave={(v) => v && guardar(g, { nombre: v })} className="font-medium" /></td>
                        <td className="px-1 py-1"><CeldaTexto value={g.persona ?? ''} placeholder="—" onSave={(v) => guardar(g, { persona: v || null })} className="text-[var(--ink-dim)]" /></td>
                        <td className="px-1 py-1"><CeldaImporte value={g.importe} permitirVacio onSave={(v) => guardarImporte(g, v)} /></td>
                        <td className="px-1 py-1"><CeldaImporte value={g.comision || null} permitirVacio={false} onSave={(v) => guardar(g, { comision: v ?? 0 })} /></td>
                        <td className="px-1 py-1">
                          <select
                            value={g.periodicidad}
                            onChange={(e) => guardar(g, { periodicidad: e.target.value as Periodicidad })}
                            className={cn(CELL_INPUT, 'cursor-pointer')}
                          >
                            {PERIODICIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                          </select>
                        </td>
                        <td className="mono px-2 py-1 text-right tabular-nums text-[var(--ink-dim)]">{g.importe == null ? '—' : euros(totalPeriodo(g))}</td>
                        <td className={cn('mono px-2 py-1 text-right font-semibold tabular-nums', cuenta ? 'text-[var(--ink)]' : 'text-[var(--ink-mute)] line-through')}>
                          {g.importe == null ? '—' : euros(mensualEquivalente(g))}
                        </td>
                        <td className="px-2 py-1">
                          <div className="flex flex-wrap items-center gap-1">
                            <select
                              value={g.estado_dato}
                              onChange={(e) => guardar(g, { estado_dato: e.target.value as EstadoDato })}
                              title="Estado del dato"
                              className={cn('ao-chip cursor-pointer appearance-none border-0', est.chip)}
                            >
                              {ESTADOS_DATO.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                            {g.naturaleza === 'variable' && <span className="ao-chip">Variable</span>}
                            {!g.activo && <span className="ao-chip">Inactivo</span>}
                          </div>
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex justify-end">
                            <Button size="sm" variant="ghost" className="px-2" title={g.activo ? 'Desactivar' : 'Activar'} onClick={() => guardar(g, { activo: !g.activo })}>
                              <Power className={cn('h-3.5 w-3.5', g.activo ? 'text-[var(--mint)]' : 'text-[var(--ink-mute)]')} />
                            </Button>
                            <Button size="sm" variant="ghost" className="px-2" title="Editar todos los campos" onClick={() => setModal({ gasto: g })}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="px-2" title="Eliminar" onClick={() => borrar(g)}>
                              <Trash2 className="h-3.5 w-3.5 text-[var(--coral)]" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {modal && (
        <GastoFijoModal
          gasto={modal.gasto}
          categoriaInicial={modal.categoriaId}
          categorias={categorias}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
