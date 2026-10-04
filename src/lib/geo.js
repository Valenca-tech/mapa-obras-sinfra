// Geometria simples para o mapa: trechos de obra (GeoJSON, coordenadas
// [longitude, latitude]) e distâncias. O Leaflet trabalha com [latitude, longitude];
// a conversão acontece só aqui.

const RAIO_TERRA_M = 6371008.8;

/** Obras a esta distância de uma instalação pública aparecem no balão dela (mapa e tela Instalações). */
export const RAIO_PROXIMIDADE_M = 500;
const rad = (graus) => (graus * Math.PI) / 180;
const arredondar = (v) => Math.round(v * 1e6) / 1e6; // ~0,1 m

/** Distância em metros entre dois pontos [lat, lng] (fórmula de haversine). */
export function distanciaMetros([lat1, lng1], [lat2, lng2]) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** GeoJSON LineString/MultiLineString -> segmentos [[lat, lng], ...] (formato do Leaflet). */
export function segmentosDoTrecho(trecho) {
  if (!trecho || typeof trecho !== 'object') return [];
  let linhas = [];
  if (trecho.type === 'LineString') linhas = [trecho.coordinates];
  else if (trecho.type === 'MultiLineString') linhas = trecho.coordinates;
  return (Array.isArray(linhas) ? linhas : [])
    .filter((l) => Array.isArray(l) && l.length >= 2)
    .map((l) => l.map(([lng, lat]) => [lat, lng]));
}

/** Segmentos [[lat, lng], ...] -> GeoJSON. Segmentos com menos de 2 pontos são descartados; nenhum = null. */
export function trechoDeSegmentos(segmentos) {
  const validos = (segmentos ?? [])
    .filter((s) => s.length >= 2)
    .map((s) => s.map(([lat, lng]) => [arredondar(lng), arredondar(lat)]));
  if (!validos.length) return null;
  return validos.length === 1
    ? { type: 'LineString', coordinates: validos[0] }
    : { type: 'MultiLineString', coordinates: validos };
}

export function comprimentoSegmento(segmento) {
  let total = 0;
  for (let i = 1; i < segmento.length; i++) total += distanciaMetros(segmento[i - 1], segmento[i]);
  return total;
}

/** Extensão total do trecho, em metros. */
export const comprimentoTrecho = (trecho) =>
  segmentosDoTrecho(trecho).reduce((soma, s) => soma + comprimentoSegmento(s), 0);

/** Ponto a uma distância d (metros) ao longo do segmento. */
function pontoAoLongo(segmento, d) {
  let acumulado = 0;
  for (let i = 1; i < segmento.length; i++) {
    const passo = distanciaMetros(segmento[i - 1], segmento[i]);
    if (passo > 0 && acumulado + passo >= d) {
      const f = (d - acumulado) / passo;
      const [a, b] = [segmento[i - 1], segmento[i]];
      return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
    }
    acumulado += passo;
  }
  return segmento[segmento.length - 1];
}

/** Onde fica o pino de uma obra com trecho: o meio do segmento mais longo. [lat, lng] ou null. */
export function pontoCentral(segmentos) {
  const validos = (segmentos ?? []).filter((s) => s.length >= 2);
  if (!validos.length) return null;
  const maior = validos.reduce((a, b) => (comprimentoSegmento(b) > comprimentoSegmento(a) ? b : a));
  const [lat, lng] = pontoAoLongo(maior, comprimentoSegmento(maior) / 2);
  return [arredondar(lat), arredondar(lng)];
}

/** Menor distância (metros) de um ponto [lat, lng] até a obra: pino ou qualquer vértice do trecho. */
export function distanciaAteObra(ponto, obra) {
  let menor = distanciaMetros(ponto, [obra.latitude, obra.longitude]);
  for (const s of segmentosDoTrecho(obra.trecho)) {
    for (const v of s) menor = Math.min(menor, distanciaMetros(ponto, v));
  }
  return menor;
}

const kmFormato = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** 350 -> '350 m'; 1207 -> '1,2 km' */
export function formatarExtensao(metros) {
  if (!Number.isFinite(metros) || metros <= 0) return '';
  return metros < 1000 ? `${Math.round(metros)} m` : `${kmFormato.format(metros / 1000)} km`;
}
