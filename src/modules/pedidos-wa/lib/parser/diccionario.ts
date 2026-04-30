import { supabase } from '@/shared/lib/supabase'
import type { Abreviatura } from '../types'

export const ABREVIATURAS_FALLBACK: Record<string, string> = {
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

type DiccionarioCache = { dict: Record<string, string>; userEntries: Abreviatura[] }

let cache: DiccionarioCache | null = null
let inflight: Promise<DiccionarioCache> | null = null

export async function loadDiccionario(): Promise<DiccionarioCache> {
  if (cache) return cache
  if (inflight) return inflight
  inflight = (async () => {
    const { data, error } = await supabase
      .from('pedidos_wa_abreviaturas')
      .select('id, abreviatura, producto_normalizado, creada_por_user, created_at')
      .order('abreviatura', { ascending: true })
    if (error || !data) {
      cache = { dict: { ...ABREVIATURAS_FALLBACK }, userEntries: [] }
      return cache
    }
    const dict: Record<string, string> = { ...ABREVIATURAS_FALLBACK }
    for (const row of data) {
      dict[row.abreviatura.toLowerCase()] = row.producto_normalizado
    }
    const next: DiccionarioCache = {
      dict,
      userEntries: data.filter(r => r.creada_por_user) as Abreviatura[],
    }
    cache = next
    return next
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function clearDiccionarioCache() {
  cache = null
  inflight = null
}
