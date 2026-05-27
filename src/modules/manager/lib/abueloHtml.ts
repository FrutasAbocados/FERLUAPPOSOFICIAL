import { supabase } from '@/shared/lib/supabase'

interface LineaHtml {
  nombre: string
  units: number
  price: number   // sin IVA
  tax_rate: number
}

function fmt2(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function generarHtmlFacturaAbuelo(opts: {
  id: string
  fecha: string
  numero_factura: string | null
  nota: string | null
  lineas: LineaHtml[]
}): string {
  const { fecha, numero_factura, nota, lineas } = opts

  const subtotal = lineas.reduce((s, l) => s + l.units * l.price, 0)
  const iva      = lineas.reduce((s, l) => s + l.units * l.price * l.tax_rate / 100, 0)
  const total    = subtotal + iva

  const filas = lineas.map(l => {
    const sub = l.units * l.price
    const tot = sub + sub * l.tax_rate / 100
    return `
      <tr>
        <td>${l.nombre}</td>
        <td class="num">${fmt2(l.units)}</td>
        <td class="num">${fmt2(l.price)} €</td>
        <td class="num">${l.tax_rate}%</td>
        <td class="num bold">${fmt2(tot)} €</td>
      </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Factura${numero_factura ? ' ' + numero_factura : ''} — El Abuelo</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #1a1a1a; padding: 40px; max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #1a5c38; }
  .doc-info { text-align: right; }
  .doc-info .num-factura { font-size: 18px; font-weight: 700; color: #1a5c38; }
  .doc-info .fecha { font-size: 12px; color: #555; margin-top: 4px; }
  .cliente-block { background: #f4f8f5; border-left: 4px solid #1a5c38; padding: 12px 16px; margin-bottom: 24px; border-radius: 2px; }
  .cliente-block .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 4px; }
  .cliente-block .nombre { font-size: 15px; font-weight: 700; }
  .cliente-block .pago { font-size: 12px; color: #555; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead tr { background: #1a5c38; color: #fff; }
  thead th { padding: 9px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
  thead th.num { text-align: right; }
  tbody tr { border-bottom: 1px solid #e8ede9; }
  tbody tr:nth-child(even) { background: #f9faf9; }
  tbody td { padding: 8px 12px; }
  .num { text-align: right; }
  .bold { font-weight: 700; }
  .totales { display: flex; justify-content: flex-end; }
  .totales table { width: 260px; }
  .totales td { padding: 5px 12px; font-size: 13px; }
  .totales .total-row td { border-top: 2px solid #1a5c38; font-size: 15px; font-weight: 800; color: #1a5c38; padding-top: 8px; }
  .nota { margin-top: 24px; font-size: 11px; color: #666; font-style: italic; }
  .btn-print { display: block; margin: 32px auto 0; padding: 10px 28px; background: #1a5c38; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; letter-spacing: 0.02em; }
  .btn-print:hover { background: #154d2f; }
  @media print {
    body { padding: 20px; }
    .btn-print { display: none; }
  }
</style>
</head>
<body>
  <div class="header">
    <div></div>
    <div class="doc-info">
      <div class="num-factura">FACTURA${numero_factura ? ' Nº ' + numero_factura : ''}</div>
      <div class="fecha">${new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
    </div>
  </div>

  <div class="cliente-block">
    <div class="label">Facturar a</div>
    <div class="nombre">Restaurante El Abuelo</div>
    <div class="pago">Forma de pago: Al contado</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Descripción</th>
        <th class="num">Cantidad</th>
        <th class="num">Precio u. s/IVA</th>
        <th class="num">IVA</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>

  <div class="totales">
    <table>
      <tbody>
        <tr><td>Subtotal s/IVA</td><td class="num">${fmt2(subtotal)} €</td></tr>
        <tr><td>IVA</td><td class="num">${fmt2(iva)} €</td></tr>
        <tr class="total-row"><td>TOTAL</td><td class="num">${fmt2(total)} €</td></tr>
      </tbody>
    </table>
  </div>

  ${nota ? `<div class="nota">Nota: ${nota}</div>` : ''}

  <button class="btn-print" onclick="window.print()">Imprimir / Guardar PDF</button>
</body>
</html>`
}

export async function subirPdfAbuelo(opts: {
  id: string
  fecha: string
  numero_factura: string | null
  nota: string | null
  lineas: LineaHtml[]
}): Promise<string | null> {
  try {
    const html = generarHtmlFacturaAbuelo(opts)
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
    const path = `${opts.id}.html`

    const { error: upErr } = await supabase.storage
      .from('abuelo-facturas')
      .upload(path, blob, { contentType: 'text/html', upsert: true })
    if (upErr) return null

    const { error: dbErr } = await supabase
      .from('manager_ventas_abuelo')
      .update({ pdf_url: path })
      .eq('id', opts.id)
    if (dbErr) return null

    return path
  } catch { return null }
}

export async function getPdfSignedUrl(path: string): Promise<string | null> {
  try {
    const { data } = await supabase.storage
      .from('abuelo-facturas')
      .createSignedUrl(path, 3600) // 1h
    return data?.signedUrl ?? null
  } catch { return null }
}
