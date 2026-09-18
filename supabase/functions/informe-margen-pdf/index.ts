// Edge Function: informe-margen-pdf
// ----------------------------------------------------------------------------
// Enlace corto del informe diario de margen para WhatsApp.
// GET ?t=<token> -> busca el token en `informe_margen_links`, comprueba que no
// ha caducado, firma el PDF del bucket privado 5 minutos y redirige (302).
// Pública (verify_jwt=false): el token aleatorio es la única credencial.
// ----------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BUCKET = 'informes-margen'

const dbHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  'content-type': 'application/json',
}

function texto(msg: string, status: number): Response {
  return new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return texto('Método no permitido', 405)
  const token = new URL(req.url).searchParams.get('t') ?? ''
  if (!/^[A-Za-z0-9]{12,32}$/.test(token)) return texto('Enlace no válido', 404)

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/informe_margen_links?token=eq.${token}&select=storage_path,expira_at&limit=1`,
    { headers: dbHeaders },
  )
  if (!res.ok) return texto('Error interno', 500)
  const [link] = await res.json() as Array<{ storage_path: string; expira_at: string }>
  if (!link) return texto('Enlace no válido', 404)
  if (new Date(link.expira_at).getTime() < Date.now()) return texto('Enlace caducado', 410)

  const sign = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${link.storage_path}`, {
    method: 'POST', headers: dbHeaders, body: JSON.stringify({ expiresIn: 300 }),
  })
  if (!sign.ok) return texto('PDF no disponible', 404)
  const { signedURL } = await sign.json() as { signedURL: string }
  return new Response(null, {
    status: 302,
    headers: { location: `${SUPABASE_URL}/storage/v1${signedURL}`, 'cache-control': 'no-store' },
  })
})
