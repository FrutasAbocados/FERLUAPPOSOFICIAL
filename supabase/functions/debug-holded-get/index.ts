// Contención permanente de la antigua función de diagnóstico.
// No importa secretos ni realiza llamadas a Holded.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  return new Response(JSON.stringify({ error: 'function disabled' }), {
    status: 410,
    headers: { ...cors, 'content-type': 'application/json' },
  })
})
