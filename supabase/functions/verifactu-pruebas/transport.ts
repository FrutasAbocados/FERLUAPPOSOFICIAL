// A9 only: never accept an endpoint, XML or certificate supplied by the browser.
export const endpoints = {
  representante: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
  sello: 'https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
} as const

export function gateReasons(dbEnabled: boolean, envEnabled: string | undefined, cert: string | undefined, key: string | undefined, runtime: boolean): string[] {
  return [
    !dbEnabled && 'Interruptor de pruebas desactivado en base de datos',
    envEnabled !== 'true' && 'Transporte de pruebas desactivado en backend',
    (!cert || !key) && 'Certificado PEM y clave privada pendientes',
    !runtime && 'El runtime no permite crear el cliente mTLS',
  ].filter((v): v is string => typeof v === 'string')
}

export function soapEnvelope(xml: string): string {
  if (xml.length > 262144 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML no permitido')
  const payload = xml.replace(/^\s*<\?xml[^?]*\?>\s*/, '')
  if (!/^<sum:RegFactuSistemaFacturacion[\s>]/.test(payload)) throw new Error('Se requiere un payload A8')
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Header/><soapenv:Body>' +
    payload + '</soapenv:Body></soapenv:Envelope>'
}

export async function sha256(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export async function boundedText(response: Response, max = 262144): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > max) { await reader.cancel(); throw new Error('Respuesta demasiado grande') }
      parts.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.length }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export async function sendSoap(endpoint: string, body: string, fetcher: typeof fetch): Promise<{ status: number; body: string }> {
  if (!(Object.values(endpoints) as string[]).includes(endpoint)) throw new Error('Solo endpoints AEAT de pruebas')
  const response = await fetcher(endpoint, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' }, body,
  })
  // Redirects must never forward credentials to another host.
  if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new Error('Redireccion bloqueada') }
  return { status: response.status, body: await boundedText(response) }
}

export async function selfTest(): Promise<{ ok: boolean; network_requests: number }> {
  let requests = 0
  const payload = '<sum:RegFactuSistemaFacturacion xmlns:sum="urn:fixture"/>'
  const body = soapEnvelope(payload)
  await sendSoap(endpoints.representante, body, async (_url, options) => {
    requests++
    if (options?.redirect !== 'manual' || new Headers(options?.headers).get('SOAPAction') !== '""') throw new Error('SOAP headers')
    return new Response('<fixture/>', { status: 200 })
  })
  if (requests !== 1 || gateReasons(false, undefined, undefined, undefined, true).length !== 3) throw new Error('Gates')
  return { ok: true, network_requests: 0 }
}
