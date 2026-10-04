import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, dataHora, reais, pct, lerNumero, lerPercentual, erroDeData, haDias } from './formato.js';

test('datas no formato DD/MM/AAAA, sem deslocamento de fuso', () => {
  assert.equal(data('2026-10-02'), '02/10/2026');
  assert.equal(data(''), '');
  assert.equal(dataHora('2026-10-02T01:30:00Z'), '01/10/2026 22:30');
});

test('valores em R$ e percentuais com vírgula', () => {
  assert.equal(reais(1250000.5).replace(/\s/g, ' '), 'R$ 1.250.000,50');
  assert.equal(reais(null), '');
  assert.equal(pct(27.5), '27,5%');
  assert.equal(pct('100.00'), '100%');
});

test('lerNumero aceita padrão brasileiro e internacional', () => {
  assert.equal(lerNumero('27,5'), 27.5);
  assert.equal(lerNumero('27.5'), 27.5);
  assert.equal(lerNumero('1.250.000,50'), 1250000.5);
  assert.equal(lerNumero('R$ 1.250.000,50'), 1250000.5);
  assert.equal(lerNumero('1.250'), 1250);
  assert.equal(lerNumero(' '), null);
  assert.ok(Number.isNaN(lerNumero('abc')));
});

test('haDias', () => {
  assert.equal(haDias(0), 'hoje');
  assert.equal(haDias(1), 'ontem');
  assert.equal(haDias(12), 'há 12 dias');
});

test('percentual abaixo de 100 nunca aparece como 100%', () => {
  assert.equal(pct(99.95), '99,9%');
  assert.equal(pct(99.99), '99,9%');
  assert.equal(pct(100), '100%');
});

test('lerNumero: separador decimal é o último; % e vírgula sozinha aceitos', () => {
  assert.equal(lerNumero('1,250.50'), 1250.5);
  assert.equal(lerNumero('12,5%'), 12.5);
  assert.equal(lerNumero(',5'), 0.5);
  assert.equal(lerNumero('50,'), 50);
  assert.equal(lerNumero('0.050'), 0.05);
});

test('lerPercentual separa número inválido, fora da faixa e casas demais', () => {
  assert.deepEqual(lerPercentual('27,5'), { valor: 27.5 });
  assert.deepEqual(lerPercentual(''), { valor: null });
  assert.match(lerPercentual('abc').erro, /inválido/);
  assert.match(lerPercentual('101').erro, /entre 0 e 100/);
  assert.match(lerPercentual('99,995').erro, /2 casas/);
  assert.deepEqual(lerPercentual('27,500'), { valor: 27.5 });
});

test('erroDeData barra ano com 2 ou 5 algarismos', () => {
  assert.equal(erroDeData('2026-10-03'), '');
  assert.match(erroDeData('0026-10-03'), /intervalo/);
  assert.match(erroDeData('20266-10-03'), /4 algarismos/);
});
