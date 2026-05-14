import { useEffect, useMemo, useState } from 'react'
import { addDays, format, formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarClock, ChevronDown, Clock, Phone, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { toast } from '@/shared/lib/toast'
import type { ClientePrograma, ScoreBreakdown } from '@/shared/lib/clientes-segmentacion'
import {
  type ClienteProgramaRow,
  useClientePrograma,
  useMarcarClienteContacto,
  useSetClientePrograma,
} from '../lib/hooks'

type ProgramaClienteInput = {
  contact_name_canon: string
  programa: ClientePrograma
  programaLabel: string
  accionSugerida: string
  loyaltyScore: number
  scoreBreakdown?: ScoreBreakdown
}

const VALID_PROGRAMA_VALUES: ReadonlyArray<ClientePrograma> = ['vip', 'a', 'b', 'c', 'atencion']

const PROGRAMA_OPTIONS: Array<{ value: '' | ClientePrograma; label: string }> = [
  { value: '', label: 'Automático' },
  { value: 'vip', label: 'VIP' },
  { value: 'a', label: 'Clase A' },
  { value: 'b', label: 'Clase B' },
  { value: 'c', label: 'Clase C' },
  { value: 'atencion', label: 'Atención' },
]

const PROG_CFG: Record<ClientePrograma, { icon: string; bg: string; accent: string; border: string; scoreColor: string }> = {
  vip:      { icon: '⭐', bg: 'oklch(38% .10 158 / .28)',  accent: 'var(--mint)',     border: 'oklch(78% .14 158 / .35)', scoreColor: 'var(--mint)' },
  a:        { icon: '✓',  bg: 'oklch(28% .12 235 / .22)',  accent: 'var(--sky)',      border: 'oklch(76% .12 235 / .35)', scoreColor: 'var(--sky)' },
  b:        { icon: '📈', bg: 'oklch(30% .12 70 / .22)',   accent: 'var(--amber)',    border: 'oklch(78% .16 70 / .35)',  scoreColor: 'var(--amber)' },
  c:        { icon: '·',  bg: 'rgba(255,255,255,.03)',      accent: 'var(--ink-dim)',  border: 'var(--line-2)',            scoreColor: 'var(--ink-dim)' },
  atencion: { icon: '⚡', bg: 'oklch(28% .14 25 / .28)',   accent: 'var(--coral)',    border: 'oklch(70% .18 25 / .35)',  scoreColor: 'var(--coral)' },
}

type Form = {
  programa_manual: '' | ClientePrograma
  estado: ClienteProgramaRow['estado']
  prioridad: ClienteProgramaRow['prioridad']
  proxima_accion: string
  proxima_accion_fecha: string
  notas: string
}

const empty: Form = {
  programa_manual: '',
  estado: 'activo',
  prioridad: 'media',
  proxima_accion: '',
  proxima_accion_fecha: '',
  notas: '',
}

function toForm(row: ClienteProgramaRow | null | undefined): Form {
  if (!row) return empty
  const pm = row.programa_manual
  return {
    programa_manual: pm != null && VALID_PROGRAMA_VALUES.includes(pm as ClientePrograma) ? (pm as ClientePrograma) : '',
    estado: row.estado,
    prioridad: row.prioridad,
    proxima_accion: row.proxima_accion ?? '',
    proxima_accion_fecha: row.proxima_accion_fecha ?? '',
    notas: row.notas ?? '',
  }
}

export function ProgramaFidelizacionCard({ cliente }: { cliente: ProgramaClienteInput }) {
  const { data: programa } = useClientePrograma(cliente.contact_name_canon)
  const setPrograma = useSetClientePrograma()
  const marcarContacto = useMarcarClienteContacto()
  const [form, setForm] = useState<Form>(empty)
  const [dirty, setDirty] = useState(false)
  const [scoreAnim, setScoreAnim] = useState(0)
  const [showBreakdown, setShowBreakdown] = useState(false)

  useEffect(() => {
    setForm(toForm(programa))
    setDirty(false)
  }, [cliente.contact_name_canon, programa?.updated_at])

  useEffect(() => {
    setScoreAnim(0)
    const t = setTimeout(() => setScoreAnim(cliente.loyaltyScore), 80)
    return () => clearTimeout(t)
  }, [cliente.loyaltyScore, cliente.contact_name_canon])

  const programaFinal = (form.programa_manual || cliente.programa) as ClientePrograma
  const cfg = PROG_CFG[programaFinal]
  const proximaRapida = useMemo(() => format(addDays(new Date(), 7), 'yyyy-MM-dd'), [])

  const update = (patch: Partial<Form>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }

  const guardar = async () => {
    try {
      await setPrograma.mutateAsync({
        contact_name_canon: cliente.contact_name_canon,
        patch: {
          programa_manual: form.programa_manual || null,
          estado: form.estado,
          prioridad: form.prioridad,
          proxima_accion: form.proxima_accion || null,
          proxima_accion_fecha: form.proxima_accion_fecha || null,
          notas: form.notas || null,
        },
      })
      toast({ title: 'Programa guardado', variant: 'success' })
      setDirty(false)
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  const registrarLlamada = async () => {
    try {
      await marcarContacto.mutateAsync({
        contact_name_canon: cliente.contact_name_canon,
        tipo: 'llamada',
        proxima_accion: form.proxima_accion || 'Revisar evolución del cliente',
        proxima_accion_fecha: form.proxima_accion_fecha || proximaRapida,
      })
      toast({ title: 'Llamada registrada', variant: 'success' })
    } catch (e) {
      toast({ title: 'No se pudo registrar', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  const posponer = async () => {
    update({ proxima_accion_fecha: proximaRapida, estado: 'seguimiento' })
    try {
      await setPrograma.mutateAsync({
        contact_name_canon: cliente.contact_name_canon,
        patch: {
          estado: 'seguimiento',
          proxima_accion: form.proxima_accion || 'Seguimiento comercial',
          proxima_accion_fecha: proximaRapida,
          programa_manual: form.programa_manual || null,
          prioridad: form.prioridad,
          notas: form.notas || null,
        },
      })
      toast({ title: 'Seguimiento pospuesto 7 días', variant: 'success' })
    } catch (e) {
      toast({ title: 'No se pudo posponer', description: e instanceof Error ? e.message : '', variant: 'error' })
    }
  }

  const ultimoContacto = programa?.ultimo_contacto_at
    ? formatDistanceToNow(parseISO(programa.ultimo_contacto_at), { addSuffix: true, locale: es })
    : null

  const scoreColor = cfg.scoreColor
  const scorePct = scoreAnim

  return (
    <div
      className="overflow-hidden rounded-[var(--radius-md)]"
      style={{ border: `1px solid ${cfg.border}`, background: 'var(--panel)' }}
    >
      {/* ── Hero program header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: cfg.bg, borderBottom: `1px solid ${cfg.border}` }}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] text-xl"
          style={{ background: 'rgba(0,0,0,.25)' }}
        >
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold" style={{ color: cfg.accent }}>
              {labelPrograma(programaFinal)}
            </span>
            {form.programa_manual && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(0,0,0,.3)', color: 'var(--ink-dim)' }}>
                manual
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs" style={{ color: 'var(--ink-mute)' }}>
            Auto → {cliente.programaLabel}
          </div>
        </div>

        {/* Score — click para desglose */}
        <button
          type="button"
          onClick={() => cliente.scoreBreakdown && setShowBreakdown(v => !v)}
          className="shrink-0 text-right"
          style={{ cursor: cliente.scoreBreakdown ? 'pointer' : 'default' }}
          title={cliente.scoreBreakdown ? 'Ver desglose del score' : undefined}
        >
          <div className="flex items-center justify-end gap-1">
            <div className="text-xl font-bold tabular-nums" style={{ color: cfg.accent }}>
              {cliente.loyaltyScore}
              <span className="text-xs font-normal" style={{ color: 'var(--ink-mute)' }}>/100</span>
            </div>
            {cliente.scoreBreakdown && (
              <ChevronDown
                className="h-3.5 w-3.5 transition-transform"
                style={{ color: 'var(--ink-mute)', transform: showBreakdown ? 'rotate(180deg)' : 'rotate(0deg)' }}
                strokeWidth={2}
              />
            )}
          </div>
          <div
            className="mt-1 h-1.5 w-20 overflow-hidden rounded-full"
            style={{ background: 'rgba(0,0,0,.35)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${scorePct}%`,
                background: scoreColor,
                transition: 'width 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
                opacity: 0.85,
              }}
            />
          </div>
        </button>
      </div>

      {/* ── Score breakdown ── */}
      {showBreakdown && cliente.scoreBreakdown && (
        <div
          className="space-y-3 px-4 py-3"
          style={{ borderBottom: `1px solid ${cfg.border}`, background: 'rgba(0,0,0,.18)', animation: 'fadeSlideIn .15s ease-out' }}
        >
          {/* Factores */}
          <div className="space-y-2">
            {cliente.scoreBreakdown.factores.map((f) => (
              <div key={f.nombre}>
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--ink-dim)' }}>{f.nombre}</span>
                  <span className="tabular-nums font-semibold" style={{ color: cfg.accent }}>
                    {f.puntos}<span style={{ color: 'var(--ink-mute)' }}>/{f.max}</span>
                  </span>
                </div>
                <div className="mt-0.5 h-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round((f.puntos / f.max) * 100)}%`,
                      background: cfg.accent,
                      opacity: 0.7,
                    }}
                  />
                </div>
                <p className="mt-0.5 text-[10px]" style={{ color: 'var(--ink-mute)' }}>{f.descripcion}</p>
              </div>
            ))}
          </div>
          {/* Razones */}
          <div className="space-y-1 rounded-[var(--radius-sm)] p-2" style={{ background: 'rgba(255,255,255,.04)' }}>
            <p className="text-[11px]" style={{ color: 'var(--ink-dim)' }}>
              <span style={{ color: 'var(--ink-mute)' }}>Clase · </span>
              {cliente.scoreBreakdown.claseRazon}
            </p>
            <p className="text-[11px]" style={{ color: 'var(--ink-dim)' }}>
              <span style={{ color: 'var(--ink-mute)' }}>Programa · </span>
              {cliente.scoreBreakdown.programaRazon}
            </p>
          </div>
        </div>
      )}

      {/* ── Next tier hint ── */}
      <NextTierHint programa={programaFinal} score={cliente.loyaltyScore} breakdown={cliente.scoreBreakdown} />

      {/* ── Form ── */}
      <div className="space-y-2.5 p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div>
            <p className="label-caps mb-1">Programa</p>
            <Select
              value={form.programa_manual}
              onChange={(v) => update({ programa_manual: v as Form['programa_manual'] })}
              options={PROGRAMA_OPTIONS}
            />
          </div>
          <div>
            <p className="label-caps mb-1">Estado</p>
            <Select
              value={form.estado}
              onChange={(v) => update({ estado: v as Form['estado'] })}
              options={[
                { value: 'activo', label: 'Activo' },
                { value: 'seguimiento', label: 'Seguimiento' },
                { value: 'pausado', label: 'Pausado' },
                { value: 'cerrado', label: 'Cerrado' },
              ]}
            />
          </div>
          <div>
            <p className="label-caps mb-1">Prioridad</p>
            <Select
              value={form.prioridad}
              onChange={(v) => update({ prioridad: v as Form['prioridad'] })}
              options={[
                { value: 'baja', label: 'Baja' },
                { value: 'media', label: 'Media' },
                { value: 'alta', label: 'Alta' },
              ]}
            />
          </div>
          <div>
            <p className="label-caps mb-1">Próxima acción</p>
            <Input
              type="date"
              value={form.proxima_accion_fecha}
              onChange={(e) => update({ proxima_accion_fecha: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div>
          <Input
            value={form.proxima_accion}
            onChange={(e) => update({ proxima_accion: e.target.value })}
            placeholder={`Acción → ${cliente.accionSugerida}`}
            className="text-sm"
          />
        </div>
        <div>
          <Input
            value={form.notas}
            onChange={(e) => update({ notas: e.target.value })}
            placeholder="Notas: condiciones, trato, oferta o riesgo a vigilar…"
            className="text-sm"
          />
        </div>
      </div>

      {/* ── Actions ── */}
      <div
        className="flex flex-wrap items-center gap-2 px-3 py-2.5"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        <button
          type="button"
          onClick={registrarLlamada}
          disabled={marcarContacto.isPending}
          className="flex items-center gap-1.5 rounded-[var(--radius)] px-3 py-1.5 text-sm font-semibold transition-all"
          style={{
            background: cfg.accent === 'var(--mint)' ? 'var(--mint-glow)' : 'rgba(255,255,255,.06)',
            color: cfg.accent,
            border: `1px solid ${cfg.border}`,
          }}
        >
          <Phone className="h-3.5 w-3.5" strokeWidth={2} />
          Llamada hecha
        </button>

        <button
          type="button"
          onClick={posponer}
          disabled={setPrograma.isPending}
          className="flex items-center gap-1.5 rounded-[var(--radius)] px-3 py-1.5 text-sm transition-colors hover:bg-[rgba(255,255,255,.05)]"
          style={{ color: 'var(--ink-dim)', border: '1px solid var(--line-2)' }}
        >
          <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.8} />
          +7 días
        </button>

        <button
          type="button"
          onClick={() => update({ programa_manual: '', estado: 'activo', prioridad: 'media' })}
          className="flex items-center gap-1.5 rounded-[var(--radius)] px-3 py-1.5 text-sm transition-colors hover:bg-[rgba(255,255,255,.04)]"
          style={{ color: 'var(--ink-mute)' }}
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.8} />
          Auto
        </button>

        {dirty && (
          <Button
            size="sm"
            variant="primary"
            disabled={setPrograma.isPending}
            onClick={guardar}
            className="ml-auto"
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            Guardar
          </Button>
        )}

        {ultimoContacto && (
          <span
            className={`flex items-center gap-1 text-xs ${dirty ? '' : 'ml-auto'}`}
            style={{ color: 'var(--ink-mute)' }}
          >
            <Clock className="h-3 w-3" strokeWidth={1.6} />
            {ultimoContacto}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Next tier hint ───────────────────────────────────────────────────────────

function NextTierHint({ programa, score, breakdown }: {
  programa: ClientePrograma
  score: number
  breakdown?: ScoreBreakdown
}) {
  if ((programa !== 'a' && programa !== 'b') || !breakdown) return null

  const improvements = [...breakdown.factores]
    .map(f => ({ nombre: f.nombre, gap: f.max - f.puntos }))
    .filter(f => f.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 2)

  const impText = improvements.length > 0
    ? improvements.map(f => `${f.nombre} (+${f.gap}pts)`).join(' · ')
    : null

  if (programa === 'a') {
    const gap = 70 - score
    if (gap <= 0) return null
    return (
      <div
        className="flex items-baseline gap-1.5 px-4 py-2 text-[11px]"
        style={{ background: 'oklch(38% .10 158 / .07)', borderBottom: '1px solid oklch(78% .14 158 / .12)' }}
      >
        <span className="shrink-0 font-semibold" style={{ color: 'var(--mint)' }}>
          ⭐ VIP: faltan {gap} pts
        </span>
        {impText && (
          <span style={{ color: 'var(--ink-mute)' }}>— mejora {impText}</span>
        )}
      </div>
    )
  }

  // Clase B → Clase A
  return (
    <div
      className="flex items-baseline gap-1.5 px-4 py-2 text-[11px]"
      style={{ background: 'oklch(30% .12 70 / .07)', borderBottom: '1px solid oklch(78% .16 70 / .12)' }}
    >
      <span className="shrink-0 font-semibold" style={{ color: 'var(--amber)' }}>
        ✓ Clase A: más margen total
      </span>
      {impText && (
        <span style={{ color: 'var(--ink-mute)' }}>— puntúa mejor en {impText}</span>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function labelPrograma(p: ClientePrograma): string {
  return PROGRAMA_OPTIONS.find((o) => o.value === p)?.label ?? 'Estándar'
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs focus:outline-none"
      style={{
        background: 'var(--panel-2)',
        borderColor: 'var(--line-2)',
        color: 'var(--ink)',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
