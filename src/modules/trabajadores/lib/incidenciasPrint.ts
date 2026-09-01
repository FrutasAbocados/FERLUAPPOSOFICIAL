import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Incidencia, IncidenciaEstado, IncidenciaTipo } from './incidencias-queries'

/**
 * Parte de incidencias para imprimir por la mañana.
 *
 * Una sección por cliente, ordenadas alfabéticamente, con las generales al
 * final. Recibe sólo incidencias sin resolver (ver `useIncidenciasSinResolver`):
 * el papel de la mañana es lo que queda por hacer, no un histórico.
 *
 * Mismo patrón que `registroJornadaPdf.ts` y `pedidos-wa/exportacion/print.ts`:
 * se construye un HTML autocontenido y se abre en pestaña nueva con botón de
 * imprimir; el navegador se encarga del PDF.
 */

const MARCA = 'Frutas Abocados'
const VERDE = '#1D4E2A'
const GENERAL_KEY = '￿__general__'

const TIPO_LABEL: Record<IncidenciaTipo, string> = {
  incidencia: 'Incidencia',
  falta: 'Falta',
  abono: 'Abono',
  otro: 'Otro',
}

/** Colores planos: se imprimen bien en b/n y no dependen del tema de la app. */
const TIPO_COLOR: Record<IncidenciaTipo, { bg: string; fg: string }> = {
  incidencia: { bg: '#fef3c7', fg: '#92400e' },
  falta:      { bg: '#fee2e2', fg: '#991b1b' },
  abono:      { bg: '#dbeafe', fg: '#1e40af' },
  otro:       { bg: '#e5e7eb', fg: '#374151' },
}

const ESTADO_LABEL: Record<IncidenciaEstado, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  resuelta: 'Resuelta',
}

const ESTADO_COLOR: Record<IncidenciaEstado, { bg: string; fg: string }> = {
  pendiente:  { bg: '#ffedd5', fg: '#9a3412' },
  en_proceso: { bg: '#e0e7ff', fg: '#3730a3' },
  resuelta:   { bg: '#dcfce7', fg: '#166534' },
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fechaCorta(iso: string): string {
  return format(parseISO(iso), 'dd/MM/yyyy', { locale: es })
}

function diaSemana(iso: string): string {
  return format(parseISO(iso), 'EEEE', { locale: es })
}

function badge(texto: string, c: { bg: string; fg: string }, extra = ''): string {
  return `<span class="badge" style="background:${c.bg};color:${c.fg};${extra}">${esc(texto)}</span>`
}

function buildFila(inc: Incidencia): string {
  const resolucion = inc.resolucion_nota
    ? `<div class="resolucion"><strong>Resolución:</strong> ${esc(inc.resolucion_nota)}</div>`
    : ''
  const autor = inc.autor_nombre ? `<div class="autor">Anotada por ${esc(inc.autor_nombre)}</div>` : ''

  return `
    <tr>
      <td class="c-fecha">
        <div class="fecha">${esc(fechaCorta(inc.fecha))}</div>
        <div class="dia">${esc(diaSemana(inc.fecha))}</div>
      </td>
      <td class="c-tipo">${badge(TIPO_LABEL[inc.tipo], TIPO_COLOR[inc.tipo])}</td>
      <td class="c-desc">
        <div class="desc">${esc(inc.descripcion)}</div>
        ${resolucion}
        ${autor}
      </td>
      <td class="c-estado">${badge(ESTADO_LABEL[inc.estado], ESTADO_COLOR[inc.estado])}</td>
      <td class="c-check"><span class="casilla"></span></td>
    </tr>`
}

function buildSeccion(cliente: string, incidencias: Incidencia[]): string {
  const pendientes = incidencias.filter(i => i.estado === 'pendiente').length
  const enProceso = incidencias.filter(i => i.estado === 'en_proceso').length
  const aviso = [
    pendientes > 0 ? `<span class="sec-pend">${pendientes} pendiente${pendientes === 1 ? '' : 's'}</span>` : '',
    enProceso > 0 ? `<span class="sec-proc">${enProceso} en proceso</span>` : '',
  ].filter(Boolean).join(' ')

  return `
    <section class="cli-section">
      <header class="cli-header">
        <span class="cli-nombre">${esc(cliente)}</span>
        <span class="cli-meta">${aviso}</span>
      </header>
      <table>
        <thead>
          <tr>
            <th class="c-fecha">Fecha</th>
            <th class="c-tipo">Tipo</th>
            <th class="c-desc">Incidencia</th>
            <th class="c-estado">Estado</th>
            <th class="c-check">Hecho</th>
          </tr>
        </thead>
        <tbody>${incidencias.map(buildFila).join('')}</tbody>
      </table>
    </section>`
}

/**
 * Abre una pestaña con el parte listo para imprimir.
 *
 * @param incidencias Las que se están viendo en pantalla (respeta el filtro).
 * @param filtroLabel Texto del filtro activo, para que el papel diga qué es.
 */
export function imprimirIncidencias(incidencias: Incidencia[], filtroLabel: string): void {
  // Agrupar por cliente; las generales van al final (clave con ￿).
  const porCliente = new Map<string, Incidencia[]>()
  for (const inc of incidencias) {
    const k = inc.contact_name_canon ?? GENERAL_KEY
    const lista = porCliente.get(k)
    if (lista) lista.push(inc)
    else porCliente.set(k, [inc])
  }

  const secciones = [...porCliente.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    .map(([k, lista]) => {
      const ordenadas = [...lista].sort((x, y) => y.fecha.localeCompare(x.fecha))
      return buildSeccion(k === GENERAL_KEY ? 'Generales (sin cliente)' : k, ordenadas)
    })
    .join('')

  const totalClientes = [...porCliente.keys()].filter(k => k !== GENERAL_KEY).length
  const conteoTipos = (Object.keys(TIPO_LABEL) as IncidenciaTipo[])
    .map(t => ({ t, n: incidencias.filter(i => i.tipo === t).length }))
    .filter(x => x.n > 0)
    .map(x => `${x.n} ${TIPO_LABEL[x.t].toLowerCase()}${x.n === 1 ? '' : 's'}`)
    .join(' &middot; ')

  const generado = format(new Date(), "d 'de' LLLL yyyy 'a las' HH:mm", { locale: es })

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Incidencias · ${esc(filtroLabel)} · ${MARCA}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;margin:0;padding:16px;background:#fff}
  .doc-head{border-bottom:3px solid ${VERDE};padding-bottom:8px;margin-bottom:16px}
  .doc-title{font-size:19pt;font-weight:bold;color:${VERDE};letter-spacing:-.01em}
  .doc-sub{font-size:10pt;color:#374151;margin-top:2px;font-weight:600}
  .doc-meta{font-size:8.5pt;color:#6b7280;margin-top:3px}

  .cli-section{margin-bottom:16px;page-break-inside:avoid;border:1px solid #d6dbd7;border-radius:4px;overflow:hidden}
  .cli-header{display:flex;justify-content:space-between;align-items:baseline;gap:12px;background:${VERDE};color:#fff;padding:6px 10px}
  .cli-nombre{font-size:11.5pt;font-weight:bold;letter-spacing:.01em}
  .cli-meta{font-size:8.5pt;opacity:.9;white-space:nowrap}
  .sec-pend{background:#fbbf24;color:#7c2d12;border-radius:9px;padding:1px 7px;font-weight:bold}
  .sec-proc{background:#c7d2fe;color:#312e81;border-radius:9px;padding:1px 7px;font-weight:bold}

  table{width:100%;border-collapse:collapse}
  th{background:#e8efe9;color:${VERDE};font-size:7.5pt;padding:4px 8px;text-align:left;border-bottom:1px solid #c3d3c6;text-transform:uppercase;letter-spacing:.04em}
  td{border-bottom:1px solid #e5e7eb;padding:6px 8px;vertical-align:top;font-size:9.5pt}
  tr:last-child td{border-bottom:none}

  .c-fecha{width:88px}
  .c-tipo{width:82px}
  .c-desc{width:auto}
  .c-estado{width:78px}
  .c-check{width:44px;text-align:center}

  .fecha{font-weight:bold;font-variant-numeric:tabular-nums;white-space:nowrap}
  .dia{font-size:7.5pt;color:#6b7280;text-transform:capitalize}
  .desc{white-space:pre-wrap;line-height:1.4}
  .resolucion{margin-top:3px;font-size:8pt;color:#166534;background:#f0fdf4;border-left:2px solid #86efac;padding:2px 6px}
  .autor{margin-top:3px;font-size:7.5pt;color:#6b7280;font-style:italic}
  .badge{display:inline-block;border-radius:9px;padding:1.5px 7px;font-size:7.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
  .casilla{display:inline-block;width:14px;height:14px;border:1.5px solid #9ca3af;border-radius:3px}

  .vacio{text-align:center;color:#888;font-style:italic;padding:40px 0}
  .btn-print{position:fixed;top:12px;right:12px;background:${VERDE};color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:10pt;cursor:pointer;font-weight:bold;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,.25)}
  .btn-print:hover{background:#16402a}

  @page{size:A4 portrait;margin:12mm 12mm}
  @media print{
    body{padding:0}
    .no-print{display:none}
    .cli-section{page-break-inside:avoid}
  }
</style>
</head>
<body>
  <button class="btn-print no-print" onclick="window.print()">Imprimir / PDF</button>
  <div class="doc-head">
    <div class="doc-title">Parte de incidencias</div>
    <div class="doc-sub">${esc(filtroLabel)} &middot; ${incidencias.length} ${incidencias.length === 1 ? 'apunte' : 'apuntes'} &middot; ${totalClientes} cliente(s)</div>
    <div class="doc-meta">${conteoTipos ? `${conteoTipos} &middot; ` : ''}${MARCA} &middot; Generado el ${esc(generado)}</div>
  </div>
  ${secciones || '<p class="vacio">No hay incidencias en este filtro.</p>'}
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank')
  if (w) w.addEventListener('load', () => URL.revokeObjectURL(url), { once: true })
  else URL.revokeObjectURL(url)
}
