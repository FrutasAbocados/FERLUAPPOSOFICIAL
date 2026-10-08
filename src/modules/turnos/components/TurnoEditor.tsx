import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Modal } from '@/shared/components/Modal'
import { Button } from '@/shared/components/ui/button'
import { SHIFT_META, SHIFT_ORDER, hhmm } from '../lib/shift-meta'
import type { Empleado, ShiftType, Turno } from '../lib/types'

export type TurnoDraft = {
  tipo: ShiftType | null
  hora_inicio: string | null
  hora_fin: string | null
  notas: string | null
}

type Props = {
  empleado: Empleado
  fecha: Date
  turno: Turno | null
  onSave: (draft: TurnoDraft) => void
  onClose: () => void
}

const inputCls =
  'h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm tabular-nums text-[var(--color-ink)]'

export function TurnoEditor({ empleado, fecha, turno, onSave, onClose }: Props) {
  const [tipo, setTipo] = useState<ShiftType | null>(turno?.tipo ?? null)
  const [ini, setIni] = useState(hhmm(turno?.hora_inicio) ?? '')
  const [fin, setFin] = useState(hhmm(turno?.hora_fin) ?? '')
  const [notas, setNotas] = useState(turno?.notas ?? '')

  const elegir = (t: ShiftType) => {
    setTipo(t)
    const m = SHIFT_META[t]
    setIni(m.inicio ?? '')
    setFin(m.fin ?? '')
  }

  return (
    <Modal onClose={onClose} size="sm" ariaLabel="Editar turno">
      <div className="space-y-3 p-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-3)]">
            {format(fecha, "EEEE d 'de' LLLL", { locale: es })}
          </div>
          <div className="text-base font-semibold text-[var(--color-ink)]">{empleado.alias || empleado.nombre}</div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {SHIFT_ORDER.map((t) => {
            const m = SHIFT_META[t]
            const active = tipo === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => elegir(t)}
                className="rounded-md border-2 px-2 py-1.5 text-left text-xs font-bold transition-all"
                style={{
                  background: active ? m.bg : 'transparent',
                  color: active ? m.fg : 'var(--color-ink-2)',
                  borderColor: active ? m.border : 'var(--color-border)',
                }}
              >
                {m.label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] font-semibold uppercase text-[var(--color-ink-3)]">
            Entrada
            <input type="time" value={ini} onChange={(e) => setIni(e.target.value)} className={inputCls} />
          </label>
          <label className="text-[10px] font-semibold uppercase text-[var(--color-ink-3)]">
            Salida
            <input type="time" value={fin} onChange={(e) => setFin(e.target.value)} className={inputCls} />
          </label>
        </div>

        <label className="block text-[10px] font-semibold uppercase text-[var(--color-ink-3)]">
          Nota (la ve el trabajador)
          <input value={notas} onChange={(e) => setNotas(e.target.value)} className={inputCls} placeholder="Opcional" />
        </label>

        <div className="flex justify-between gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!turno}
            onClick={() => onSave({ tipo: null, hora_inicio: null, hora_fin: null, notas: null })}
          >
            Quitar turno
          </Button>
          <Button
            size="sm"
            disabled={!tipo}
            onClick={() => onSave({ tipo, hora_inicio: ini || null, hora_fin: fin || null, notas: notas || null })}
          >
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
