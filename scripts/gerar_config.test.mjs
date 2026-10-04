// Publicação: o config.js só sai com chave pública e nunca vira demonstração por engano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarConfig, problemaNaChave } from './gerar_config.mjs';

const jwt = (carga) => ['e30', Buffer.from(JSON.stringify(carga)).toString('base64url'), 'assinatura'].join('.');

test('chave anon e publishable passam; service_role e sb_secret_ são recusadas', () => {
  assert.equal(problemaNaChave(jwt({ role: 'anon' })), '');
  assert.equal(problemaNaChave('sb_publishable_abc'), '');
  assert.match(problemaNaChave(jwt({ role: 'service_role' })), /service_role/);
  assert.match(problemaNaChave('sb_secret_abc'), /secreta/);
  assert.match(problemaNaChave('qualquer-coisa'), /formato/);
});

test('sem variáveis a publicação falha; demonstração só com MODO=demo', () => {
  assert.throws(() => montarConfig({}), /MODO=demo/);
  assert.match(montarConfig({ MODO: 'demo' }).texto, /modo: 'demo'/);
  assert.throws(
    () => montarConfig({ SUPABASE_URL: 'http://x.supabase.co', SUPABASE_ANON_KEY: jwt({ role: 'anon' }) }),
    /https/,
  );
  const { texto } = montarConfig({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: jwt({ role: 'anon' }) });
  assert.match(texto, /supabaseUrl":"https:\/\/x\.supabase\.co"/);
  assert.throws(
    () => montarConfig({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: jwt({ role: 'service_role' }) }),
    /recusada/,
  );
});
