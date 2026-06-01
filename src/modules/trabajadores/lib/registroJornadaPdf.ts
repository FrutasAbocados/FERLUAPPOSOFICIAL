import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export interface FichajeExport {
  empleado_id: string
  empleado_nombre: string
  ts_in: string
  ts_out: string | null
  fecha: string // YYYY-MM-DD (Madrid)
  horas: number | null
  fuente: string
}

const EMPRESA = 'FERLU PROJECT S.L.'
const CIF = 'B22560510'
const MARCA = 'Frutas Abocados'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function horaMadrid(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
}

function fmtHoras(h: number): string {
  const totalMin = Math.round(h * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${hh}h${mm > 0 ? String(mm).padStart(2, '0') : ''}`
}

function buildEmpleadoSection(nombre: string, filas: FichajeExport[]): string {
  let rows = ''
  let totalEmp = 0
  let abiertos = 0
  let altBg = false

  for (const f of filas) {
    const horas = f.horas ?? 0
    totalEmp += horas
    if (f.ts_out == null) abiertos++
    const bg = altBg ? ' style="background:#f6f7f6"' : ''
    const manual = f.fuente === 'manual_admin'
    rows += `
      <tr${bg}>
        <td class="c-fecha">${esc(format(parseISO(f.fecha), 'dd/MM/yyyy', { locale: es }))}</td>
        <td class="c-dia">${esc(format(parseISO(f.fecha), 'EEE', { locale: es }))}</td>
        <td class="c-h">${esc(horaMadrid(f.ts_in))}</td>
        <td class="c-h">${f.ts_out ? esc(horaMadrid(f.ts_out)) : '<span class="abierto">SIN&nbsp;SALIDA</span>'}</td>
        <td class="c-horas">${f.horas != null ? esc(fmtHoras(f.horas)) : '—'}</td>
        <td class="c-fuente">${manual ? '<span class="manual">corrección manual</span>' : 'app'}</td>
      </tr>`
    altBg = !altBg
  }

  const avisoAbiertos = abiertos > 0
    ? `<div class="aviso">⚠️ ${abiertos} registro(s) sin hora de salida en este periodo — revisar antes de presentar.</div>`
    : ''

  return `
    <div class="emp-section">
      <div class="emp-header">
        <span class="emp-nombre">${esc(nombre)}</span>
        <span class="emp-total">Total periodo: <strong>${esc(fmtHoras(totalEmp))}</strong> &middot; ${filas.length} registro(s)</span>
      </div>
      ${avisoAbiertos}
      <table>
        <thead>
          <tr>
            <th class="c-fecha">FECHA</th>
            <th class="c-dia">DÍA</th>
            <th class="c-h">ENTRADA</th>
            <th class="c-h">SALIDA</th>
            <th class="c-horas">HORAS</th>
            <th class="c-fuente">ORIGEN</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" class="vacio">Sin fichajes en el periodo</td></tr>'}</tbody>
      </table>
      <div class="firmas">
        <div class="firma"><div class="firma-linea"></div>Firma de la empresa</div>
        <div class="firma"><div class="firma-linea"></div>Firma del trabajador/a</div>
      </div>
    </div>`
}

/**
 * Genera e imprime (→ guardar como PDF) el Registro de Jornada del periodo,
 * agrupado por trabajador. Formato A4 vertical, listo para Inspección de
 * Trabajo / Hacienda / gestoría. Reutiliza el patrón window.print() del repo.
 */
export function imprimirRegistroJornada(filas: FichajeExport[], desde: string, hasta: string) {
  // Agrupar por empleado conservando el orden (la RPC ya viene ordenada por nombre)
  const porEmpleado = new Map<string, FichajeExport[]>()
  for (const f of filas) {
    const arr = porEmpleado.get(f.empleado_nombre) ?? []
    arr.push(f)
    porEmpleado.set(f.empleado_nombre, arr)
  }

  const periodo = `${format(parseISO(desde), "d 'de' LLLL yyyy", { locale: es })} — ${format(parseISO(hasta), "d 'de' LLLL yyyy", { locale: es })}`
  const generado = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' })

  const secciones = [...porEmpleado.entries()].map(([nombre, fs]) => buildEmpleadoSection(nombre, fs)).join('\n')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Registro de Jornada ${esc(desde)} a ${esc(hasta)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#111;padding:16px}
    .doc-head{border-bottom:2px solid #1D4E2A;padding-bottom:10px;margin-bottom:16px}
    .doc-title{font-size:15pt;font-weight:bold;color:#1D4E2A}
    .doc-empresa{font-size:10pt;font-weight:bold;margin-top:4px}
    .doc-meta{font-size:8.5pt;color:#555;margin-top:2px}
    .emp-section{margin-bottom:22px;page-break-inside:avoid}
    .emp-header{display:flex;justify-content:space-between;align-items:baseline;background:#1D4E2A;color:#fff;padding:6px 10px;border-radius:3px 3px 0 0}
    .emp-nombre{font-size:11pt;font-weight:bold}
    .emp-total{font-size:8.5pt}
    .aviso{background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-top:none;padding:4px 10px;font-size:8pt;font-weight:bold}
    table{width:100%;border-collapse:collapse}
    th{background:#e8efe9;color:#1D4E2A;font-size:7.5pt;padding:4px 6px;text-align:left;border:1px solid #c3d3c6;text-transform:uppercase;letter-spacing:.03em}
    td{border:1px solid #d6dbd7;padding:3.5px 7px;font-size:9pt}
    .c-fecha{width:78px}
    .c-dia{width:42px;text-transform:capitalize;color:#555}
    .c-h{width:70px;text-align:center;font-weight:bold;font-variant-numeric:tabular-nums}
    .c-horas{width:60px;text-align:right;font-variant-numeric:tabular-nums}
    .c-fuente{width:110px;font-size:8pt;color:#555}
    .abierto{color:#b91c1c;font-weight:bold;font-size:7.5pt}
    .manual{color:#b45309;font-style:italic}
    .vacio{text-align:center;color:#888;font-style:italic}
    .firmas{display:flex;gap:60px;margin-top:14px;padding:0 6px}
    .firma{flex:1;font-size:8pt;color:#555;text-align:center}
    .firma-linea{border-top:1px solid #888;margin-bottom:4px;height:34px}
    .legal{margin-top:18px;border-top:1px solid #ccc;padding-top:8px;font-size:7.5pt;color:#666;line-height:1.5}
    .btn-print{position:fixed;top:12px;right:12px;background:#1D4E2A;color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:10pt;cursor:pointer;font-weight:bold;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,.25)}
    .btn-print:hover{background:#16402a}
    @page{size:A4 portrait;margin:12mm 12mm}
    @media print{
      body{padding:0}
      .no-print{display:none}
      .emp-section{page-break-inside:avoid}
    }
  </style>
</head>
<body>
  <button class="btn-print no-print" onclick="window.print()">Guardar / Imprimir PDF</button>
  <div class="doc-head">
    <div class="doc-title">Registro de Jornada Laboral</div>
    <div class="doc-empresa">${esc(EMPRESA)} &middot; CIF ${esc(CIF)} <span style="font-weight:normal;color:#666">(${esc(MARCA)})</span></div>
    <div class="doc-meta">Periodo: ${esc(periodo)} &middot; Generado: ${esc(generado)} &middot; ${porEmpleado.size} trabajador(es)</div>
  </div>
  ${secciones || '<p class="vacio">Sin fichajes en el periodo seleccionado.</p>'}
  <div class="legal">
    Registro diario de jornada conforme al art. 34.9 del Estatuto de los Trabajadores (RD-ley 8/2019, de 8 de marzo).
    Horas en zona horaria de Madrid. Documento conservado durante 4 años a disposición de los trabajadores, sus representantes
    y la Inspección de Trabajo y Seguridad Social. Los registros marcados como «corrección manual» han sido ajustados por la
    empresa por incidencias de fichaje.
  </div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank')
  if (w) w.addEventListener('load', () => URL.revokeObjectURL(url), { once: true })
  else URL.revokeObjectURL(url)
}
