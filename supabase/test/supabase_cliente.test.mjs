// Camada de produção (src/api/supabase.js) com o servidor simulado: erros de
// rede, sessão encerrada e repetição de gravação depois de resposta perdida.
// Não precisa de projeto Supabase: o fetch global é trocado por respostas prontas.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window ??= {};
const api = await import('../../src/api/supabase.js');
const { MSG_REDE, MSG_SESSAO } = await import('../../src/api/erros.js');

let responder = () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (url, opcoes) => Promise.resolve().then(() => responder(String(url), opcoes));

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

before(async () => {
  await api.iniciar({ supabaseUrl: 'https://exemplo.supabase.co', supabaseAnonKey: 'sb_publishable_teste' });
});

// Gravações (POST): o postgrest-js não repete, a falha chega na hora. (Leituras
// ele repete sozinho por alguns segundos antes de desistir.)
test('falha de rede vira mensagem própria com código REDE', async () => {
  responder = () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(
    api.lancar([{ obra_id: 'x', percentual_executado: 1 }]),
    (e) => e.code === 'REDE' && e.message === MSG_REDE,
  );
  responder = () => {
    throw new TypeError('Load failed'); // Safari/iPhone
  };
  await assert.rejects(api.criarObra({ nome: 'X' }), (e) => e.code === 'REDE');
});

test('sem sessão, "sem permissão" vira "sua sessão terminou"', async () => {
  responder = () => json({ code: '42501', message: 'permission denied for table obras' }, 401);
  await assert.rejects(api.listarObras(), (e) => e.code === 'SESSAO' && e.message === MSG_SESSAO);
});

test('lançamento repetido (resposta da 1ª tentativa perdida) conta como gravado', async () => {
  responder = () =>
    json({ code: '23505', message: 'duplicate key value violates unique constraint "atualizacoes_pkey"' }, 409);
  await api.lancar([{ id: 'a0000000-0000-4000-8000-000000000001', obra_id: 'x', percentual_executado: 10 }]);

  responder = () =>
    json({ code: '23505', message: 'duplicate key value violates unique constraint "atualizacoes_obra_momento_unico"' }, 409);
  await assert.rejects(
    api.lancar([{ obra_id: 'x', percentual_executado: 10 }, { obra_id: 'x', percentual_executado: 11 }]),
    /mesma obra apareceu duas vezes/,
  );
});

test('lançamento manda id gerado no aparelho e só as colunas permitidas', async () => {
  let corpo;
  responder = (url, opcoes) => {
    corpo = JSON.parse(opcoes.body);
    return new Response(null, { status: 201 });
  };
  await api.lancar([{ obra_id: 'x', percentual_executado: 10, autor_id: 'forjado' }]);
  assert.match(corpo[0].id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(Object.keys(corpo[0]).sort(), ['id', 'obra_id', 'observacao', 'percentual_executado']);
});

test('edição de obra filtra colunas que não são editáveis', async () => {
  let corpo;
  responder = (url, opcoes) => {
    corpo = JSON.parse(opcoes.body);
    return json([{ id: 'x' }]);
  };
  await api.editarObra('x', { nome: 'Nova', percentual_executado: 99, criado_por: 'y' });
  assert.deepEqual(corpo, { nome: 'Nova' });
});

test('cadastro de obra leva id no p_dados', async () => {
  let corpo;
  responder = (url, opcoes) => {
    corpo = JSON.parse(opcoes.body);
    return json('b0000000-0000-4000-8000-000000000002');
  };
  const id = await api.criarObra({ id: 'b0000000-0000-4000-8000-000000000002', nome: 'X' }, null, { numero: '' });
  assert.equal(id, 'b0000000-0000-4000-8000-000000000002');
  assert.equal(corpo.p_dados.id, 'b0000000-0000-4000-8000-000000000002');
  assert.equal(corpo.p_documento, null, 'documento vazio vira nulo');
});

test('restaura o fetch', () => {
  globalThis.fetch = fetchOriginal;
});
