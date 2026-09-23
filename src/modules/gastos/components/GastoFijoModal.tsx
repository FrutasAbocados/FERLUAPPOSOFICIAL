import { useState } from 'react'
import { X } from 'lucide-react'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { euros } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { errorMessage } from '@/shared/lib/errors'
import {
  ESTADOS_DATO,
  PERIODICIDADES,
  mensualEquivalente,
  parseImporte,
  type EstadoDato,
  type Naturaleza,
  type Periodicidad,
} from '../lib/calc'
import {
  type Categoria,
  type GastoFijo,
  type GastoFijoInput,
  useActualizarGastoFijo,
  useCrearGastoFijo,
} from '../lib/queries'

type Props = {
  gasto?: GastoFijo | null
  categorias: Categoria[]
  categoriaInicial?: string | null
  onClose: () => void
}

const SELECT =
  'h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-ink)]'

const numStr = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))

export function GastoFijoModal({ gasto, categorias, categoriaInicial, onClose }: Props) {
  const crear = useCrearGastoFijo()
  const actualizar = useActualizarGastoFijo()

  const [categoriaId, setCategoriaId] = useState(gasto?.categoria_id ?? categoriaInicial ?? categorias.find(c => c.nombre === 'Otros')?.id ?? '')
  const [nombre, setNombre] = useState(gasto?.nombre ?? '')
  const [persona, setPersona] = useState(gasto?.persona ?? '')
  const [importe, setImporte] = useState(numStr(gasto?.importe))
  const [comision, setComision] = useState(gasto?.comision ? numStr(gasto.comision) : '')
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>(gasto?.periodicidad ?? 'mensual')
  const [naturaleza, setNaturaleza] = useState<Naturaleza>(gasto?.naturaleza ?? 'fijo')
  const [estadoDato, setEstadoDato] = useState<EstadoDato>(gasto?.estado_dato ?? 'confirmado')
  const [fechaInicio, setFechaInicio] = useState(gasto?.fecha_inicio ?? '')
  const [fechaFin, setFechaFin] = useState(gasto?.fecha_fin ?? '')
  const [activo, setActivo] = useState(gasto?.activo ?? true)
  const [notas, setNotas] = useState(gasto?.notas ?? '')

  const importeNum = parseImporte(importe)
  const comisionNum = parseImporte(comision) ?? 0
  const valido = nombre.trim() !== ''
    && (importeNum == null || (Number.isFinite(importeNum) && importeNum >= 0))
    && Number.isFinite(comisionNum) && comisionNum >= 0
    && (!fechaInicio || !fechaFin || fechaFin >= fechaInicio)
  const mensual = valido ? mensualEquivalente({ importe: importeNum, comision: comisionNum, periodicidad }) : 0
  const pending = crear.isPending || actualizar.isPending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valido) {
      toast({ title: 'Revisa concepto, importes y fechas', variant: 'error' })
      return
    }
    const input: GastoFijoInput = {
      nombre: nombre.trim(),
      persona: persona.trim() || null,
      importe: importeNum,
      comision: comisionNum,
      periodicidad,
      naturaleza,
      // Sin importe no puede estar confirmado: queda pendiente de introducir.
      estado_dato: importeNum == null ? 'pendiente_introducir' : estadoDato === 'pendiente_introducir' ? 'confirmado' : estadoDato,
      categoria_id: categoriaId || null,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      activo,
      notas: notas.trim() || null,
      orden: gasto?.orden ?? 999,
    }
    try {
      if (gasto) await actualizar.mutateAsync({ id: gasto.id, patch: input })
      else await crear.mutateAsync(input)
      toast({ title: gasto ? 'Gasto actualizado' : 'Gasto añadido', variant: 'success' })
      onClose()
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: errorMessage(err), variant: 'error' })
    }
  }

  return (
    <Modal onClose={onClose} size="xl" ariaLabel={gasto ? 'Editar gasto fijo' : 'Añadir gasto fijo'}>
      <form onSubmit={submit}>
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--ink)]">{gasto ? 'Editar gasto fijo' : 'Añadir gasto fijo'}</h2>
          <Button type="button" size="sm" variant="ghost" onClick={onClose} aria-label="Cerrar"><X className="h-4 w-4" /></Button>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-2">
          <div>
            <label className="label-caps block">Categoría</label>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={SELECT}>
              {categorias.filter(c => c.activo || c.id === categoriaId).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label-caps block">Concepto</label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej. Holded" className="h-9" autoFocus />
          </div>
          <div>
            <label className="label-caps block">Proveedor / persona (opc)</label>
            <Input value={persona} onChange={(e) => setPersona(e.target.value)} className="h-9" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label-caps block">Importe € (IVA incl.)</label>
              <Input inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="vacío = pendiente" className="h-9 text-right tabular-nums" />
            </div>
            <div>
              <label className="label-caps block">Comisión € (opc)</label>
              <Input inputMode="decimal" value={comision} onChange={(e) => setComision(e.target.value)} placeholder="0" className="h-9 text-right tabular-nums" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label-caps block">Periodicidad</label>
              <select value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value as Periodicidad)} className={SELECT}>
                {PERIODICIDADES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label-caps block">Tipo</label>
              <select value={naturaleza} onChange={(e) => setNaturaleza(e.target.value as Naturaleza)} className={SELECT}>
                <option value="fijo">Fijo</option>
                <option value="variable">Variable</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label-caps block">Estado del dato</label>
              <select value={estadoDato} onChange={(e) => setEstadoDato(e.target.value as EstadoDato)} className={SELECT}>
                {ESTADOS_DATO.filter(s => s.value !== 'pendiente_introducir').map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label-caps block">Estado</label>
              <select value={activo ? '1' : '0'} onChange={(e) => setActivo(e.target.value === '1')} className={SELECT}>
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label-caps block">Fecha inicio (opc)</label>
              <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="label-caps block">Fecha fin (opc)</label>
              <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label-caps block">Observaciones</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-ink)]" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] px-4 py-3">
          <span className="text-xs text-[var(--ink-dim)]">
            Equivalente mensual <span className="mono ml-1 font-semibold text-[var(--mint)] tabular-nums">{euros(mensual)}</span>
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={!valido || pending}>{pending ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
