// Tipos y generadores del Listado de Precios Abocados.
// El documento se guarda como JSON en la tabla `listado_precios` (fila singleton id=1).

export type PrecioItem = { id: string; producto: string; formato: string; precio: string }
export type PrecioBlock = { id: string; icono: string; titulo: string; items: PrecioItem[] }
export type PrecioCat = { id: string; icono: string; titulo: string; blocks: PrecioBlock[] }
export type ListadoDoc = { vigencia: string; data: PrecioCat[] }

export const EMPRESA = {
  nombre: 'Frutas y Verduras Abocados S.L.',
  tel: '613 843 383',
  email: 'frutasabocados@gmail.com',
}

let _uid = 0
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(_uid++).toString(36)}`

export function emptyItem(): PrecioItem {
  return { id: newId('i'), producto: 'Nuevo producto', formato: 'Kg', precio: '0,00 €' }
}
export function emptyBlock(): PrecioBlock {
  return { id: newId('b'), icono: '🟢', titulo: 'NUEVO BLOQUE', items: [emptyItem()] }
}
export function emptyCat(): PrecioCat {
  return { id: newId('c'), icono: '🟢', titulo: 'NUEVA CATEGORÍA', blocks: [emptyBlock()] }
}

export function countItems(data: PrecioCat[]): number {
  return data.reduce((a, c) => a + c.blocks.reduce((b, x) => b + x.items.length, 0), 0)
}

// ---- Escapado HTML para el documento exportable ----
const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// Una celda de precio: badge para ENCARGO / TEMPORADA, si no texto normal.
function priceCell(precio: string): string {
  const p = (precio || '').trim()
  const up = p.toUpperCase()
  if (up === 'ENCARGO') return '<span class="badge order">ENCARGO</span>'
  if (up === 'TEMPORADA') return '<span class="badge season">TEMPORADA</span>'
  return esc(p)
}

// CSS de marca (idéntico al catálogo original Abocados).
export const CATALOG_CSS = `
.page{--green:#163426;--gold:#bc993c;--paper:#f7f5ee;--muted:#6b7280;--line:#e5e7eb;--red:#b02621;--teal:#158475;--purple:#6715e8;--orange:#ce630b;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.35;color:#181e2a;max-width:980px;margin:0 auto;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.12)}
.page *{box-sizing:border-box}
.page header{background:linear-gradient(135deg,var(--green),#0e2419);color:#fff;padding:34px 42px 24px;position:relative}
.page .logo{font-size:42px;line-height:1}
.page h1{margin:8px 0 4px;font-size:34px;letter-spacing:-.02em}
.page .subtitle{opacity:.8;text-transform:uppercase;font-weight:700;font-size:13px;letter-spacing:.08em}
.page .contact{display:flex;gap:22px;flex-wrap:wrap;margin-top:18px;font-weight:700}
.page .catalog{margin-left:auto;text-align:right}
.page .bar{background:var(--gold);color:var(--green);font-weight:800;text-align:center;padding:9px 14px;font-size:13px;letter-spacing:.04em}
.page .content{padding:24px 28px 36px}
.page .category{break-inside:avoid;margin-bottom:30px}
.page .category h2{font-size:22px;color:var(--green);margin:0 0 14px;padding-bottom:8px;border-bottom:3px solid var(--gold)}
.page .block{border:1px solid var(--line);border-radius:16px;margin:0 0 18px;overflow:hidden;background:#fff;break-inside:avoid}
.page .block-head{display:flex;align-items:center;gap:10px;background:var(--green);color:#fff;padding:12px 16px}
.page .block:nth-of-type(2n) .block-head{background:#158475}
.page .block:nth-of-type(3n) .block-head{background:#b02621}
.page .block:nth-of-type(4n) .block-head{background:#6715e8}
.page .icon{font-size:22px}
.page .block h3{margin:0;font-size:16px;letter-spacing:.03em;flex:1}
.page .count{background:rgba(255,255,255,.18);border-radius:999px;padding:3px 9px;font-size:12px;font-weight:800}
.page table{width:100%;border-collapse:collapse}
.page th{font-size:12px;text-transform:uppercase;letter-spacing:.07em;text-align:left;color:var(--muted);background:#f8f8f5;padding:10px 14px}
.page td{padding:10px 14px;border-top:1px solid var(--line);font-size:14px}
.page tbody tr:nth-child(even){background:#f7f7f2}
.page .price{text-align:right;font-weight:800;color:var(--green);white-space:nowrap}
.page .badge{display:inline-block;border-radius:999px;padding:4px 9px;font-size:12px}
.page .badge.order{background:#e8e3fe;color:#4800a7}
.page .badge.season{background:#fdf1bb;color:#7e2f0d}
.page footer{background:var(--green);color:rgba(255,255,255,.78);padding:18px 28px;text-align:center}
.page .footer-brand{color:var(--gold);font-weight:800}
.page .note{font-size:12px;margin-top:5px}
@media(max-width:650px){.page{border-radius:0}.page header{padding:26px 20px}.page .content{padding:16px}.page h1{font-size:27px}.page td,.page th{padding:9px 8px;font-size:13px}.page .catalog{margin-left:0;text-align:left}}
`.trim()

// Markup del catálogo (solo el <main class="page">…</main>).
export function buildPageMarkup(doc: ListadoDoc): string {
  const nav = doc.data
    .map((c) => `<a href="#${c.id}">${esc(c.icono)} ${esc(c.titulo)}</a>`)
    .join('')
  const cats = doc.data
    .map((c) => {
      const blocks = c.blocks
        .map((b) => {
          const rows = b.items
            .map(
              (it) =>
                `<tr><td>${esc(it.producto)}</td><td>${esc(it.formato)}</td><td class="price">${priceCell(it.precio)}</td></tr>`,
            )
            .join('')
          return `<div class="block"><div class="block-head"><span class="icon">${esc(b.icono)}</span><h3>${esc(b.titulo)}</h3><span class="count">${b.items.length}</span></div><table><thead><tr><th>Producto</th><th>Formato</th><th>Precio</th></tr></thead><tbody>${rows}</tbody></table></div>`
        })
        .join('')
      return `<section class="category" id="${c.id}"><h2>${esc(c.icono)} ${esc(c.titulo)}</h2>${blocks}</section>`
    })
    .join('')

  return `<main class="page"><header><div class="logo">🥑</div><h1>${esc(EMPRESA.nombre)}</h1><div class="subtitle">Mayoristas · Reparto a hostelería, eventos y comercios</div><div class="contact"><span>📞 ${esc(EMPRESA.tel)}</span><span>✉️ ${esc(EMPRESA.email)}</span><span class="catalog">Catálogo de Precios · <strong>${esc(doc.vigencia)}</strong></span></div></header><div class="bar">TARIFA VIGENTE ${esc(doc.vigencia.toUpperCase())} · PRECIOS SIN IVA · SUJETO A DISPONIBILIDAD</div><nav class="nav-cat" style="display:none">${nav}</nav><div class="content">${cats}</div><footer><div class="footer-brand">${esc(EMPRESA.nombre)}</div><div>📞 ${esc(EMPRESA.tel)} · ✉️ ${esc(EMPRESA.email)}</div><div class="note">Precios sin IVA (10%) · Sujetos a variación</div></footer></main>`
}

// Documento HTML completo y autónomo (para imprimir / guardar / compartir).
export function buildStandaloneHtml(doc: ListadoDoc): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Catálogo de Precios Abocados · ${esc(doc.vigencia)}</title><style>body{margin:0;background:#e2e3d9;padding:24px 0}@media print{body{background:#fff;padding:0}.page{box-shadow:none!important;border-radius:0!important;max-width:none!important}}${CATALOG_CSS}</style></head><body>${buildPageMarkup(doc)}</body></html>`
}

// Nombre de archivo seguro.
export function pdfFileName(doc: ListadoDoc): string {
  const v = doc.vigencia.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
  return `Listado-Precios-Abocados-${v || 'actual'}.pdf`
}
