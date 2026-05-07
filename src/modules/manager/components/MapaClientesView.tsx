import { useMemo, useState } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip, ZoomControl } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLngBoundsExpression } from 'leaflet'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { eurosShort } from '@/shared/lib/format'
import type { Period } from '../lib/period'
import type { MapaCliente } from '../lib/queries'
import { useMapaClientes } from '../lib/queries'

const eur0 = eurosShort

interface Props {
  period: Period
}

export function MapaClientesView({ period }: Props) {
  const { data, isLoading } = useMapaClientes(period)
  const [conVentas, setConVentas] = useState(true)

  const clientes = useMemo(() => {
    const arr = data ?? []
    return conVentas ? arr.filter((c) => c.ventas > 0) : arr
  }, [data, conVentas])

  const stats = useMemo(() => {
    const arr = data ?? []
    return {
      total: arr.length,
      conVentas: arr.filter((c) => c.ventas > 0).length,
      ventaTotal: arr.reduce((s, c) => s + c.ventas, 0),
    }
  }, [data])

  const ventaMax = useMemo(() => clientes.reduce((m, c) => Math.max(m, c.ventas), 0), [clientes])

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (clientes.length === 0) return null
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
    for (const c of clientes) {
      if (c.lat < minLat) minLat = c.lat
      if (c.lat > maxLat) maxLat = c.lat
      if (c.lng < minLng) minLng = c.lng
      if (c.lng > maxLng) maxLng = c.lng
    }
    return [
      [minLat, minLng],
      [maxLat, maxLng],
    ]
  }, [clientes])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <Stat label="Geocodeados" value={String(stats.total)} />
          <Stat label="Con venta en periodo" value={String(stats.conVentas)} />
          <Stat label="Total ventas" value={eur0(stats.ventaTotal)} />
        </div>
        <label className="ml-auto inline-flex items-center gap-2 text-sm text-[var(--color-ink-2)]">
          <input
            type="checkbox"
            checked={conVentas}
            onChange={(e) => setConVentas(e.target.checked)}
            className="h-4 w-4"
          />
          Solo con ventas en este periodo
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {isLoading && <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">Cargando…</p>}
        {!isLoading && clientes.length === 0 && (
          <p className="px-4 py-3 text-sm text-[var(--color-ink-3)]">
            Sin clientes geocodeados. Ejecuta sync de direcciones y geocoding desde admin.
          </p>
        )}
        {!isLoading && clientes.length > 0 && (
          <div className="h-[600px] w-full">
            <MapContainer
              bounds={bounds ?? undefined}
              boundsOptions={{ padding: [40, 40] }}
              scrollWheelZoom
              zoomControl={false}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <ZoomControl position="topright" />
              {clientes.map((c) => (
                <ClienteMarker key={c.contact_id} cliente={c} ventaMax={ventaMax} />
              ))}
            </MapContainer>
          </div>
        )}
      </div>

      {!isLoading && clientes.length > 0 && (
        <p className="px-2 text-xs text-[var(--color-ink-3)]">
          Tamaño y color del marcador = ventas en el periodo. Los clientes sin geocodificar no aparecen.
        </p>
      )}
    </div>
  )
}

function ClienteMarker({ cliente, ventaMax }: { cliente: MapaCliente; ventaMax: number }) {
  const intensity = ventaMax > 0 ? cliente.ventas / ventaMax : 0
  const radius = 6 + Math.round(intensity * 18)
  const color = intensity > 0.66 ? '#15803d' : intensity > 0.33 ? '#65a30d' : intensity > 0 ? '#ca8a04' : '#94a3b8'

  return (
    <CircleMarker
      center={[cliente.lat, cliente.lng]}
      radius={radius}
      pathOptions={{ color, fillColor: color, fillOpacity: 0.55, weight: 1.5 }}
    >
      <Tooltip direction="top" offset={[0, -radius]} opacity={1}>
        <div className="text-xs">
          <div className="font-semibold text-[var(--color-ink)]">{cliente.nombre}</div>
          {cliente.poblacion && (
            <div className="text-[var(--color-ink-3)]">
              {cliente.cp ? `${cliente.cp} · ` : ''}{cliente.poblacion}
            </div>
          )}
          <div className="mt-1 tabular-nums">
            <strong>{eur0(cliente.ventas)}</strong>
            {cliente.num_facturas > 0 && <span className="text-[var(--color-ink-3)]"> · {cliente.num_facturas} fact.</span>}
          </div>
          {cliente.ultima_venta && (
            <div className="text-[var(--color-ink-3)]">
              Última: {format(parseISO(cliente.ultima_venta), 'd LLL yyyy', { locale: es })}
            </div>
          )}
        </div>
      </Tooltip>
    </CircleMarker>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-3)]">{label}</div>
      <div className="font-display text-base font-bold tabular-nums text-[var(--color-ink)]">{value}</div>
    </div>
  )
}
