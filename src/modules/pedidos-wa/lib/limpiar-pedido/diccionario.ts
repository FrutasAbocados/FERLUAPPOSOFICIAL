/**
 * Diccionario editable de la herramienta "Limpiar pedido para Excel".
 *
 * Vive SEPARADO del motor (`engine.ts`) a propósito: aquí es donde se enseñan
 * equivalencias nuevas sin tocar la lógica. Tres bloques, tres propósitos:
 *
 *   1. PRODUCT_ALIASES  — cómo se escribe de verdad un producto.
 *   2. DEFAULT_UNITS    — qué formato tiene cuando el pedido no lo dice.
 *   3. NOTAS_OPERATIVAS — qué frases NO son producto.
 *
 * OJO: es un diccionario propio, distinto del de `lib/parser/diccionario.ts`.
 * Aquel normaliza hacia nombres de catálogo Holded ("Pimiento rojo asar kg");
 * éste normaliza hacia la lista de compra que Luis pega en Excel
 * ("Pimiento rojo"). No unificarlos sin decidir antes cuál manda.
 */

export type UnidadLimpia =
  | 'caja'
  | 'caja_pequena'
  | 'bolsa'
  | 'kg'
  | 'saco'
  | 'manojo'
  | 'bandeja'
  | 'paquete'
  | 'malla'
  | 'lecho'
  | 'carton'
  | 'unidad'

/** Singular / plural de cada unidad. `kg` es invariable a propósito. */
export const UNIDAD_LABEL: Record<UnidadLimpia, { uno: string; varios: string }> = {
  caja:         { uno: 'caja',         varios: 'cajas' },
  caja_pequena: { uno: 'caja pequeña', varios: 'cajas pequeñas' },
  bolsa:        { uno: 'bolsa',        varios: 'bolsas' },
  kg:           { uno: 'kg',           varios: 'kg' },
  saco:         { uno: 'saco',         varios: 'sacos' },
  manojo:       { uno: 'manojo',       varios: 'manojos' },
  bandeja:      { uno: 'bandeja',      varios: 'bandejas' },
  paquete:      { uno: 'paquete',      varios: 'paquetes' },
  malla:        { uno: 'malla',        varios: 'mallas' },
  lecho:        { uno: 'lecho',        varios: 'lechos' },
  carton:       { uno: 'cartón',       varios: 'cartones' },
  unidad:       { uno: 'unidad',       varios: 'unidades' },
}

/**
 * Cómo se escribe una unidad en el pedido bruto → unidad canónica.
 * Las claves se comparan en minúsculas y SIN acentos.
 *
 * Regla dura: nunca añadir aquí una abreviatura de una sola letra que también
 * empiece un producto habitual ("b" rompería "1 berros", "p" rompería
 * "1 perejil"). "c" y "u" sobreviven porque el regex exige espacio detrás.
 */
export const UNIDAD_ALIASES: Record<string, UnidadLimpia> = {
  c: 'caja', caja: 'caja', cajas: 'caja', cj: 'caja', cjs: 'caja',
  peti: 'caja_pequena', petis: 'caja_pequena',
  bolsa: 'bolsa', bolsas: 'bolsa', bls: 'bolsa',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg',
  saco: 'saco', sacos: 'saco',
  manojo: 'manojo', manojos: 'manojo', mj: 'manojo',
  bandeja: 'bandeja', bandejas: 'bandeja', bdj: 'bandeja',
  paquete: 'paquete', paquetes: 'paquete', paq: 'paquete',
  malla: 'malla', mallas: 'malla',
  lecho: 'lecho', lechos: 'lecho',
  carton: 'carton', cartones: 'carton',
  unidad: 'unidad', unidades: 'unidad', u: 'unidad', ud: 'unidad', uds: 'unidad', und: 'unidad',
}

/**
 * Alias de producto → nombre final tal cual debe salir en Excel.
 * La clave va en minúsculas y SIN acentos ("pina", "canonigos", "platano").
 * El valor lleva acentos y mayúsculas correctas.
 *
 * Sólo hace falta una entrada cuando el nombre final NO es el texto pegado con
 * la primera letra en mayúscula. "aguacate" o "naranja" no necesitan alias.
 */
export const PRODUCT_ALIASES: Record<string, string> = {
  // Pimientos
  'pim rojo': 'Pimiento rojo',
  'pim. rojo': 'Pimiento rojo',
  'pimiento rojo': 'Pimiento rojo',
  'pim amarillo': 'Pimiento amarillo',
  'pim. amarillo': 'Pimiento amarillo',
  'pimiento amarillo': 'Pimiento amarillo',
  'pim verde': 'Pimiento verde',
  'pimiento verde': 'Pimiento verde',
  'pim italiano': 'Pimiento italiano',
  'pimiento italiano': 'Pimiento italiano',
  'pim padron': 'Pimiento padrón',
  'pimiento padron': 'Pimiento padrón',

  // Tomates
  daniela: 'Tomate Daniela',
  'tomate daniela': 'Tomate Daniela',
  'tom pera': 'Tomate pera',
  'tomate pera': 'Tomate pera',
  cherry: 'Tomate cherry',
  'tomate cherry': 'Tomate cherry',
  'huevo toro': 'Tomate huevo de toro',
  'huevo de toro': 'Tomate huevo de toro',

  // Hoja
  iceberg: 'Iceberg',
  'lechuga iceberg': 'Iceberg',
  romana: 'Lechuga romana',
  'lechuga romana': 'Lechuga romana',
  rucula: 'Rúcula',
  canonigos: 'Canónigos',
  mezclun: 'Mezclum',
  micromezclum: 'Micromezclum',
  'micro mezclum': 'Micromezclum',
  cogollo: 'Cogollos',
  cogollos: 'Cogollos',
  'brote soja': 'Brote de soja',
  'brotes soja': 'Brote de soja',
  'brote de soja': 'Brote de soja',

  // Patatas
  torcal: 'Patata Torcal',
  'patata torcal': 'Patata Torcal',
  nueva: 'Patata nueva',
  monalisa: 'Patata Monalisa',
  agria: 'Patata agria',
  'agria negra': 'Patata agria negra',

  // Fruta
  arandanos: 'Arándanos',
  limon: 'Limón',
  melon: 'Melón',
  sandia: 'Sandía',
  pina: 'Piña',
  platano: 'Plátano canario',
  'platano canario': 'Plátano canario',
  melendez: 'Meléndez',
  'manzana pink lady': 'Manzana Pink Lady',
  'pink lady': 'Manzana Pink Lady',
  conferencia: 'Pera conferencia',
  'pera conferencia': 'Pera conferencia',

  // Varios
  champi: 'Champiñón',
  champis: 'Champiñón',
  'champi laminado': 'Champiñón laminado',
  'pepino holandes': 'Pepino holandés',
  'judia bobby': 'Judía bobby',
  judia: 'Judía',
}

/**
 * Formato habitual cuando el pedido NO escribe unidad. La clave es el nombre
 * FINAL del producto (el valor de PRODUCT_ALIASES o el texto capitalizado),
 * comparado en minúsculas y sin acentos.
 *
 * Si el pedido escribe la unidad, esta tabla no se consulta jamás:
 * "2 c melon" son 2 cajas aunque Melón esté aquí como unidad.
 * Lo que no aparece aquí cae en 'unidad'.
 */
export const DEFAULT_UNITS: Record<string, UnidadLimpia> = {
  // Manojo
  perejil: 'manojo',
  hierbabuena: 'manojo',
  albahaca: 'manojo',
  cebollino: 'manojo',
  cilantro: 'manojo',
  menta: 'manojo',
  eneldo: 'manojo',

  // Bolsa
  mezclum: 'bolsa',
  micromezclum: 'bolsa',
  rucula: 'bolsa',
  canonigos: 'bolsa',
  berros: 'bolsa',
  'baby leaf': 'bolsa',
  espinaca: 'bolsa',
  escarola: 'bolsa',

  // Bandeja / paquete
  arandanos: 'bandeja',
  frambuesa: 'bandeja',
  mora: 'bandeja',
  'brote de soja': 'paquete',

  // Unidad explícita (documenta la intención aunque coincida con el fallback)
  'ajo pelado': 'unidad',
  'lechuga romana': 'unidad',
  'pepino holandes': 'unidad',
  apio: 'unidad',
  melon: 'unidad',
  sandia: 'unidad',
  iceberg: 'unidad',
}

/**
 * Frases que NO son producto. Se comparan sin acentos y sin distinguir
 * mayúsculas. Si tras quitarlas queda UNA sola línea de producto, el producto
 * se conserva; si queda un revoltijo, la línea entera se aparta como nota.
 */
export const NOTAS_OPERATIVAS: RegExp[] = [
  /\bmaster\b/i,
  /\bvito\b/i,
  /\bcobrar\b[^\n]*/i,
  /\bllevar\s+factura\b[^\n]*/i,
  /\bfactura\s+(?:de\s+)?\w+/i,
  /\bdatafono\b/i,
  /\bcargar\s+cartones\b/i,
  /\bregalo\b/i,
  /\bhablar\s+con\b[^\n]*/i,
  /\bpendiente\s+de\s+pago\b/i,
]
