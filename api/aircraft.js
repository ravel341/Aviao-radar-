const OPEN_SKY_URL = 'https://opensky-network.org/api/states/all';
const ADSBFI_URL = 'https://opendata.adsb.fi/api/v3/lat';
const ADSBLOL_URL = 'https://api.adsb.lol/v2/point';
function stateFromAdsb(a, now) {
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  return [a.hex || '', a.flight || a.r || '', a.ownOp || '—', now, now, number(a.lon), number(a.lat), number(a.alt_baro) === null ? null : number(a.alt_baro) * 0.3048, a.alt_baro === 'ground', number(a.gs) === null ? null : number(a.gs) * 0.514444, number(a.track), number(a.baro_rate) === null ? null : number(a.baro_rate) * 0.00508, null, number(a.alt_geom) === null ? null : number(a.alt_geom) * 0.3048, a.squawk || null, false, 0];
}
function area(req) {
  const keys = ['lamin', 'lomin', 'lamax', 'lomax'];
  const v = Object.fromEntries(keys.map((key) => [key, Number(req.query[key])]));
  const valid = keys.every((key) => Number.isFinite(v[key])) && v.lamin >= -90 && v.lamax <= 90 && v.lomin >= -180 && v.lomax <= 180 && v.lamin < v.lamax && v.lomin < v.lomax && v.lamax - v.lamin <= 2 && v.lomax - v.lomin <= 2;
  return valid ? v : null;
}
function point(v) {
  const lat = (v.lamin + v.lamax) / 2, lon = (v.lomin + v.lomax) / 2;
  const h = (v.lamax - v.lamin) * 111, w = (v.lomax - v.lomin) * 111 * Math.cos(lat * Math.PI / 180);
  return { lat, lon, radius: Math.min(250, Math.max(1, Math.ceil(Math.hypot(h, w) / 2 / 1.852))) };
}
async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'RadarAproximacao/2.3' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
function normalize(data, v) {
  const now = Math.floor(Date.now() / 1000);
  return { time: now, states: (data.ac || []).filter((a) => Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lon)) && a.lat >= v.lamin && a.lat <= v.lamax && a.lon >= v.lomin && a.lon <= v.lomax).map((a) => stateFromAdsb(a, now)) };
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=8, stale-while-revalidate=20');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  const v = area(req);
  if (!v) return res.status(400).json({ error: 'Coordenadas ou área de consulta inválidas.' });
  const params = new URLSearchParams(Object.entries(v));
  try { return res.status(200).json(await getJson(`${OPEN_SKY_URL}?${params}`)); } catch (_) {}
  const p = point(v);
  try { return res.status(200).json(normalize(await getJson(`${ADSBFI_URL}/${p.lat}/lon/${p.lon}/dist/${p.radius}`), v)); } catch (_) {}
  try { return res.status(200).json(normalize(await getJson(`${ADSBLOL_URL}/${p.lat}/${p.lon}/${p.radius}`), v)); }
  catch (error) { return res.status(502).json({ error: `As fontes de dados estão temporariamente indisponíveis: ${error.message}` }); }
}