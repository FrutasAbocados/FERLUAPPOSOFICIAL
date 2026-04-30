// Smoke test del parser frontend de pedidos WhatsApp.
// Ejecuta: npx tsx scripts/smoke-parser.ts
// No toca Supabase ni la edge IA — solo regex + diccionario fallback.
import { parsearLineaConRegex } from '../src/modules/pedidos-wa/lib/parser/core'
import { preprocesar } from '../src/modules/pedidos-wa/lib/parser/preprocesar'

const ABREVIATURAS_FALLBACK: Record<string, string> = {
  'pim':              'Pimiento',
  'pim rojo':         'Pimiento rojo california',
  'pim verde':        'Pimiento verde california',
  'pim italiano':     'Pimiento italiano',
  'pim padron':       'Pimiento de padrón',
  'tom':              'Tomate',
  'tom pera':         'Tomate pera',
  'tomate pera':      'Tomate pera',
  'daniela':          'Tomate daniela',
  'cherry':           'Tomate cherry',
  'huevo toro':       'Tomate huevo de toro',
  'rosa':             'Tomate rosa',
  'iceberg':          'Lechuga iceberg',
  'romana':           'Lechuga romana',
  'champi':           'Champiñón entero',
  'champi laminado':  'Champiñón laminado',
  'rucula':           'Rúcula',
  'canonigos':        'Canónigos',
  'mezclum':          'Mezclum',
  'micromezclum':     'Micromezclum',
  'micro mezclum':    'Micromezclum',
  'baby leaf':        'Baby leaf',
  'escarola':         'Escarola',
  'cogollo':          'Cogollos cortos',
  'cogollos':         'Cogollos cortos',
  'cogollo corto':    'Cogollos cortos',
  'cogollos cortos':  'Cogollos cortos',
  'cogollos largos':  'Cogollos largos',
  'nueva':            'Patata nueva',
  'torcal':           'Patata torcal',
  'monalisa':         'Patata monalisa',
  'agria':            'Patata agria negra',
  'agria negra':      'Patata agria negra',
  'agria negro':      'Patata agria negra',
  'ajo pelado':       'Ajo pelado',
  'judia bobby':      'Judía bobby',
  'judia':            'Judía',
  'platanos':         'Plátano canario',
  'banana':           'Banana',
  'bananas':          'Banana',
}

const EJEMPLOS: { titulo: string; texto: string; espera: { notasAdmin?: string; subsecciones?: string[] } }[] = [
  {
    titulo: '1) Separador /',
    texto:  '5 iceberg / 1/2 c berenjena / 1/2 c limon / 5 kg cebolla / 1 mango / 1 c champi',
    espera: {},
  },
  {
    titulo: '2) Variantes saco/kg/bolsa',
    texto:  '1 saco torcal / 11 kg tom pera / 1 ajo pelado / 7 iceberg / 1 kg cherry / 2 bolsas pim padron / 6 kg cebolla / 4 pim rojo / 2 kg pim italiano',
    espera: {},
  },
  {
    titulo: '3) Sub-sección ANDREA',
    texto:  '2 c naranja / 8 limas / 5 limon / 10 bananas / 1 piña / 2 manzanas\nANDREA: 5 platanos / 4 peras / 3 manzanas / 3 kiwi / 1 melon pequeño / 3 mandarina / 0,5kg fresa',
    espera: { subsecciones: ['ANDREA'] },
  },
  {
    titulo: '4) Caja pequeña (peti)',
    texto:  '1peti pim rojo / 1peti pim verde / 8 cebollas / 1 peti daniela / 4 iceberg / 3 puerros / 2 perejil / 1 peti berenjena',
    espera: {},
  },
  {
    titulo: '5) Decimales y bolsa',
    texto:  '7 brocolis / 3 coliflor / 1 bolsa zanahoria / 8 calabacines / 2,5 kg judia bobby / 1 ajo pelado / 2 berenjena / 2 esparragos verdes / 3 albahaca / 2 pim rojo / 2 pim verde / 1 hierbabuena / 4 platanos / 1 pomelo / 2 kg limon',
    espera: {},
  },
  {
    titulo: '6) Calificadores básicos',
    texto:  '10 pim verde / 10 pim rojo / 10 calabacin / 3 kg cebolla / 3 kg cebolla morada / 2 iceberg / 1 lechuga romana',
    espera: {},
  },
  {
    titulo: '7) BUENO + MONALISA + 1/2 c',
    texto:  '1/2 c huevo / 1/2 c pim italiano / 1 c pim rojo / 1 kg pepino / 2 calabacin / 2 kg berenjena / 2 rucula / 4 iceberg / 2 mezclum / 2 cogollos cortos / 2 kg tom pera / 3 kg daniela BUENO / 1 kg cebolla morada / 4 brocoli / 1 kg judia / 2 kg zanahoria / 4 manzanas / 2 bolsas pim padron / 1 saco patata MONALISA',
    espera: {},
  },
  {
    titulo: '8) Productos especiales (flores)',
    texto:  '2 kg fresas / 6 frambuesa / 2 c naranja / 1 hoja bambu / 3 mini pensamiento / 2 mini rosas',
    espera: {},
  },
  {
    titulo: '9) COBRAR FACT ANTERIOR (notas admin)',
    texto:  'COBRAR FACT ANTERIOR\n2 iceberg / 2 kg tom daniela / 2 kg tom pera rojos / 1 c naranja / 2 cartones huevos / 3 bolsa espinacas / 6 puerros limpios',
    espera: { notasAdmin: 'COBRAR FACT ANTERIOR' },
  },
  {
    titulo: '10) Sacos grandes',
    texto:  '15 sacos agria negro / 5 sacos nueva / 1 saco cebolla / 4 sacos carbon / 1 c aguacate',
    espera: {},
  },
]

type Stat = {
  total: number
  altas: number
  resueltasDict: number
  bajas: { linea: string; razon: string }[]
  noEnDict: { linea: string; productoFinal: string }[]
}

function evalEjemplo(texto: string): {
  notasAdmin: string | null
  subsecciones: string[]
  stat: Stat
  detalle: Array<{ subseccion: string | null; line: string; r: ReturnType<typeof parsearLineaConRegex> }>
} {
  const pre = preprocesar(texto)
  const stat: Stat = { total: 0, altas: 0, resueltasDict: 0, bajas: [], noEnDict: [] }
  const detalle: Array<{ subseccion: string | null; line: string; r: ReturnType<typeof parsearLineaConRegex> }> = []
  for (const sec of pre.secciones) {
    for (const line of sec.lineas) {
      stat.total++
      const r = parsearLineaConRegex(line, ABREVIATURAS_FALLBACK)
      detalle.push({ subseccion: sec.nombre ?? null, line, r })
      if (r.confianza === 'alta') {
        stat.altas++
        // ¿Lo resolvió el diccionario? Heurística: el producto resuelto difiere
        // del raw capitalizado (= no se hubiera quedado como tal sin dict).
        const raw = r.linea.productoRaw
        const lowered = raw.toLowerCase().replace(/\s+/g, ' ').trim()
        const tokens = lowered.split(' ').filter(Boolean)
        let hit = false
        for (let len = tokens.length; len >= 1 && !hit; len--) {
          for (let start = 0; start + len <= tokens.length && !hit; start++) {
            const sub = tokens.slice(start, start + len).join(' ')
            if (ABREVIATURAS_FALLBACK[sub]) { hit = true }
          }
        }
        if (hit) stat.resueltasDict++
        else stat.noEnDict.push({ linea: line, productoFinal: r.linea.producto })
      } else {
        stat.bajas.push({ linea: line, razon: r.razon })
      }
    }
  }
  return {
    notasAdmin: pre.notasAdmin,
    subsecciones: pre.secciones.filter(s => s.nombre).map(s => s.nombre!),
    stat,
    detalle,
  }
}

let totalLineas = 0
let totalAltas = 0
let totalDict = 0
let okEsperas = 0
let totalEsperas = 0
const noEnDictAgg: { linea: string; productoFinal: string }[] = []
const bajasAgg: { linea: string; razon: string }[] = []

for (const ej of EJEMPLOS) {
  const r = evalEjemplo(ej.texto)
  totalLineas += r.stat.total
  totalAltas += r.stat.altas
  totalDict += r.stat.resueltasDict
  noEnDictAgg.push(...r.stat.noEnDict)
  bajasAgg.push(...r.stat.bajas)

  console.log(`\n── ${ej.titulo}`)
  console.log(
    `   total=${r.stat.total}  altas=${r.stat.altas}  dict=${r.stat.resueltasDict}` +
    `  fuera_dict=${r.stat.noEnDict.length}  bajas=${r.stat.bajas.length}`,
  )
  if (ej.espera.notasAdmin !== undefined) {
    totalEsperas++
    const ok = (r.notasAdmin ?? '').includes(ej.espera.notasAdmin)
    if (ok) okEsperas++
    console.log(`   notasAdmin esperaba="${ej.espera.notasAdmin}" got="${r.notasAdmin}" → ${ok ? 'OK' : 'FAIL'}`)
  }
  if (ej.espera.subsecciones) {
    totalEsperas++
    const ok = ej.espera.subsecciones.every(s => r.subsecciones.includes(s))
    if (ok) okEsperas++
    console.log(`   subsecciones esperaba=${JSON.stringify(ej.espera.subsecciones)} got=${JSON.stringify(r.subsecciones)} → ${ok ? 'OK' : 'FAIL'}`)
  }
  // Verificación específica ejemplo 7: "BUENO" debe quedar en notas
  if (ej.titulo.startsWith('7)')) {
    totalEsperas++
    const danielaBueno = r.detalle.find(d => /3\s*kg\s+daniela/i.test(d.line))
    const ok = danielaBueno?.r.confianza === 'alta' && /BUENO/i.test(danielaBueno?.r.linea.notas ?? '')
    if (ok) okEsperas++
    console.log(`   ejemplo7 "BUENO" como nota → ${ok ? 'OK' : 'FAIL'} (notas="${danielaBueno?.r.confianza === 'alta' ? danielaBueno.r.linea.notas : '—'}")`)
  }
}

console.log('\n══════════════════════════════════════════════════════════════════')
console.log(`Líneas totales: ${totalLineas}`)
console.log(`Confianza alta (regex OK): ${totalAltas} (${pct(totalAltas, totalLineas)})`)
console.log(`Producto resuelto vía diccionario: ${totalDict} (${pct(totalDict, totalLineas)})`)
console.log(`Validaciones específicas: ${okEsperas}/${totalEsperas}`)

console.log('\nLíneas que NO encontraron match en diccionario (candidatas a ampliar dict o fallback IA):')
const aggUnique = new Map<string, { linea: string; productoFinal: string }>()
for (const x of noEnDictAgg) aggUnique.set(x.linea, x)
for (const x of aggUnique.values()) {
  console.log(`  · "${x.linea}" → "${x.productoFinal}"`)
}

if (bajasAgg.length > 0) {
  console.log('\nLíneas con confianza BAJA (irían a fallback IA):')
  for (const b of bajasAgg) console.log(`  · "${b.linea}" (razón: ${b.razon})`)
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((n / total) * 100)}%`
}
