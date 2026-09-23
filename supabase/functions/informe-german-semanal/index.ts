// Service-role only. Preview by default; sending is restricted to Sunday 20h Madrid.
// One atomic claim per week. Ambiguous provider responses are never auto-retried.
import { type Informe, dia } from './formato.ts';
// El WhatsApp es solo título, semana y enlace: las cifras viven en el PDF privado.
export function mensaje(link?: string, inf?: Pick<Informe, 'inicio' | 'fecha'>): string {
  const rango = inf ? `Semana ${dia(inf.inicio)} - ${dia(inf.fecha)}` : undefined;
  return ['*Abocados · Tus clientes y tu comisión*', rango, link].filter(Boolean).join('\n');
}
export function horario(now: Date): { fecha: string; permitido: boolean } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, permitido: p.weekday === 'Sun' && p.hour === '20' };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
export function crearHandler(url: string, key: string, http: typeof fetch = fetch, clock = () => new Date(),
  pdfBuilder: (inf: Informe) => Promise<Uint8Array> = async inf => (await import('./pdf.ts')).buildPdf(inf)) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json({ error: 'solo POST' }, 405);
    const authorization = req.headers.get('authorization') ?? '';
    if (!key || !/^Bearer \S+$/i.test(authorization)) return json({ error: 'no autorizado' }, 401);
    // Forward the caller token: PostgREST verifies it and enforces service_role-only
    // EXECUTE grants. Never elevate an unverified caller using the runtime key.
    // Vault and the Edge runtime can hold different valid service JWTs.
    const headers = { apikey: key, authorization, 'content-type': 'application/json' };
    async function rpc<T>(name: string, args: object): Promise<T> {
      const r = await http(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });
      if (r.status === 401 || r.status === 403) throw new Error('unauthorized');
      if (!r.ok) throw new Error('db');
      return await r.json() as T;
    }
    let body: { send?: boolean; fecha?: string; publish?: boolean };
    try { body = await req.json() as typeof body; if (!body || typeof body !== 'object') throw new Error(); }
    catch { return json({ error: 'JSON inválido' }, 400); }
    const now = clock();
    const hoy = horario(now);
    const send = body.send === true;
    if (send && (!hoy.permitido || (body.fecha !== undefined && body.fecha !== hoy.fecha))) {
      return json({ error: 'solo domingo a las 20h Madrid, semana actual' }, 409);
    }
    const fecha = body.fecha ?? hoy.fecha;
    const date = new Date(`${fecha}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== fecha || fecha > hoy.fecha) {
      return json({ error: 'fecha inválida o futura' }, 400);
    }
    let claimed = false;
    try {
      const inf = await rpc<Informe>('informe_german_semanal', { p_fecha: fecha });
      if (inf.clientes.length !== 5) return json({ error: 'clientes incompletos' }, 409);
      if (!send && body.publish !== true) return json({ enviado: false, fecha, mensaje: mensaje(undefined, inf), informe: inf });
      if (send && (!inf.ultima_sync || !Number.isFinite(Date.parse(inf.ultima_sync)) || now.getTime() - Date.parse(inf.ultima_sync) > 2 * 3600_000)) {
        return json({ error: 'sin sincronización reciente; no enviado' }, 409);
      }
      let cfg: { phone: string; apikey: string | null } | undefined;
      if (send) {
        cfg = await rpc<typeof cfg>('informe_german_callmebot_config', {});
        if (!cfg?.apikey?.trim() || cfg.phone !== '+34690712449') return json({ error: 'pendiente activación de Germán' }, 409);
        const claim = await http(`${url}/rest/v1/informe_german_envios`, { method: 'POST', headers,
          body: JSON.stringify({ fecha, estado: 'enviando' }) });
        if (claim.status === 409) return json({ skipped: 'semana ya registrada; revisar estado antes de cualquier reintento' });
        if (!claim.ok) throw new Error('claim');
        claimed = true;
      }
      const bytes = await pdfBuilder(inf);
      const token = crypto.randomUUID().replaceAll('-', '');
      const path = `german/${fecha}/${token}.pdf`;
      const upload = await http(`${url}/storage/v1/object/informes-margen/${path}`, {
        method: 'POST', headers: { ...headers, 'content-type': 'application/pdf' },
        body: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
      });
      if (!upload.ok) throw new Error('upload');
      const linkRes = await http(`${url}/rest/v1/informe_margen_links`, { method: 'POST', headers,
        body: JSON.stringify({ token, storage_path: path, expira_at: new Date(now.getTime()+7*24*3600_000).toISOString() }) });
      if (!linkRes.ok) throw new Error('link');
      const link = `${url}/functions/v1/informe-german-pdf?t=${token}`;
      const text = mensaje(link, inf);
      if (!send) return json({ enviado: false, fecha, mensaje: text, link, storage_path: path });
      const params = new URLSearchParams({ phone: cfg!.phone, apikey: cfg!.apikey!, text });
      const r = await http(`https://api.callmebot.com/whatsapp.php?${params}`, { signal: AbortSignal.timeout(20_000) });
      const reply = (await r.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
      const rejected = /not sent|not delivered|invalid|error|denied|exceeded|quota/i.test(reply);
      const accepted = r.ok && !rejected && /message.*(?:sent|queued)|success/i.test(reply);
      const estado = accepted ? 'aceptado' : rejected ? 'rechazado' : 'incierto';
      const saved = await http(`${url}/rest/v1/informe_german_envios?fecha=eq.${fecha}`, { method: 'PATCH', headers,
        body: JSON.stringify({ estado, storage_path: path, updated_at: now.toISOString() }) });
      if (!saved.ok) return json({ error: 'resultado no registrado; revisar sin reenviar' }, 500);
      return json({ fecha, estado, aceptado_por_proveedor: accepted }, accepted ? 200 : 502);
    } catch (error) {
      if (!claimed && error instanceof Error && error.message === 'unauthorized') return json({ error: 'no autorizado' }, 401);
      if (claimed) {
        await http(`${url}/rest/v1/informe_german_envios?fecha=eq.${fecha}`, { method: 'PATCH', headers,
          body: JSON.stringify({ estado: 'incierto', updated_at: now.toISOString() }) }).catch(() => undefined);
      }
      // Never expose URLs, secrets or provider response bodies in logs/errors.
      return json({ error: claimed ? 'resultado incierto; no reintentar automáticamente' : 'no se pudo preparar el informe' }, 500);
    }
  };
}
// Deno is supplied by the Edge runtime, not by the Node test runner.
const deno = (globalThis as { Deno?: { serve(h: (req: Request) => Promise<Response>): unknown; env: { get(k: string): string | undefined } } }).Deno;
if (deno) {
  deno.serve(crearHandler(deno.env.get('SUPABASE_URL') ?? '', deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''));
}
