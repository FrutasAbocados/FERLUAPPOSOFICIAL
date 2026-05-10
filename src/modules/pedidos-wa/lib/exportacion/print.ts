import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { REPARTIDOR_LABEL, UNIDAD_LABEL, type Pedido, type Repartidor } from '../types'

const REPARTIDOR_ORDER: Repartidor[] = ['TORRES', 'GERMAN', 'RAUL', 'ALEX']

const REP_COLOR: Record<Repartidor, string> = {
  TORRES: '#3B82F6',
  GERMAN: '#10B981',
  RAUL:   '#F97316',
  ALEX:   '#8B5CF6',
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatN(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function ordenSalida(s: string | null | undefined): number {
  if (s === 'PRIMERA' || s == null) return 0
  if (s === 'SEGUNDA') return 1
  return 2
}

function buildProductosHtml(p: Pedido): string {
  let html = ''
  if (p.notas_admin) {
    html += `<li class="nota-admin">* ${esc(p.notas_admin)}</li>`
  }
  const porSeccion = new Map<string, Pedido['lineas']>()
  for (const l of p.lineas ?? []) {
    const sec = l.subseccion ?? ''
    if (!porSeccion.has(sec)) porSeccion.set(sec, [])
    porSeccion.get(sec)!.push(l)
  }
  for (const [sec, lineas] of [...porSeccion.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (sec) html += `<li class="sec-label">${esc(sec)}</li>`
    for (const l of lineas!) {
      const qty  = formatN(Number(l.cantidad))
      const unit = UNIDAD_LABEL[l.unidad]
      const nota = l.notas ? ` <em class="l-nota">(${esc(l.notas)})</em>` : ''
      const free = l.es_gratis ? ' <span class="l-free">GRATIS</span>' : ''
      html += `<li>${qty} ${esc(unit)} <strong>${esc(l.producto_normalizado)}</strong>${nota}${free}</li>`
    }
  }
  return html
}

function buildRepSection(rep: Repartidor, pedidos: Pedido[]): string {
  const color     = REP_COLOR[rep]
  const label     = REPARTIDOR_LABEL[rep]
  const totalLineas = pedidos.reduce((acc, p) => acc + (p.lineas?.length ?? 0), 0)

  let rows = ''
  let prevSalida: string | null | undefined = undefined
  let altBg = false

  for (const p of pedidos) {
    const salida  = p.override_salida ?? p.cliente?.salida ?? null
    const horario = p.override_horario ?? p.cliente?.horario ?? ''
    const c       = p.cliente

    if (
      (rep === 'GERMAN' || rep === 'RAUL') &&
      salida === 'SEGUNDA' &&
      prevSalida !== 'SEGUNDA' &&
      prevSalida !== undefined
    ) {
      rows += `<tr class="tr-salida"><td colspan="5">— Segunda salida —</td></tr>`
    }

    const notaCliente = c?.notas
      ? `<div class="nota-cliente">&#9888; ${esc(c.notas)}</div>`
      : ''
    const productosHtml = buildProductosHtml(p)
    const bg = altBg ? 'style="background:#f5f5f5"' : ''

    rows += `
      <tr ${bg}>
        <td class="col-horario">${esc(horario)}</td>
        <td class="col-cliente">${esc(c?.nombre ?? '—')}${notaCliente}</td>
        <td class="col-factura">${esc(c?.tipo_factura ?? '')}</td>
        <td class="col-pedido"><ul class="productos">${productosHtml}</ul></td>
        <td class="col-faltas">${esc(p.faltas ?? '')}</td>
      </tr>`

    altBg = !altBg
    prevSalida = salida
  }

  return `
    <div class="rep-section">
      <div class="rep-header" style="background:${color}">
        <span>${esc(label)}</span>
        <span class="rep-meta">${pedidos.length} paradas &middot; ${totalLineas} lineas</span>
      </div>
      <table>
        <thead>
          <tr>
            <th class="col-horario">HORARIO</th>
            <th class="col-cliente">CLIENTE</th>
            <th class="col-factura">FACTURA</th>
            <th class="col-pedido">PEDIDO</th>
            <th class="col-faltas">FALTAS</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

export function imprimirHojaRuta(pedidos: Pedido[], fechaIso: string) {
  const titulo = format(new Date(fechaIso + 'T12:00:00'), "EEEE d 'de' MMMM yyyy", { locale: es })

  const sorted = [...pedidos].sort((a, b) => {
    const repA = (a.override_repartidor ?? a.cliente?.repartidor) as Repartidor | undefined
    const repB = (b.override_repartidor ?? b.cliente?.repartidor) as Repartidor | undefined
    const ra = REPARTIDOR_ORDER.indexOf(repA ?? 'ALEX')
    const rb = REPARTIDOR_ORDER.indexOf(repB ?? 'ALEX')
    if (ra !== rb) return ra - rb
    const oa = a.override_orden, ob = b.override_orden
    if (oa != null && ob != null) return oa - ob
    if (oa != null) return -1
    if (ob != null) return 1
    const sa = ordenSalida(a.override_salida ?? a.cliente?.salida)
    const sb = ordenSalida(b.override_salida ?? b.cliente?.salida)
    if (sa !== sb) return sa - sb
    return (a.override_horario ?? a.cliente?.horario ?? '').localeCompare(
      b.override_horario ?? b.cliente?.horario ?? '',
    )
  })

  const grupos = REPARTIDOR_ORDER
    .map(rep => ({
      rep,
      pedidos: sorted.filter(
        p => (p.override_repartidor ?? p.cliente?.repartidor) === rep,
      ),
    }))
    .filter(g => g.pedidos.length > 0)

  const sectionsHtml = grupos.map(g => buildRepSection(g.rep, g.pedidos)).join('\n')
  const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Hoja de Ruta ${esc(fechaIso)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#111;padding:12px}
    .page-title{font-size:13pt;font-weight:bold;margin-bottom:3px;text-transform:capitalize}
    .page-sub{font-size:8pt;color:#666;margin-bottom:16px}
    .rep-section{margin-bottom:24px}
    .rep-header{color:#fff;font-weight:bold;font-size:10.5pt;padding:5px 10px;display:flex;align-items:center;justify-content:space-between;border-radius:3px 3px 0 0}
    .rep-meta{font-size:8.5pt;opacity:.88;font-weight:normal}
    table{width:100%;border-collapse:collapse}
    th{background:#1D4E2A;color:#fff;font-size:7.5pt;padding:4px 6px;text-align:left;border:1px solid #444;text-transform:uppercase;letter-spacing:.04em}
    td{border:1px solid #d1d5db;padding:4px 7px;vertical-align:top}
    .col-horario{width:48px;text-align:center;font-weight:bold;font-size:9.5pt;white-space:nowrap}
    .col-cliente{width:140px;font-weight:bold;font-size:9pt}
    .col-factura{width:55px;text-align:center;font-size:8pt}
    .col-faltas{width:90px;font-size:8.5pt}
    .col-pedido{width:auto;min-width:120px}
    ul.productos{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:0;line-height:1.6}
    ul.productos li{display:inline;font-size:8.5pt;white-space:nowrap}
    ul.productos li::after{content:" · ";color:#aaa}
    ul.productos li:last-child::after{content:""}
    .sec-label{display:block;font-weight:bold;color:#374151;font-size:8pt;text-decoration:underline;margin-top:3px}
    .sec-label::after{content:""}
    .nota-admin{display:block;color:#b45309;font-style:italic;margin-bottom:2px}
    .nota-admin::after{content:""}
    .nota-cliente{color:#dc2626;font-size:7.5pt;font-weight:bold;margin-top:2px}
    .l-nota{color:#6b7280;font-size:8pt}
    .l-free{color:#059669;font-weight:bold;font-size:7.5pt}
    .tr-salida td{background:#e5e7eb !important;font-weight:bold;font-style:italic;text-align:center;font-size:8pt;color:#374151;border-color:#9ca3af}
    .btn-print{position:fixed;top:12px;right:12px;background:#1D4E2A;color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:10pt;cursor:pointer;font-weight:bold;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,.25)}
    .btn-print:hover{background:#16402a}
    .tip-horizontal{position:fixed;top:12px;left:12px;background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:6px;padding:6px 14px;font-size:9pt;font-weight:bold;z-index:999}
    @page{size:A4 landscape;margin:10mm 12mm}
    @media print{
      @page{size:A4 landscape;margin:10mm 12mm}
      body{padding:0}
      .rep-section{page-break-after:always;margin-bottom:0}
      .rep-section:last-child{page-break-after:avoid}
      .no-print{display:none}
    }
  </style>
</head>
<body>
  <button class="btn-print no-print" onclick="window.print()">Imprimir / PDF</button>
  <div class="tip-horizontal no-print">⚠️ Selecciona HORIZONTAL en el diálogo de impresión</div>
  <div class="page-title">Hoja de Ruta &middot; ${esc(titulo)}</div>
  <div class="page-sub">Generado a las ${hora} &middot; Frutas Abocados</div>
  ${sectionsHtml}
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const w    = window.open(url, '_blank')
  if (w) w.addEventListener('load', () => URL.revokeObjectURL(url), { once: true })
  else URL.revokeObjectURL(url)
}
