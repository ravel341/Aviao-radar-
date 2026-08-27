const OPEN_SKY_URL = 'https://opensky-network.org/api/states/all';
const ADSBFI_URL = 'https://opendata.adsb.fi/api/v3/lat';
function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders } });
}
function stateFromAdsb(aircraft, nowSeconds) {
  const onGround = aircraft.alt_baro === 'ground';
  const altitudeM = Number.isFinite(Number(aircraft.alt_baro)) ? Number(aircraft.alt_baro) * 0.3048 : null;
  const geomAltitudeM = Number.isFinite(Number(aircraft.alt_geom)) ? Number(aircraft.alt_geom) * 0.3048 : null;
  const speedMs = Number.isFinite(Number(aircraft.gs)) ? Number(aircraft.gs) * 0.514444 : null;
  return [aircraft.hex || '', aircraft.flight || aircraft.r || '', aircraft.ownOp || '—', nowSeconds, nowSeconds, Number(aircraft.lon), Number(aircraft.lat), altitudeM, onGround, speedMs, Number.isFinite(Number(aircraft.track)) ? Number(aircraft.track) : null, null, null, geomAltitudeM, aircraft.squawk || null, false, 0];
}
async function fetchAdsbFi(lamin, lomin, lamax, lomax) {
  const lat = (lamin + lamax) / 2;
  const lon = (lomin + lomax) / 2;
  const heightKm = (lamax - lamin) * 111;
  const widthKm = (lomax - lomin) * 111 * Math.cos(lat * Math.PI / 180);
  const radiusNm = Math.min(250, Math.max(1, Math.ceil(Math.hypot(heightKm, widthKm) / 2 / 1.852)));
  const url = `${ADSBFI_URL}/${lat}/lon/${lon}/dist/${radiusNm}`;
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'RadarAproximacao/2.1' }, cf: { cacheTtl: 8, cacheEverything: true } });
  if (!response.ok) throw new Error(`ADSB.fi HTTP ${response.status}`);
  const data = await response.json();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const states = (data.ac || []).filter((a) => Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lon)) && a.lat >= lamin && a.lat <= lamax && a.lon >= lomin && a.lon <= lomax).map((a) => stateFromAdsb(a, nowSeconds));
  return { time: nowSeconds, states };
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
    const upstream = await fetch(upstreamUrl, { headers: { Accept: 'application/json', 'User-Agent': 'RadarAproximacao/2.1' }, cf: { cacheTtl: 8, cacheEverything: true } });
    if (upstream.ok) return new Response(await upstream.arrayBuffer(), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=8', 'X-Data-Source': 'OpenSky' } });
  } catch (_) {}
  try {
    return json(await fetchAdsbFi(lamin, lomin, lamax, lomax), 200, { 'Cache-Control': 'public, max-age=8', 'X-Data-Source': 'ADSB.fi' });
  } catch (error) { return json({ error: `As fontes de dados estão temporariamente indisponíveis: ${error.message}` }, 502); }
}
export function onRequest() { return json({ error: 'Método não permitido.' }, 405, { Allow: 'GET' }); }