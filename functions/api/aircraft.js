const OPEN_SKY_URL = 'https://opensky-network.org/api/states/all';
function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders } });
}
export async function onRequestGet({ request }) {
  const input = new URL(request.url).searchParams;
  const keys = ['lamin', 'lomin', 'lamax', 'lomax'];
  const values = Object.fromEntries(keys.map((key) => [key, Number(input.get(key))]));
  if (keys.some((key) => !Number.isFinite(values[key]))) return json({ error: 'Coordenadas inválidas.' }, 400);
  const { lamin, lomin, lamax, lomax } = values;
  const valid = lamin >= -90 && lamax <= 90 && lomin >= -180 && lomax <= 180 && lamin < lamax && lomin < lomax && (lamax - lamin) <= 2 && (lomax - lomin) <= 2;
  if (!valid) return json({ error: 'Área de consulta inválida.' }, 400);
  const upstreamUrl = new URL(OPEN_SKY_URL);
  keys.forEach((key) => upstreamUrl.searchParams.set(key, String(values[key])));
  try {
    const upstream = await fetch(upstreamUrl, { headers: { Accept: 'application/json', 'User-Agent': 'RadarAproximacao/2.0' }, cf: { cacheTtl: 8, cacheEverything: true } });
    if (!upstream.ok) {
      const retry = upstream.headers.get('X-Rate-Limit-Retry-After-Seconds');
      return json({ error: `A fonte de dados respondeu HTTP ${upstream.status}.${retry ? ` Tente novamente em ${retry} segundos.` : ''}` }, upstream.status);
    }
    return new Response(await upstream.arrayBuffer(), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=8', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return json({ error: `Falha temporária ao consultar os aviões: ${error.message}` }, 502); }
}
export function onRequest() { return json({ error: 'Método não permitido.' }, 405, { Allow: 'GET' }); }