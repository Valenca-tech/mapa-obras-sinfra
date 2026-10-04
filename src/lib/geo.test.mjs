import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distanciaMetros, segmentosDoTrecho, trechoDeSegmentos, comprimentoTrecho, pontoCentral,
  distanciaAteObra, formatarExtensao,
} from './geo.js';

test('distância entre dois pontos conhecidos (1 minuto de latitude ~ 1.853 m)', () => {
  const d = distanciaMetros([-5.5, -47.48], [-5.5 + 1 / 60, -47.48]);
  assert.ok(Math.abs(d - 1853) < 3, `obtido ${d}`);
});

test('GeoJSON <-> segmentos do Leaflet (inverte lat/lng e arredonda)', () => {
  const geo = { type: 'LineString', coordinates: [[-47.48, -5.53], [-47.47, -5.52]] };
  assert.deepEqual(segmentosDoTrecho(geo), [[[-5.53, -47.48], [-5.52, -47.47]]]);
  assert.deepEqual(trechoDeSegmentos(segmentosDoTrecho(geo)), geo);
  const multi = trechoDeSegmentos([[[-5.53, -47.48], [-5.52, -47.47]], [[-5.51, -47.46], [-5.5, -47.45]]]);
  assert.equal(multi.type, 'MultiLineString');
  assert.equal(multi.coordinates.length, 2);
});

test('segmentos com menos de 2 pontos são descartados; nada válido vira null', () => {
  assert.equal(trechoDeSegmentos([[[-5.5, -47.4]]]), null);
  assert.equal(trechoDeSegmentos([]), null);
  assert.equal(trechoDeSegmentos([[[-5.5, -47.4], [-5.51, -47.4]], [[-5.6, -47.4]]]).type, 'LineString');
  assert.deepEqual(segmentosDoTrecho(null), []);
  assert.deepEqual(segmentosDoTrecho({ type: 'Polygon', coordinates: [] }), []);
});

test('extensão do trecho soma os segmentos', () => {
  const geo = trechoDeSegmentos([
    [[-5.5, -47.48], [-5.5 + 1 / 60, -47.48]],
    [[-5.6, -47.48], [-5.6 + 1 / 60, -47.48]],
  ]);
  assert.ok(Math.abs(comprimentoTrecho(geo) - 2 * 1853) < 6);
});

test('ponto central fica no meio do segmento mais longo', () => {
  const curto = [[-5.0, -47.0], [-5.001, -47.0]];
  const longo = [[-5.5, -47.48], [-5.52, -47.48]];
  const [lat, lng] = pontoCentral([curto, longo]);
  assert.ok(Math.abs(lat - -5.51) < 1e-4);
  assert.equal(lng, -47.48);
  assert.equal(pontoCentral([[[-5.5, -47.4]]]), null);
});

test('distância até a obra considera o trecho inteiro, não só o pino', () => {
  const obra = {
    latitude: -5.5, longitude: -47.48,
    trecho: trechoDeSegmentos([[[-5.5, -47.48], [-5.52, -47.48]]]),
  };
  assert.ok(distanciaAteObra([-5.52, -47.48], obra) < 1);
  assert.ok(distanciaAteObra([-5.52, -47.48], { latitude: -5.5, longitude: -47.48 }) > 2000);
});

test('extensão formatada em metros ou quilômetros', () => {
  assert.equal(formatarExtensao(350.4), '350 m');
  assert.equal(formatarExtensao(1207), '1,2 km');
  assert.equal(formatarExtensao(0), '');
  assert.equal(formatarExtensao(NaN), '');
});
