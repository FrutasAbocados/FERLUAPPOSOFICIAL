import { useMemo } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet'

interface Props {
  latIn: number | null
  lngIn: number | null
  latOut: number | null
  lngOut: number | null
  horaIn?: string
  horaOut?: string
}

/**
 * Mini-mapa Leaflet/OSM con la ubicación de entrada (verde) y salida (roja) de
 * un fichaje. Lazy-loaded para no arrastrar Leaflet al chunk de Trabajadores.
 * Usa CircleMarker para evitar el problema de assets del icono por defecto.
 */
export function FichajeMiniMapa({ latIn, lngIn, latOut, lngOut, horaIn, horaOut }: Props) {
  const entrada: LatLngExpression | null = latIn != null && lngIn != null ? [latIn, lngIn] : null
  const salida: LatLngExpression | null = latOut != null && lngOut != null ? [latOut, lngOut] : null

  const puntos = useMemo(() => {
    const arr: Array<[number, number]> = []
    if (latIn != null && lngIn != null) arr.push([latIn, lngIn])
    if (latOut != null && lngOut != null) arr.push([latOut, lngOut])
    return arr
  }, [latIn, lngIn, latOut, lngOut])

  if (puntos.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-xs text-[var(--color-ink-3)]">
        Sin ubicación registrada en este fichaje
      </div>
    )
  }

  const bounds: LatLngBoundsExpression | undefined =
    puntos.length > 1
      ? [
          [Math.min(...puntos.map(p => p[0])), Math.min(...puntos.map(p => p[1]))],
          [Math.max(...puntos.map(p => p[0])), Math.max(...puntos.map(p => p[1]))],
        ]
      : undefined

  const center: LatLngExpression = puntos[0]!

  return (
    <div className="h-[180px] overflow-hidden rounded-lg border border-[var(--color-border)]">
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [30, 30], maxZoom: 17 }}
        center={bounds ? undefined : center}
        zoom={bounds ? undefined : 16}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {entrada && salida && (
          <Polyline positions={[entrada, salida]} pathOptions={{ color: '#94a3b8', weight: 2, dashArray: '4 4' }} />
        )}
        {entrada && (
          <CircleMarker center={entrada} radius={9} pathOptions={{ color: '#15803d', fillColor: '#22c55e', fillOpacity: 0.8, weight: 2 }}>
            <Tooltip direction="top" offset={[0, -8]} opacity={1}>
              <span className="text-xs font-semibold">Entrada{horaIn ? ` · ${horaIn}` : ''}</span>
            </Tooltip>
          </CircleMarker>
        )}
        {salida && (
          <CircleMarker center={salida} radius={9} pathOptions={{ color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 0.8, weight: 2 }}>
            <Tooltip direction="top" offset={[0, -8]} opacity={1}>
              <span className="text-xs font-semibold">Salida{horaOut ? ` · ${horaOut}` : ''}</span>
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  )
}
