import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codigoMedicaoPro, urlMedicoes } from './medicaoPro.js';

test('código do Medição Pro a partir do código ou do endereço colado', () => {
  assert.equal(codigoMedicaoPro('abc123XYZ'), 'abc123XYZ');
  assert.equal(codigoMedicaoPro('https://medicaopro.concretta.org/#/obras/Kq9-x_2/medicoes'), 'Kq9-x_2');
  assert.equal(codigoMedicaoPro('  '), '');
  assert.equal(codigoMedicaoPro('texto com espaço'), '');
  assert.equal(urlMedicoes('Kq9'), 'https://medicaopro.concretta.org/#/obras/Kq9/medicoes');
});
