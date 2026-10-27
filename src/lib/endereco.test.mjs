import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extrairEndereco } from './endereco.js';

test('endereço do Nominatim: rua, número e bairro', () => {
  assert.deepEqual(
    extrairEndereco({ address: { road: 'Rua Ceará', house_number: '1234', suburb: 'Nova Imperatriz', city: 'Imperatriz' } }),
    { logradouro: 'Rua Ceará', numero: '1234', bairro: 'Nova Imperatriz' },
  );
});

test('sem número e com bairro em outro campo', () => {
  assert.deepEqual(extrairEndereco({ address: { road: 'Avenida Bernardo Sayão', neighbourhood: 'Bacuri' } }), {
    logradouro: 'Avenida Bernardo Sayão',
    numero: '',
    bairro: 'Bacuri',
  });
  assert.deepEqual(extrairEndereco({}), { logradouro: '', numero: '', bairro: '' });
});
