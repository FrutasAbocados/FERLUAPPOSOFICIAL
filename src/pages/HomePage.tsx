import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3, Banknote, Bot, CalendarClock,
  CheckSquare, CalendarDays, EyeOff, HandCoins, Package, RotateCcw, TrendingUp, UserMinus, Users, Wallet, X,
  ChevronDown, ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAuth } from '@/shared/auth/useAuth'
import { eurosShort } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { errorMessage } from '@/shared/lib/errors'
import { canAccess, type ModuleKey } from '@/shared/types'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { BriefingDiarioCard } from '@/modules/dashboard/components/BriefingDiarioCard'
import { PanelEmpresa } from '@/modules/dashboard/components/PanelEmpresa'
import { NotificacionesPanel } from '@/modules/dashboard/components/NotificacionesPanel'
import { PvpSugeridoCard } from '@/modules/dashboard/components/PvpSugeridoCard'
import { FichajeCard } from '@/modules/trabajadores/components/FichajeCard'
import { RuletaPremiosSelfCard } from '@/modules/trabajadores/components/RuletaPremiosSelfCard'
import { RuletaSelfCard } from '@/modules/trabajadores/components/RuletaSelfCard'
import {
  useClientesProgramaPendientes, useClientesRiesgoFuga, useCostesSubiendo,
  usePedidosEsperados, useProductosAnomalos, useTopDeudoresCobros,
  type ClienteProgramaPendiente, type DeudorCobros, type PedidoEsperado, type ClienteRiesgoFuga, type CosteSubiendo, type ProductoAnomalo,
} from '@/modules/dashboard/lib/queries'
import {
  type AlertType,
  useAlertasDescartadas,
  useDescartarAlerta,
  useRestaurarTodas,
} from '@/modules/dashboard/lib/dismiss'
import {
  useNotificaciones,
  useDescartarNotif,
  useDescartarTodas as useDescartarTodasNotif,
} from '@/modules/dashboard/lib/notificaciones'

const eur = eurosShort
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL', { locale: es })

const MODULOS = [
  { key: 'manager',           title: 'Manager',      to: '/manager',           Icon: BarChart3,    color: 'oklch(78% 0.14 158)', bg: 'oklch(22% 0.10 158 / 0.55)' },
  { key: 'agente',            title: 'Agente IA',    to: '/agente',            Icon: Bot,          color: 'oklch(76% 0.12 235)', bg: 'oklch(20% 0.09 235 / 0.55)' },
  { key: 'cash',              title: 'Caja',         to: '/cash',              Icon: Banknote,     color: 'oklch(78% 0.16 70)',  bg: 'oklch(22% 0.10 70  / 0.55)' },
  { key: 'trabajadores',      title: 'Trabajadores', to: '/trabajadores',      Icon: CheckSquare,  color: 'oklch(75% 0.14 310)', bg: 'oklch(20% 0.09 310 / 0.55)' },
  { key: 'turnos',            title: 'Turnos',       to: '/turnos',            Icon: CalendarDays, color: 'oklch(76% 0.13 195)', bg: 'oklch(20% 0.08 195 / 0.55)' },
  { key: 'cobros',            title: 'Cobros',       to: '/cobros',            Icon: HandCoins,    color: 'oklch(70% 0.18 25)',  bg: 'oklch(22% 0.10 25  / 0.55)' },
  { key: 'sueldos',           title: 'Sueldos',      to: '/sueldos',           Icon: Wallet,       color: 'oklch(80% 0.15 55)',  bg: 'oklch(23% 0.09 55  / 0.55)' },
  { key: 'bbdd_trabajadores', title: 'BBDD',         to: '/bbdd-trabajadores', Icon: Users,        color: 'oklch(75% 0.12 270)', bg: 'oklch(20% 0.08 270 / 0.55)' },
] as const

export function HomePage() {
  const { profile } = useAuth()
  const role = profile?.role

  if (role === 'empleado') return <HomeEmpleado />

  return <HomeAdmin />
}

function HomeAdmin() {
  const { profile } = useAuth()
  const role = profile?.role
  const moduleEntries = MODULOS.filter(m => role && canAccess(m.key as ModuleKey, role))

  const isAdmin        = role === 'admin_full' || role === 'admin_op'
  const isGestorCobros = role === 'gestor_cobros'
  const canSeeCobros   = isAdmin || isGestorCobros
  const deudoresQ   = useTopDeudoresCobros({ enabled: canSeeCobros })
  const esperadosQ  = usePedidosEsperados({ enabled: isAdmin })
  const anomalosQ   = useProductosAnomalos(30, { enabled: isAdmin })
  const riesgoFugaQ = useClientesRiesgoFuga({ enabled: isAdmin })
  const costesQ     = useCostesSubiendo(14, 15, { enabled: isAdmin })
  const programaQ   = useClientesProgramaPendientes({ enabled: isAdmin })

  const dismissed      = useAlertasDescartadas()
  const descartar      = useDescartarAlerta()
  const restaurarTodas = useRestaurarTodas()

  const handleDismiss = async (alert_type: AlertType, entity_id: string, label: string) => {
    try {
      await descartar.mutateAsync({ alert_type, entity_id })
      toast({ title: `Descartado: ${label}`, variant: 'success' })
    } catch (e: unknown) {
      toast({ title: 'Error', description: errorMessage(e), variant: 'error' })
    }
  }

  const handleRestaurarTodas = async () => {
    if (dismissed.list.length === 0) return
    const ok = await confirm({
      title: `¿Restaurar ${dismissed.list.length} alerta${dismissed.list.length === 1 ? '' : 's'} descartada${dismissed.list.length === 1 ? '' : 's'}?`,
      description: 'Volverán a aparecer en el Dashboard.',
      confirmLabel: 'Restaurar',
    })
    if (!ok) return
    try {
      await restaurarTodas.mutateAsync()
      toast({ title: 'Alertas restauradas', variant: 'success' })
    } catch (e: unknown) {
      toast({ title: 'Error', description: errorMessage(e), variant: 'error' })
    }
  }

  const deudores = useMemo(() => ({
    ...deudoresQ,
    data: (deudoresQ.data ?? []).filter((d) => !dismissed.isDescartada('deuda', d.cliente_id)),
  }), [deudoresQ, dismissed])
  const esperados = useMemo(() => ({
    ...esperadosQ,
    data: (esperadosQ.data ?? []).filter((p) => !dismissed.isDescartada('pedido_esperado', p.contact_name_canon)),
  }), [esperadosQ, dismissed])
  const anomalos = useMemo(() => ({
    ...anomalosQ,
    data: (anomalosQ.data ?? []).filter((p) => !dismissed.isDescartada('producto_anomalo', p.product_id ?? p.nombre)),
  }), [anomalosQ, dismissed])
  const riesgoFuga = useMemo(() => ({
    ...riesgoFugaQ,
    data: (riesgoFugaQ.data ?? []).filter((c) => !dismissed.isDescartada('riesgo_fuga', c.contact_name_canon)),
  }), [riesgoFugaQ, dismissed])
  const costes = useMemo(() => ({
    ...costesQ,
    data: (costesQ.data ?? []).filter((p) => !dismissed.isDescartada('coste_subiendo', p.product_id)),
  }), [costesQ, dismissed])

  const totalDeuda        = (deudores.data ?? []).reduce((s, d) => s + d.pendiente, 0)
  const totalVencido      = (deudores.data ?? []).reduce((s, d) => s + d.vencido, 0)
  const esperadosUrgentes = (esperados.data ?? []).filter(p => p.prioridad === 'urgente' || p.prioridad === 'pronto')

  const totalAlertas = [
    deudores.data?.length ?? 0,
    esperadosUrgentes.length,
    anomalos.data?.length ?? 0,
    riesgoFuga.data?.length ?? 0,
    programaQ.data?.length ?? 0,
    costes.data?.length ?? 0,
  ].reduce((s, n) => s + n, 0)

  const hayCriticas =
    totalVencido > 0 ||
    (riesgoFuga.data ?? []).some(c => c.severidad === 'critica') ||
    (programaQ.data ?? []).some(c => c.prioridad === 'alta' || c.programa_manual === 'atencion')

  return (
    <div>
      <PageTopbar
        title="Centro de control"
        subtitle={`Hola, ${profile?.display_name ?? '—'}`}
      />
      <div className="ao-page">
        {/* Desktop xl+: columna principal (flex) + sidebar 280px fija */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">

          {/* ── COLUMNA PRINCIPAL ── */}
          <div className="min-w-0 space-y-6">

            {/* 1 — Estado ejecutivo empresa */}
            <PanelEmpresa />

            {/* 2 — Centro de alertas: feed expandible por categoría */}
            {(isAdmin || isGestorCobros) && (
              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="label-caps">Centro de alertas</h2>
                  <div className="flex items-center gap-2 text-[11px]">
                    {totalAlertas > 0 && (
                      <span className={`ao-chip ${hayCriticas ? 'ao-chip-coral' : 'ao-chip-amber'}`}>
                        {totalAlertas} activa{totalAlertas === 1 ? '' : 's'}
                        {hayCriticas ? ' · críticas' : ''}
                      </span>
                    )}
                    {dismissed.list.length > 0 && (
                      <button
                        type="button"
                        onClick={handleRestaurarTodas}
                        disabled={restaurarTodas.isPending}
                        className="flex items-center gap-1 text-[var(--ink-mute)] transition-colors hover:text-[var(--mint)]"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span className="hidden sm:inline">{dismissed.list.length} descartada{dismissed.list.length === 1 ? '' : 's'}</span>
                        <EyeOff className="h-3 w-3 sm:hidden" />
                      </button>
                    )}
                  </div>
                </div>

                <div
                  className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--line)]"
                  style={{ background: 'linear-gradient(180deg,rgba(18,26,24,.58),rgba(12,18,17,.46))' }}
                >
                  <AlertRow
                    titulo="Cobros pendientes"
                    Icon={HandCoins}
                    severidad={totalVencido > 0 ? 'critica' : totalDeuda > 0 ? 'aviso' : 'ok'}
                    count={deudores.data?.length ?? 0}
                    meta={totalDeuda > 0 ? `${eur(totalDeuda)} · ${eur(totalVencido)} vencido` : undefined}
                    to="/cobros"
                    loading={deudoresQ.isLoading}
                  >
                    <DeudoresList rows={deudores.data} onDismiss={(id, label) => handleDismiss('deuda', id, label)} />
                  </AlertRow>

                  {isAdmin && (
                    <>
                  <AlertRow
                    titulo="Pedidos esperados"
                    Icon={CalendarClock}
                    severidad={esperadosUrgentes.length > 0 ? 'aviso' : 'ok'}
                    count={esperadosUrgentes.length}
                    to="/manager"
                    loading={esperadosQ.isLoading}
                  >
                    <EsperadosList rows={esperados.data ?? []} mostrarTodos onDismiss={(id, label) => handleDismiss('pedido_esperado', id, label)} />
                  </AlertRow>

                  <AlertRow
                    titulo="Margen anómalo"
                    Icon={Package}
                    severidad={(anomalos.data?.length ?? 0) > 0 ? 'aviso' : 'ok'}
                    count={anomalos.data?.length ?? 0}
                    meta="últimos 30 días"
                    to="/manager"
                    loading={anomalosQ.isLoading}
                  >
                    <ProductosList rows={anomalos.data} onDismiss={(id, label) => handleDismiss('producto_anomalo', id, label)} />
                  </AlertRow>

                  <AlertRow
                    titulo="Riesgo de fuga"
                    Icon={UserMinus}
                    severidad={
                      (riesgoFuga.data ?? []).some(c => c.severidad === 'critica') ? 'critica'
                      : (riesgoFuga.data?.length ?? 0) > 0 ? 'aviso'
                      : 'ok'
                    }
                    count={riesgoFuga.data?.length ?? 0}
                    to="/manager"
                    loading={riesgoFugaQ.isLoading}
                  >
                    <RiesgoFugaList rows={riesgoFuga.data} onDismiss={(id, label) => handleDismiss('riesgo_fuga', id, label)} />
                  </AlertRow>

                  <AlertRow
                    titulo="Fidelización hoy"
                    Icon={CalendarClock}
                    severidad={
                      (programaQ.data ?? []).some(c => c.prioridad === 'alta' || c.programa_manual === 'atencion') ? 'critica'
                      : (programaQ.data?.length ?? 0) > 0 ? 'aviso'
                      : 'ok'
                    }
                    count={programaQ.data?.length ?? 0}
                    to="/clientes"
                    loading={programaQ.isLoading}
                  >
                    <ProgramaPendientesList rows={programaQ.data} />
                  </AlertRow>

                  <AlertRow
                    titulo="Costes subiendo"
                    Icon={TrendingUp}
                    severidad={(costes.data?.length ?? 0) > 0 ? 'aviso' : 'ok'}
                    count={costes.data?.length ?? 0}
                    meta="≥15% últimos 14d vs 90d"
                    to="/manager"
                    loading={costesQ.isLoading}
                  >
                    <CostesList rows={costes.data} onDismiss={(id, label) => handleDismiss('coste_subiendo', id, label)} />
                  </AlertRow>
                    </>
                  )}
                </div>

                {/* PVP a revisar — dentro del bloque de alertas */}
                <div className="mt-3">
                  <PvpSugeridoCard />
                </div>
              </section>
            )}

            {/* 3 — Briefing IA */}
            {isAdmin && <BriefingDiarioCard />}
          </div>

          {/* ── SIDEBAR ── */}
          <div className="space-y-4">
            <section>
              <h2 className="label-caps mb-3">Módulos</h2>
              <div className="grid grid-cols-2 gap-2">
                {moduleEntries.map(({ key, title, to, Icon, color, bg }) => (
                  <Link
                    key={key}
                    to={to}
                    className="group flex items-center gap-2.5 rounded-[var(--radius-lg)] px-3 py-2.5 transition-all active:scale-95"
                    style={{ background: bg, border: `1px solid ${color}28` }}
                  >
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
                      style={{ background: `${color}18`, color }}
                    >
                      <Icon className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
                    </div>
                    <span className="min-w-0 truncate text-xs font-medium text-[var(--ink)]">{title}</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* ── NOTIFICACIONES — tira horizontal full-width debajo del grid ── */}
        <NotifStrip />
      </div>
    </div>
  )
}

function HomeEmpleado() {
  const { profile } = useAuth()
  const role = profile?.role
  const moduleEntries = MODULOS.filter(m => role && canAccess(m.key as ModuleKey, role))

  return (
    <div>
      <PageTopbar title="Tu panel" subtitle={`Hola, ${profile?.display_name ?? '—'}`} />
      <div className="ao-page max-w-3xl">

      <div className="space-y-[22px]">
        <NotificacionesPanel />
        <FichajeCard />
        <RuletaSelfCard />
        <RuletaPremiosSelfCard compact />

        <section>
          <h2 className="label-caps mb-3">Tus módulos</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {moduleEntries.map(({ key, title, to, Icon }) => (
              <Link
                key={key}
                to={to}
                className="ao-panel ao-card-hover group flex flex-col items-center gap-2 px-3 py-4"
              >
                <div className="ao-icon-tile h-9 w-9">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-[var(--ink)]">{title}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
      </div>
    </div>
  )
}

// ── Tira de notificaciones horizontal ────────────────────────────────────────

const DEPRIO_TIPOS = new Set(['neutral_ia', 'puntos_dia'])

function notifDotColor(tipo: string): string {
  if (tipo === 'penalizacion_ia' || tipo === 'vacaciones_denegada') return 'var(--coral)'
  if (tipo === 'vacaciones_solicitada') return 'var(--amber)'
  return 'var(--mint)'
}

function NotifStrip() {
  const { data: notifs = [], isLoading } = useNotificaciones()
  const descartar      = useDescartarNotif()
  const descartarTodas = useDescartarTodasNotif()

  const sorted = [...notifs].sort((a, b) => {
    const aD = DEPRIO_TIPOS.has(a.tipo) ? 1 : 0
    const bD = DEPRIO_TIPOS.has(b.tipo) ? 1 : 0
    if (aD !== bD) return aD - bD
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
  const visible = sorted.slice(0, 4)

  if (isLoading || visible.length === 0) return null

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="label-caps">Notificaciones</h2>
        <button
          type="button"
          onClick={() => descartarTodas.mutate(notifs.map(n => n.id))}
          disabled={descartarTodas.isPending}
          className="text-[11px] text-[var(--ink-mute)] transition-colors hover:text-[var(--ink)]"
        >
          descartar todas
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map(n => {
          const dot = notifDotColor(n.tipo)
          return (
            <div
              key={n.id}
              className="group flex items-center gap-2.5 rounded-[var(--radius-lg)] border border-[var(--line)] px-3 py-2.5"
              style={{ background: 'rgba(18,26,24,.55)' }}
            >
              <div
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: dot, boxShadow: `0 0 5px ${dot}` }}
              />
              <span className="min-w-0 flex-1 truncate text-xs text-[var(--ink)]">{n.titulo}</span>
              <span className="shrink-0 whitespace-nowrap text-[10px] text-[var(--ink-mute)]">
                {formatDistanceToNow(new Date(n.created_at), { locale: es })}
              </span>
              <button
                type="button"
                onClick={() => descartar.mutate(n.id)}
                disabled={descartar.isPending}
                className="shrink-0 text-[var(--ink-mute)] opacity-0 transition-opacity hover:text-[var(--ink)] group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DismissBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick() }}
      className="rounded-sm p-0.5 text-[var(--color-ink-3)] opacity-0 transition-opacity hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] group-hover:opacity-100"
      title="Descartar esta alerta"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )
}

function DeudoresList({ rows, onDismiss }: { rows?: DeudorCobros[]; onDismiss?: (entity_id: string, label: string) => void }) {
  return (
    <ul className="space-y-1.5">
      {rows?.map(d => (
        <li key={d.cliente_id} className="group grid grid-cols-[1fr_auto_auto] items-start gap-2 text-sm">
          <div className="min-w-0">
            <div className="truncate text-[var(--ink)]">{d.nombre}</div>
            <div className="text-xs text-[var(--ink-mute)]">{d.movimientos} mov · {d.vencido > 0 ? `${eur(d.vencido)} vencido` : 'al día'}</div>
          </div>
          <span className={`text-sm font-medium tabular-nums ${d.vencido > 0 ? 'text-[var(--coral)]' : 'text-[var(--amber)]'}`}>{eur(d.pendiente)}</span>
          {onDismiss && <DismissBtn onClick={() => onDismiss(d.cliente_id, d.nombre)} />}
        </li>
      ))}
    </ul>
  )
}

function EsperadosList({ rows, mostrarTodos, onDismiss }: { rows?: PedidoEsperado[]; mostrarTodos?: boolean; onDismiss?: (entity_id: string, label: string) => void }) {
  const colorPrioridad = (p: PedidoEsperado['prioridad']) =>
    p === 'urgente' ? 'text-[var(--coral)]' : p === 'pronto' ? 'text-[var(--amber)]' : 'text-[var(--sky)]'
  return (
    <ul className="space-y-1.5">
      {rows?.map(p => (
        <li key={p.contact_name_canon} className="group grid grid-cols-[1fr_auto_auto] items-start gap-2 text-sm">
          <div className="min-w-0">
            <div className="truncate text-[var(--ink)]">{p.contact_name_canon}</div>
            <div className="text-xs text-[var(--ink-mute)]">cad. {p.cadencia_dias.toFixed(0)}d · ~{eur(p.ventas_medias)}</div>
          </div>
          <span className={`text-xs font-medium tabular-nums ${colorPrioridad(p.prioridad)}`}>
            {p.dias_para === 0 ? 'hoy' : p.dias_para < 0 ? `${Math.abs(p.dias_para)}d tarde` : `en ${p.dias_para}d`}
            {mostrarTodos && <span className="ml-1 text-[10px] uppercase">{p.prioridad}</span>}
          </span>
          {onDismiss && <DismissBtn onClick={() => onDismiss(p.contact_name_canon, p.contact_name_canon)} />}
        </li>
      ))}
    </ul>
  )
}

function ProductosList({ rows, onDismiss }: { rows?: ProductoAnomalo[]; onDismiss?: (entity_id: string, label: string) => void }) {
  return (
    <ul className="space-y-1.5">
      {rows?.map(p => {
        const id = p.product_id ?? p.nombre
        return (
          <li key={id} className="group grid grid-cols-[1fr_auto_auto] items-start gap-2 text-sm">
            <div className="min-w-0">
              <div className="truncate text-[var(--ink)]">{p.nombre}</div>
              <div className="text-xs text-[var(--amber)]">
                {p.motivo === 'sin_coste' ? 'sin coste registrado' : p.motivo === 'margen_bajo' ? 'margen bajo' : 'margen excesivo'}
              </div>
            </div>
            <span className="text-xs tabular-nums text-[var(--ink-mute)]">
              {p.margen_pct == null ? '—' : `${p.margen_pct.toFixed(0)}%`} · {eur(p.ventas)}
            </span>
            {onDismiss && <DismissBtn onClick={() => onDismiss(id, p.nombre)} />}
          </li>
        )
      })}
    </ul>
  )
}

const MOTIVO_LABEL: Record<'inactivo' | 'ralentiza' | 'ticket_cae', string> = {
  inactivo:   'parado',
  ralentiza:  'ralentiza',
  ticket_cae: 'ticket cae',
}

function MotivoChip({ motivo }: { motivo: 'inactivo' | 'ralentiza' | 'ticket_cae' }) {
  const cls =
    motivo === 'inactivo'
      ? 'bg-[oklch(30%_.12_25_/_0.22)] text-[var(--coral)]'
      : 'bg-[oklch(30%_.10_70_/_0.25)] text-[var(--amber)]'
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {MOTIVO_LABEL[motivo]}
    </span>
  )
}

function RiesgoFugaList({ rows, onDismiss }: { rows?: ClienteRiesgoFuga[]; onDismiss?: (entity_id: string, label: string) => void }) {
  return (
    <ul className="space-y-1.5">
      {rows?.map(c => {
        const dropPct =
          c.ticket_medio_30d != null && c.ticket_medio_30_90 && c.ticket_medio_30_90 > 0
            ? Math.round((1 - c.ticket_medio_30d / c.ticket_medio_30_90) * 100)
            : null
        const showTicket = c.motivos.includes('ticket_cae') && dropPct != null
        return (
          <li key={c.contact_name_canon} className="group grid grid-cols-[1fr_auto_auto] items-start gap-2 text-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[var(--ink)]">
                <span className="truncate">{c.contact_name_canon}</span>
                <span className="flex shrink-0 gap-1">
                  {c.motivos.map(m => <MotivoChip key={m} motivo={m} />)}
                </span>
              </div>
              <div className="text-xs text-[var(--ink-mute)]">
                cad. {c.cadencia_dias.toFixed(0)}d · {fmt(c.ultima_compra)}
                {showTicket ? ` · ticket ${c.ticket_medio_30_90?.toFixed(0)}€→${c.ticket_medio_30d?.toFixed(0)}€` : ''}
              </div>
            </div>
            <span className={`text-xs tabular-nums ${c.severidad === 'critica' ? 'text-[var(--coral)]' : 'text-[var(--amber)]'}`}>
              {c.motivos.includes('inactivo') || c.motivos.includes('ralentiza')
                ? `${c.dias_sin_pedir}d sin pedir`
                : showTicket ? `-${dropPct}%` : ''}
            </span>
            {onDismiss && <DismissBtn onClick={() => onDismiss(c.contact_name_canon, c.contact_name_canon)} />}
          </li>
        )
      })}
    </ul>
  )
}

const PROGRAMA_LABEL: Record<string, string> = {
  vip:      'VIP',
  a:        'Clase A',
  b:        'Clase B',
  c:        'Clase C',
  atencion: 'Atención',
}

function ProgramaPendientesList({ rows }: { rows?: ClienteProgramaPendiente[] }) {
  return (
    <ul className="space-y-1.5">
      {rows?.map(c => {
        const overdue = c.proxima_accion_fecha != null && c.proxima_accion_fecha < new Date().toISOString().slice(0, 10)
        return (
          <li key={c.contact_name_canon} className="grid grid-cols-[1fr_auto] items-start gap-2 text-sm">
            <div className="min-w-0">
              <div className="truncate text-[var(--ink)]">{c.contact_name_canon}</div>
              <div className="text-xs text-[var(--ink-mute)]">
                {c.proxima_accion || 'Revisar seguimiento comercial'}
                {c.programa_manual ? ` · ${PROGRAMA_LABEL[c.programa_manual]}` : ''}
              </div>
            </div>
            <span className={`text-xs font-medium tabular-nums ${overdue || c.prioridad === 'alta' ? 'text-[var(--coral)]' : 'text-[var(--amber)]'}`}>
              {c.proxima_accion_fecha ? fmt(c.proxima_accion_fecha) : c.prioridad}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function CostesList({ rows, onDismiss }: { rows?: CosteSubiendo[]; onDismiss?: (entity_id: string, label: string) => void }) {
  return (
    <ul className="space-y-1.5">
      {rows?.map(p => (
        <li key={p.product_id} className="group grid grid-cols-[1fr_auto_auto] items-start gap-2 text-sm">
          <div className="min-w-0">
            <div className="truncate text-[var(--ink)]">{p.nombre}</div>
            <div className="text-xs text-[var(--ink-mute)]">{p.coste_anterior.toFixed(2)}€ → {p.coste_actual.toFixed(2)}€</div>
          </div>
          <span className="text-xs font-medium tabular-nums text-[var(--amber)]">+{p.variacion_pct.toFixed(0)}%</span>
          {onDismiss && <DismissBtn onClick={() => onDismiss(p.product_id, p.nombre)} />}
        </li>
      ))}
    </ul>
  )
}

// ── Fila expandible del feed de alertas ──────────────────────────────────────

function AlertRow({
  titulo, Icon, severidad, count, meta, to, loading, children,
}: {
  titulo: string
  Icon: LucideIcon
  severidad: 'ok' | 'aviso' | 'critica'
  count: number
  meta?: string
  to: string
  loading?: boolean
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)

  const dotClr = severidad === 'critica' ? 'var(--coral)' : severidad === 'aviso' ? 'var(--amber)' : 'var(--mint)'
  const cntCls = severidad === 'critica' ? 'text-[var(--coral)]' : severidad === 'aviso' ? 'text-[var(--amber)]' : 'text-[var(--mint)]'

  return (
    <div className="border-b border-[var(--line)] last:border-b-0">
      <div
        role={count > 0 ? 'button' : undefined}
        tabIndex={count > 0 ? 0 : undefined}
        className={`flex select-none items-center gap-3 px-4 py-3 transition-colors ${count > 0 ? 'cursor-pointer hover:bg-[rgba(140,200,170,0.05)]' : ''}`}
        onClick={() => count > 0 && setOpen(v => !v)}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && count > 0 && setOpen(v => !v)}
      >
        {/* Estado visual */}
        <div
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: dotClr, boxShadow: severidad !== 'ok' ? `0 0 5px ${dotClr}` : 'none' }}
        />

        <Icon className="h-4 w-4 shrink-0 text-[var(--ink-mute)]" />

        <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">{titulo}</span>

        {meta && (
          <span className="hidden shrink-0 text-xs text-[var(--ink-mute)] sm:block">{meta}</span>
        )}

        {loading ? (
          <div className="h-4 w-6 animate-pulse rounded bg-[rgba(255,255,255,.05)]" />
        ) : count > 0 ? (
          <span className={`mono shrink-0 text-sm font-semibold tabular-nums ${cntCls}`}>{count}</span>
        ) : (
          <span className="mono shrink-0 text-xs text-[var(--mint)]">OK</span>
        )}

        <Link
          to={to}
          className="shrink-0 text-[var(--ink-mute)] transition-colors hover:text-[var(--mint)]"
          onClick={e => e.stopPropagation()}
          aria-label="Ir al módulo"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>

        {count > 0 && (
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-[var(--ink-mute)] transition-transform ${open ? 'rotate-180' : ''}`}
          />
        )}
      </div>

      {open && count > 0 && (
        <div className="border-t border-[var(--line)] bg-[rgba(0,0,0,.14)] px-4 pb-4 pt-3">
          {children}
        </div>
      )}
    </div>
  )
}
