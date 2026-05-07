// Edge Function: parsear-factura-proveedor
// ----------------------------------------------------------------------------
// Recibe un PDF en base64 (factura de proveedor: Alcalde, Abasthosur, ...) y
// devuelve cabecera + líneas estructuradas listas para crear un documento
// "purchase" en Holded. Auto-detecta el proveedor por logo/CIF.
//
// Body: { pdf_base64: string, filename?: string }
// Returns:
//   {
//     proveedor_detectado: 'alcalde' | 'abasthosur' | 'otro',
//     proveedor_nombre: string,
//     num_factura: string,
//     fecha: string,                // YYYY-MM-DD
//     total_bruto: number,
//     total_iva: number,
//     total: number,
//     iva_desglose: { base: number, tipo: number, importe: number }[],
//     lineas: {
//       orden: number,
//       codigo_proveedor: string | null,
//       descripcion: string,
//       cantidad: number,
//       unidad: string,            // 'caja' | 'kg' | 'bolsa' | 'unidad' | ...
//       precio_unitario: number,
//       iva_pct: number,
//       importe: number,
//       notas: string | null,
//     }[],
//   }
// ----------------------------------------------------------------------------

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
// Sonnet 4.6 para precisión en transcripción de tablas con muchas columnas.
// El coste por factura sale a ~2 céntimos, irrelevante.
const MODEL         = Deno.env.get('PARSER_MODEL') || 'claude-sonnet-4-6'

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
}

const SYSTEM = `Eres un parser de facturas de proveedores de fruta y verdura para Frutas Abocados (Ferlu Project S.L.). Recibes un PDF y devuelves JSON estructurado.

REGLAS ABSOLUTAS:
1. Devuelve SOLO JSON válido. Sin markdown, sin texto adicional, sin \`\`\`.
2. Detecta el proveedor:
   - Si pone "ABASTHOSUR" o NIF "A-29076759" → "abasthosur".
   - Si pone "FRUTAS PEREZ ALCALDE" o NIF "B-92.906.189" → "alcalde".
   - En cualquier otro caso → "otro".
3. Fecha en formato ISO YYYY-MM-DD. Si la factura dice "06-05-2026" o "06/05/2026" devuelve "2026-05-06".
4. Números: punto decimal, sin separadores de miles. "1.234,56" → 1234.56.
5. cantidad × precio_unitario debe ≈ importe (tolerancia 0,02 €). Si no cuadra, ajusta cantidad/precio según los totales.

REGLAS POR PROVEEDOR:

ABASTHOSUR (columnas: CODIGO | DESCRIPCION ARTICULO | CAJAS | UNID/CAJA | CANTIDAD UNID VTA | CANTIDAD UNID FACT | PRECIO UNIDAD | DTO | PRECIO NETO | %IVA | IMPORTE LINEA):

Hay DOS columnas de cantidad y tienes que escoger correctamente:
- "CANTIDAD UNID VTA" trae número + unidad ("5 Caja", "75 Kilo", "20 Bolsa").
- "CANTIDAD UNID FACT" trae peso real cuando se factura por kg (ej. "31,400Kg") o está VACÍO si se factura por unidad de venta.

REGLA DE FACTURACIÓN — DEBES ESCOGER CORRECTAMENTE:
- Si CANTIDAD UNID FACT TIENE VALOR (texto "Kg" presente, ej. "31,400Kg") → la factura es por peso:
    cantidad = el número (31.4),  unidad = "kg".
- Si CANTIDAD UNID FACT está vacía → la factura es por la unidad de venta:
    cantidad = número de "CANTIDAD UNID VTA",  unidad = unidad normalizada ("Caja"→"caja", "Kilo"→"kg", "Bolsa"→"bolsa", "Saco"→"saco", "Bandeja"→"bandeja", "Manojo"→"manojo", "Unidad"→"unidad").

VALIDACIÓN OBLIGATORIA: cantidad × PRECIO NETO debe ser ≈ IMPORTE LINEA (tolerancia 0.05€). Si no cuadra, has elegido mal la columna o el número — corrígelo.

EJEMPLOS REALES (memorízalos):
- "5 Caja" en VTA, FACT vacío, PRECIO NETO 7,00, IMPORTE 35,00 → cantidad=5, unidad="caja". (5×7=35 ✓)
- "2 Caja" en VTA, "31,400Kg" en FACT, PRECIO NETO 2,30, IMPORTE 72,22 → cantidad=31.4, unidad="kg". (31.4×2.3=72.22 ✓)
- "75 Kilo" en VTA, FACT vacío, PRECIO NETO 0,65, IMPORTE 48,75 → cantidad=75, unidad="kg". (75×0.65=48.75 ✓)
- "10 Caja" en VTA, "106,000Kg" en FACT, PRECIO NETO 1,55, IMPORTE 164,30 → cantidad=106, unidad="kg". (106×1.55=164.30 ✓)
- "20 Bolsa" en VTA, FACT vacío, PRECIO NETO 2,25, IMPORTE 45,00 → cantidad=20, unidad="bolsa". (20×2.25=45 ✓)

OTROS CAMPOS:
- codigo_proveedor = CODIGO (5 dígitos, ej. "03004", "13405", "16928"). COPIA EXACTAMENTE — no inventes ni corrijas.
- descripcion = DESCRIPCION ARTICULO copiada literal, símbolos incluidos. Si dudas de un carácter, mantén el texto original.
- precio_unitario = PRECIO NETO (la columna a la derecha de DTO, NO PRECIO UNIDAD).
- iva_pct = %IVA (4 → 4, 10 → 10, 21 → 21).
- importe = IMPORTE LINEA.
- IGNORA secciones de cabecera tipo "3. FRUTA Y VERDURA" / "4. ALIMENTACION REFRIGERADA": no son líneas.
- Saltar filas vacías o de envases (BATEA, PETIT, CUNER) que aparecen en cuadro inferior.

ALCALDE / FRUTAS PEREZ ALCALDE (columnas: Trazab/Lote | Articulo | ENV | Bultos | K.Brutos | Tara | K.Netos | Precio | IVA | Importe):
- codigo_proveedor = Trazab/Lote (ej. "122.53.4187").
- descripcion = Articulo (puede ocupar 2 líneas en el PDF, únelas).
- cantidad = K.Netos (SIEMPRE — nunca Bultos ni K.Brutos).
- unidad = según ENV:
    - "*B*" o "*B" → si Bultos == K.Netos exacto → "bulto"; si Bultos != K.Netos → "kg" (es por peso).
    - "*U*" o "*U"  → "unidad".
    - "*K*" o "*K"  → "kg".
    - "*M*" o "*M"  → "manojo".
- precio_unitario = Precio (siempre referido a K.Netos).
- iva_pct = IVA (4 o 10).
- importe = Importe.
- notas: incluye "ENV=<env>, Bultos=<n>, Tara=<n>" si Tara > 0 o si Bultos != K.Netos.
- IGNORA filas de "Totales" / "Importe Bruto" / "Base Imponible" del pie.

CABECERA (ambos proveedores):
- num_factura: ABASTHOSUR usa "FACTURA: 50011191"; Alcalde usa "N.Fra. 1873/X6".
- total_bruto = importe bruto antes de IVA.
- total_iva = suma del IVA.
- total = total final con IVA.
- iva_desglose: una entrada por cada tipo de IVA distinto presente en líneas. base = suma de importes a ese tipo, tipo = el porcentaje, importe = la cuota IVA.

FORMATO DE RESPUESTA (exacto):
{
  "proveedor_detectado": "alcalde",
  "proveedor_nombre": "FRUTAS PEREZ ALCALDE S.L.",
  "num_factura": "1873/X6",
  "fecha": "2026-05-06",
  "total_bruto": 170.12,
  "total_iva": 7.02,
  "total": 177.14,
  "iva_desglose": [
    { "base": 166.52, "tipo": 4, "importe": 6.66 },
    { "base": 3.60,   "tipo": 10, "importe": 0.36 }
  ],
  "lineas": [
    {
      "orden": 1,
      "codigo_proveedor": "122.53.4187",
      "descripcion": "RUCULA",
      "cantidad": 6,
      "unidad": "bulto",
      "precio_unitario": 1.35,
      "iva_pct": 4,
      "importe": 8.10,
      "notas": null
    }
  ]
}`

type Body = { pdf_base64: string; filename?: string }

async function parsearConClaude(pdfB64: string): Promise<unknown> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfB64 },
            },
            {
              type: 'text',
              text: 'Extrae la factura siguiendo las reglas. Devuelve SOLO el JSON.',
            },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const data = await res.json() as { content: Array<{ type: string; text?: string }> }
  const text = data.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('').trim()
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    throw new Error(`Claude devolvió JSON inválido: ${cleaned.slice(0, 300)}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!ANTHROPIC_KEY)            return json({ error: 'ANTHROPIC_API_KEY no configurada' }, 500)
  if (req.method !== 'POST')     return json({ error: 'Solo POST' }, 405)

  let body: Body
  try {
    body = await req.json() as Body
  } catch {
    return json({ error: 'Body JSON inválido' }, 400)
  }
  if (typeof body.pdf_base64 !== 'string' || body.pdf_base64.length < 100) {
    return json({ error: 'pdf_base64 requerido (base64 válido)' }, 400)
  }

  try {
    const parsed = await parsearConClaude(body.pdf_base64)
    return json(parsed)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, 500)
  }
})

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}
