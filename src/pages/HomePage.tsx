import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3, Banknote, Bot, CalendarClock,
  CheckSquare, CalendarDays, EyeOff, HandCoins, Package, RotateCcw, TrendingUp, UserMinus, Users, Wallet, X,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAuth } from '@/shared/auth/useAuth'
import { eurosShort } from '@/shared/lib/format'
import { toast } from '@/shared/lib/toast'
import { confirm } from '@/shared/lib/confirm'
import { canAccess, type ModuleKey } from '@/shared/types'
import { PageTopbar } from '@/shared/components/PageTopbar'
import { AlertCard } from '@/modules/dashboard/components/AlertCard'
import { BriefingDiarioCard } from '@/modules/dashboard/components/BriefingDiarioCard'
import { EstadoDelDia } from '@/modules/dashboard/components/EstadoDelDia'
import { NotificacionesPanel } from '@/modules/dashboard/components/NotificacionesPanel'
import { PvpSugeridoCard } from '@/modules/dashboard/components/PvpSugeridoCard'
import { FichajeCard } from '@/modules/trabajadores/components/FichajeCard'
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

const eur = eurosShort
const fmt = (d: string | null) =>
  d == null ? '—' : format(parseISO(d), 'd LLL', { locale: es })

const MODULOS = [
  { key: 'manager',   title: 'Manager',         to: '/manager',           Icon: BarChart3 },
  { key: 'agente',    title: 'Agente IA',       to: '/agente',            Icon: Bot },
  { key: 'cash',      title: 'Caja',            to: '/cash',              Icon: Banknote },
  { key: 'trabajadores', title: 'Trabajadores', to: '/trabajadores',      Icon: CheckSquare },
  { key: 'turnos',    title: 'Turnos',          to: '/turnos',            Icon: CalendarDays },
  { key: 'cobros',    title: 'Cobros',          to: '/cobros',            Icon: HandCoins },
  { key: 'sueldos',   title: 'Sueldos',         to: '/sueldos',           Icon: Wallet },
  { key: 'bbdd_trabajadores', title: 'BBDD',    to: '/bbdd-trabajadores', Icon: Users },
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

  // Las alertas (Cobros / Pedidos / Anómalos / Fuga / Costes) son cuadro de mando
  // ejecutivo: sólo admin_full y admin_op las consumen. responsable cae aquí pero
  // no debe disparar esas RPCs (algunas pueden no estar concedidas a su rol).
  const isAdmin = role === 'admin_full' || role === 'admin_op'
  const deudoresQ = useTopDeudoresCobros({ enabled: isAdmin })
  const esperadosQ = usePedidosEsperados({ enabled: isAdmin })
  const anomalosQ  = useProductosAnomalos(30, { enabled: isAdmin })
  const riesgoFugaQ = useClientesRiesgoFuga({ enabled: isAdmin })
  const costesQ    = useCostesSubiendo(14, 15, { enabled: isAdmin })
  const programaQ  = useClientesProgramaPendientes({ enabled: isAdmin })

  const dismissed = useAlertasDescartadas()
  const descartar = useDescartarAlerta()
  const restaurarTodas = useRestaurarTodas()

  const handleDismiss = async (alert_type: AlertType, entity_id: string, label: string) => {
    try {
      await descartar.mutateAsync({ alert_type, entity_id })
      toast({ title: `Descartado: ${label}`, variant: 'success' })
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'error' })
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
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'error' })
    }
  }

  // Filtrar descartadas
  const deudores = useMemo(() => ({
    ...deudoresQ,
    data: (deudoresQ.data ?? []).filter((d) => !dismissed.isDescartada('deuda', d.cliente_id)),
  }), [deudoresQ.data, dismissed.set])
  const esperados = useMemo(() => ({
    ...esperadosQ,
    data: (esperadosQ.data ?? []).filter((p) => !dismissed.isDescartada('pedido_esperado', p.contact_name_canon)),
  }), [esperadosQ.data, dismissed.set])
  const anomalos = useMemo(() => ({
    ...anomalosQ,
    data: (anomalosQ.data ?? []).filter((p) => !dismissed.isDescartada('producto_anomalo', p.product_id ?? p.nombre)),
  }), [anomalosQ.data, dismissed.set])
  const riesgoFuga = useMemo(() => ({
    ...riesgoFugaQ,
    data: (riesgoFugaQ.data ?? []).filter((c) => !dismissed.isDescartada('riesgo_fuga', c.contact_name_canon)),
  }), [riesgoFugaQ.data, dismissed.set])
  const costes = useMemo(() => ({
    ...costesQ,
    data: (costesQ.data ?? []).filter((p) => !dismissed.isDescartada('coste_subiendo', p.product_id)),
  }), [costesQ.data, dismissed.set])

  const totalDeuda = (deudores.data ?? []).reduce((s, d) => s + d.pendiente, 0)
  const totalVencido = (deudores.data ?? []).reduce((s, d) => s + d.vencido, 0)
  const esperadosUrgentes = (esperados.data ?? []).filter(p => p.prioridad === 'urgente' || p.prioridad === 'pronto')

  return (
    <div>
      <PageTopbar
        title="Centro de control"
        subtitle={`Hola, ${profile?.display_name ?? '—'}`}
      />
      <div className="ao-page">

      <div className="space-y-[22px]">
        <EstadoDelDia />
        {isAdmin && <BriefingDiarioCard />}
        {isAdmin && <PvpSugeridoCard />}
        <NotificacionesPanel />
        <FichajeCard />

        {isAdmin && (
        <section>
          <h2 className="label-caps mb-3">Alertas</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {/* Top deudores Cobros */}
          <AlertCard
            titulo="Deuda pendiente Cobros"
            subtitulo={totalVencido > 0 ? `${eur(totalVencido)} vencido` : 'al día con vencimientos'}
            Icon={HandCoins}
            severidad={totalVencido > 0 ? 'critica' : (totalDeuda > 0 ? 'aviso' : 'ok')}
            count={deudores.data?.length ?? 0}
            total={totalDeuda > 0 ? eur(totalDeuda) : undefined}
            loading={deudoresQ.isLoading}
            to="/cobros"
            empty="Sin deuda pendiente"
            preview={<DeudoresList rows={deudores.data?.slice(0, 6)} onDismiss={(id, label) => handleDismiss('deuda', id, label)} />}
            full={<DeudoresList rows={deudores.data ?? []} onDismiss={(id, label) => handleDismiss('deuda', id, label)} />}
          />

          {/* Pedidos esperados hoy/inminentes */}
          <AlertCard
            titulo="Pedidos esperados hoy / vencidos"
            subtitulo="basado en cadencia regular del cliente"
            Icon={CalendarClock}
            severidad={esperadosUrgentes.length > 0 ? 'aviso' : 'ok'}
            count={esperadosUrgentes.length}
            loading={esperadosQ.isLoading}
            to="/manager"
            empty="Nadie por encima del patrón hoy"
            preview={<EsperadosList rows={esperadosUrgentes.slice(0, 6)} onDismiss={(id, label) => handleDismiss('pedido_esperado', id, label)} />}
            full={<EsperadosList rows={esperados.data ?? []} mostrarTodos onDismiss={(id, label) => handleDismiss('pedido_esperado', id, label)} />}
          />

          {/* Productos anómalos */}
          <AlertCard
            titulo="Productos con margen anómalo"
            subtitulo="últimos 30 días"
            Icon={Package}
            severidad={(anomalos.data?.length ?? 0) > 0 ? 'aviso' : 'ok'}
            count={anomalos.data?.length ?? 0}
            loading={anomalosQ.isLoading}
            to="/manager"
            empty="Todos los productos con margen razonable"
            preview={<ProductosList rows={anomalos.data?.slice(0, 6)} onDismiss={(id, label) => handleDismiss('producto_anomalo', id, label)} />}
            full={<ProductosList rows={anomalos.data ?? []} onDismiss={(id, label) => handleDismiss('producto_anomalo', id, label)} />}
          />

          {/* Riesgo de fuga (inactivo / ralentiza / ticket cae) */}
          <AlertCard
            titulo="Riesgo de fuga"
            subtitulo="parados, ralentizan o ticket cae"
            Icon={UserMinus}
            severidad={
              (riesgoFuga.data ?? []).some(c => c.severidad === 'critica')
                ? 'critica'
                : (riesgoFuga.data?.length ?? 0) > 0 ? 'aviso' : 'ok'
            }
            count={riesgoFuga.data?.length ?? 0}
            loading={riesgoFugaQ.isLoading}
            to="/manager"
            empty="Sin clientes en riesgo"
            preview={<RiesgoFugaList rows={riesgoFuga.data?.slice(0, 6)} onDismiss={(id, label) => handleDismiss('riesgo_fuga', id, label)} />}
            full={<RiesgoFugaList rows={riesgoFuga.data ?? []} onDismiss={(id, label) => handleDismiss('riesgo_fuga', id, label)} />}
          />

          <AlertCard
            titulo="Fidelización hoy"
            subtitulo="acciones pendientes del programa"
            Icon={CalendarClock}
            severidad={
              (programaQ.data ?? []).some(c => c.prioridad === 'alta' || c.programa_manual === 'atencion')
                ? 'critica'
                : (programaQ.data?.length ?? 0) > 0 ? 'aviso' : 'ok'
            }
            count={programaQ.data?.length ?? 0}
            loading={programaQ.isLoading}
            to="/clientes"
            empty="Sin acciones comerciales pendientes"
            preview={<ProgramaPendientesList rows={programaQ.data?.slice(0, 6)} />}
            full={<ProgramaPendientesList rows={programaQ.data ?? []} />}
          />

          {/* Costes subiendo */}
          <AlertCard
            titulo="Costes subiendo"
            subtitulo="≥15% últimos 14d vs 90d"
            Icon={TrendingUp}
            severidad={(costes.data?.length ?? 0) > 0 ? 'aviso' : 'ok'}
            count={costes.data?.length ?? 0}
            loading={costesQ.isLoading}
            to="/manager"
            empty="Sin subidas relevantes"
            preview={<CostesList rows={costes.data?.slice(0, 6)} onDismiss={(id, label) => handleDismiss('coste_subiendo', id, label)} />}
            full={<CostesList rows={costes.data ?? []} onDismiss={(id, label) => handleDismiss('coste_subiendo', id, label)} />}
          />
          </div>

          {dismissed.list.length > 0 && (
            <div className="mt-3 flex items-center justify-end gap-2 text-xs text-[var(--ink-mute)]">
              <EyeOff className="h-3.5 w-3.5" />
              <span>{dismissed.list.length} alerta{dismissed.list.length === 1 ? '' : 's'} descartada{dismissed.list.length === 1 ? '' : 's'}</span>
              <button
                type="button"
                onClick={handleRestaurarTodas}
                disabled={restaurarTodas.isPending}
                className="ao-pill px-2 py-1 text-[11px] hover:text-[var(--mint)]"
              >
                <RotateCcw className="h-3 w-3" />
                Restaurar todas
              </button>
            </div>
          )}
        </section>
        )}

        {/* Atajos */}
        <section>
          <h2 className="label-caps mb-3">Módulos</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {moduleEntries.map(({ key, title, to, Icon }) => (
              <Link
                key={key}
                to={to}
                className="ao-panel ao-card-hover group flex flex-col items-center gap-2 px-3 py-4"
              >
                <div className="ao-icon-tile h-9 w-9">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="truncate text-sm font-medium text-[var(--ink)]">{title}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
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
