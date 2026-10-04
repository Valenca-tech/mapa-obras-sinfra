import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inteiroPorExtenso, reaisPorExtenso, percentualPorExtenso, dataPorExtenso, numeroOficial } from './extenso.js';

test('inteiros por extenso', () => {
  const casos = {
    1: 'um', 10: 'dez', 15: 'quinze', 21: 'vinte e um', 100: 'cem', 101: 'cento e um', 110: 'cento e dez',
    999: 'novecentos e noventa e nove', 1000: 'mil', 1001: 'mil e um', 1200: 'mil e duzentos',
    1250: 'mil duzentos e cinquenta', 2021: 'dois mil e vinte e um', 100000: 'cem mil',
    1000000: 'um milhão', 1200000: 'um milhão e duzentos mil', 3800000: 'três milhões e oitocentos mil',
    2100000: 'dois milhões e cem mil', 1001000: 'um milhão e mil',
    1234567: 'um milhão duzentos e trinta e quatro mil quinhentos e sessenta e sete',
  };
  for (const [n, t] of Object.entries(casos)) assert.equal(inteiroPorExtenso(Number(n)), t, n);
});

test('reais por extenso', () => {
  assert.equal(reaisPorExtenso(3800000), 'três milhões e oitocentos mil reais');
  assert.equal(reaisPorExtenso(1000000), 'um milhão de reais');
  assert.equal(reaisPorExtenso(1), 'um real');
  assert.equal(reaisPorExtenso(0.01), 'um centavo');
  assert.equal(reaisPorExtenso(1250.5), 'mil duzentos e cinquenta reais e cinquenta centavos');
  assert.equal(reaisPorExtenso('2100000.00'), 'dois milhões e cem mil reais');
  assert.equal(reaisPorExtenso(0), 'zero real');
});

test('percentual por extenso', () => {
  assert.equal(percentualPorExtenso(45), '45% (quarenta e cinco por cento)');
  assert.equal(percentualPorExtenso(45.5), '45,5% (quarenta e cinco vírgula cinco por cento)');
  assert.equal(percentualPorExtenso(12.05), '12,05% (doze vírgula zero cinco por cento)');
  assert.equal(percentualPorExtenso(100), '100% (cem por cento)');
});

test('data por extenso e número oficial', () => {
  assert.equal(dataPorExtenso('2026-10-04'), '4 de outubro de 2026');
  assert.equal(dataPorExtenso('2026-03-01'), '1 de março de 2026');
  assert.equal(numeroOficial(7, 2026), '007/2026-SINFRA');
  assert.equal(numeroOficial(1234, 2027, 'SINFRA'), '1234/2027-SINFRA');
});
