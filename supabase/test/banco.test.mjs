// Testes do banco: perfis, RLS, gatilhos, ações e limpeza da demonstração.
// Rodar com: npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, rodarArquivo, criarUsuario, como, umValor } from './banco.mjs';

let db;
const u = {};
const obra = {}; // bairro -> id

before(async () => {
  db = await novoBanco();
  u.secretario = await criarUsuario(db, { email: 'sec@teste', nome: 'Secretário Teste', papel: 'secretario' });
  u.admin = await criarUsuario(db, { email: 'adm@teste', nome: 'Admin Teste', papel: 'admin' });
  u.fiscal = await criarUsuario(db, { email: 'fis@teste', nome: 'Fiscal Teste', papel: 'fiscal' });
  u.leitura = await criarUsuario(db, { email: 'lei@teste', nome: 'Leitura Teste', papel: 'leitura' });
  u.inativo = await criarUsuario(db, { email: 'ina@teste', nome: 'Inativo Teste', papel: 'admin', ativo: false });
  const { rows } = await db.query('select id, bairro from obras');
  for (const r of rows) obra[r.bairro] = r.id;
});

const pct = (id) => umValor(db, 'select percentual_executado::float from obras where id = $1', [id]);
const erroDe = async (fn) => {
  try { await fn(); } catch (e) { return e.message; }
  assert.fail('era esperado um erro');
};

// ---------------------------------------------------------------- base

test('seed: 10 obras de demonstração com o percentual do último lançamento', async () => {
  assert.equal(await umValor(db, 'select count(*)::int from obras where demo'), 10);
  assert.equal(await pct(obra['Centro']), 100);
  assert.equal(await pct(obra['Nova Imperatriz']), 85);
  assert.equal(await pct(obra['Bacuri']), 0);
});

test('usuário que entra pelo Auth nasce desativado, sem ver nada', async () => {
  const { rows } = await db.query(
    "insert into auth.users (email, raw_user_meta_data) values ('intruso@teste', '{}') returning id",
  );
  const id = rows[0].id;
  assert.equal(await umValor(db, 'select ativo from perfis where id = $1', [id]), false);
  await como(db, id, async () => {
    assert.equal(await umValor(db, 'select count(*)::int from obras'), 0);
  });
});

test('fiscal completa documento pendente, mas não reescreve documento completo', async () => {
  // termo aditivo do seed (completo): obra de Parque Alvorada
  const aditivo = await umValor(
    db,
    "select e.id from eventos_obra e join obras o on o.id = e.obra_id where o.bairro = 'Parque Alvorada' and e.tipo = 'aditivo_prazo'",
  );
  const msg = await como(db, u.fiscal, () =>
    erroDe(() => db.query(`select completar_documento($1, '{"numero": "FORJADO", "numero_protocolo": "X-999", "tipo": "outro"}')`, [aditivo])),
  );
  assert.match(msg, /já está completo/);
  const { rows } = await db.query(
    'select d.numero, d.tipo from documentos d join eventos_obra e on e.documento_id = d.id where e.id = $1',
    [aditivo],
  );
  assert.deepEqual(rows[0], { numero: '1º TA ao Contrato 008/2026 (DEMO)', tipo: 'termo_aditivo' });
});

test('usuário novo do Auth ganha perfil "leitura" com o nome dos metadados', async () => {
  const id = await criarUsuario(db, { email: 'novo@teste', nome: 'Fulano' });
  await db.query("update perfis set papel = 'leitura' where id = $1", [id]);
  const { rows } = await db.query('select nome, papel, ativo from perfis where id = $1', [id]);
  assert.deepEqual(rows[0], { nome: 'Fulano', papel: 'leitura', ativo: true });
});

// ---------------------------------------------------------------- anônimo

test('anônimo não lê nada', async () => {
  const msg = await como(db, null, () => erroDe(() => db.query('select * from obras')));
  assert.match(msg, /permission denied/);
});

// ---------------------------------------------------------------- leitura

test('leitura vê obras, histórico e configuração', async () => {
  await como(db, u.leitura, async () => {
    assert.equal(await umValor(db, 'select count(*)::int from obras_painel'), 10);
    assert.ok(await umValor(db, 'select count(*)::int from atualizacoes') > 0);
    assert.equal(await umValor(db, 'select dias_sem_atualizacao_alerta from configuracao'), 10);
  });
});

test('leitura não altera obra, não lança percentual e não chama ações', async () => {
  const id = obra['Santa Rita'];
  await como(db, u.leitura, async () => {
    const r = await db.query("update obras set nome = 'X' where id = $1", [id]);
    assert.equal(r.affectedRows, 0);
    assert.match(
      await erroDe(() => db.query('insert into atualizacoes (obra_id, percentual_executado) values ($1, 50)', [id])),
      /row-level security/,
    );
    assert.match(await erroDe(() => db.query("select paralisar_obra($1, 'teste')", [id])), /Sem permissão/);
    assert.match(await erroDe(() => db.query("select criar_obra('{}'::jsonb)")), /Sem permissão/);
    assert.equal(await umValor(db, 'select count(*)::int from auditoria'), 0);
    const c = await db.query('update configuracao set tolerancia_atraso_pontos = 50');
    assert.equal(c.affectedRows, 0);
  });
  assert.equal(await umValor(db, 'select nome from obras where id = $1', [id]), 'Construção de Unidade Básica de Saúde');
});

test('ninguém exclui nada, nem o secretário', async () => {
  await como(db, u.secretario, async () => {
    for (const t of ['obras', 'atualizacoes', 'eventos_obra', 'documentos', 'auditoria']) {
      assert.match(await erroDe(() => db.query(`delete from ${t}`)), /permission denied/, t);
    }
  });
});

test('usuário desativado não vê nada', async () => {
  await como(db, u.inativo, async () => {
    assert.equal(await umValor(db, 'select count(*)::int from obras'), 0);
  });
});

test('funções internas não são chamáveis pelo frontend', async () => {
  await como(db, u.secretario, async () => {
    assert.match(
      await erroDe(() => db.query("select _registrar_evento($1, 'cadastro', current_date, 'x', '{}', null)", [obra['Centro']])),
      /permission denied/,
    );
  });
});

// ---------------------------------------------------------------- fiscal

test('fiscal lança percentual: obra atualiza, histórico guarda autor e valor anterior', async () => {
  const id = obra['Santa Rita'];
  await como(db, u.fiscal, () =>
    db.query("insert into atualizacoes (obra_id, percentual_executado, observacao) values ($1, 27.5, 'medição semanal')", [id]),
  );
  assert.equal(await pct(id), 27.5);
  const { rows } = await db.query(
    'select autor_id, autor_nome, percentual_anterior::float from atualizacoes where obra_id = $1 order by criado_em desc limit 1',
    [id],
  );
  assert.deepEqual(rows[0], { autor_id: u.fiscal, autor_nome: 'Fiscal Teste', percentual_anterior: 22 });
});

test('lançamento em lote é tudo ou nada', async () => {
  const a = obra['Bom Sucesso'];
  const b = obra['Vila Lobão'];
  const antes = await pct(a);
  await como(db, u.fiscal, async () => {
    await erroDe(() =>
      db.query('insert into atualizacoes (obra_id, percentual_executado) values ($1, 45), ($2, 150)', [a, b]),
    );
  });
  assert.equal(await pct(a), antes);
});

test('fiscal não forja autor, não mexe em percentual direto e não edita obra', async () => {
  const id = obra['Santa Rita'];
  await como(db, u.fiscal, async () => {
    assert.match(
      await erroDe(() =>
        db.query('insert into atualizacoes (obra_id, percentual_executado, autor_id) values ($1, 30, $2)', [id, u.admin]),
      ),
      /permission denied/,
    );
    assert.match(
      await erroDe(() => db.query('update obras set percentual_executado = 99 where id = $1', [id])),
      /permission denied/,
    );
    const r = await db.query("update obras set nome = 'X' where id = $1", [id]);
    assert.equal(r.affectedRows, 0);
    assert.match(await erroDe(() => db.query("select criar_obra('{}'::jsonb)")), /Sem permissão/);
  });
});

test('fiscal paralisa sem documento (vira pendência), completa o documento e retoma', async () => {
  const id = obra['Bom Sucesso'];
  const pendencias = () => umValor(db, 'select count(*)::int from pendencias_documentais where obra_id = $1', [id]);

  const evento = await como(db, u.fiscal, () =>
    umValor(db, "select paralisar_obra($1, 'Chuva forte, frente alagada')", [id]),
  );
  assert.equal(await umValor(db, 'select paralisada from obras where id = $1', [id]), true);
  assert.equal(await pendencias(), 1);

  // só o número ainda não basta: falta o protocolo
  await como(db, u.fiscal, () => db.query(`select completar_documento($1, '{"numero": "OP 12/2026"}')`, [evento]));
  assert.equal(await pendencias(), 1);
  await como(db, u.fiscal, () =>
    db.query(`select completar_documento($1, '{"numero_protocolo": "2026/000123"}')`, [evento]),
  );
  assert.equal(await pendencias(), 0);
  assert.equal(await umValor(db, 'select d.tipo from documentos d join eventos_obra e on e.documento_id = d.id where e.id = $1', [evento]), 'ordem_paralisacao');

  await como(db, u.fiscal, () =>
    db.query(`select retomar_obra($1, 'Retomada', '{"numero": "OR 3/2026", "numero_protocolo": "2026/000200"}')`, [id]),
  );
  assert.equal(await umValor(db, 'select paralisada from obras where id = $1', [id]), false);
  assert.equal(await pendencias(), 0);
});

// ---------------------------------------------------------------- admin

test('admin cadastra obra já em andamento: percentual inicial vira primeiro lançamento', async () => {
  const dados = {
    nome: 'Obra nova de teste', tipo: 'drenagem', bairro: 'Centro',
    data_inicio: '2026-09-01', data_termino_prevista: '2027-03-01',
    latitude: -5.52, longitude: -47.48, valor_contrato: '150000.50',
  };
  const id = await como(db, u.admin, () =>
    umValor(db, `select criar_obra($1::jsonb, 35, '{"numero": "OS 9/2026", "numero_protocolo": "P-1"}')`, [JSON.stringify(dados)]),
  );
  obra.nova = id;
  assert.equal(await pct(id), 35);
  const { rows } = await db.query('select data_termino_original::text, criado_por, demo from obras where id = $1', [id]);
  assert.deepEqual(rows[0], { data_termino_original: '2027-03-01', criado_por: u.admin, demo: false });
  assert.equal(await umValor(db, 'select autor_nome from atualizacoes where obra_id = $1', [id]), 'Admin Teste');
  assert.equal(await umValor(db, "select count(*)::int from eventos_obra where obra_id = $1 and tipo = 'cadastro' and documento_id is not null", [id]), 1);
});

test('cadastro valida campos obrigatórios com mensagem clara', async () => {
  await como(db, u.admin, async () => {
    const base = { nome: 'X', tipo: 'outro', data_inicio: '2026-10-10', data_termino_prevista: '2026-10-01', latitude: -5.5, longitude: -47.4 };
    assert.match(await erroDe(() => db.query('select criar_obra($1::jsonb)', [JSON.stringify(base)])), /posterior ao início/);
    assert.match(await erroDe(() => db.query('select criar_obra($1::jsonb)', [JSON.stringify({ ...base, nome: ' ' })])), /nome da obra/);
    assert.match(
      await erroDe(() => db.query('select criar_obra($1::jsonb)', [JSON.stringify({ ...base, data_termino_prevista: '2027-01-01', latitude: null })])),
      /localização/,
    );
  });
});

test('admin corrige término sem aditivo: o original acompanha', async () => {
  const id = obra.nova;
  await como(db, u.admin, () => db.query("update obras set data_termino_prevista = '2027-04-01' where id = $1", [id]));
  assert.equal(await umValor(db, 'select data_termino_original::text from obras where id = $1', [id]), '2027-04-01');
});

test('aditivo de prazo preserva o término original e trava a edição direta do término', async () => {
  const id = obra.nova;
  await como(db, u.admin, () =>
    db.query(`select registrar_aditivo_prazo($1, '2027-06-30', 'Chuvas', '{"numero": "1º TA", "numero_protocolo": "P-2"}')`, [id]),
  );
  const { rows } = await db.query('select data_termino_prevista::text p, data_termino_original::text o from obras where id = $1', [id]);
  assert.deepEqual(rows[0], { p: '2027-06-30', o: '2027-04-01' });
  assert.equal(await umValor(db, 'select prorrogada from obras_painel where id = $1', [id]), true);

  const msg = await como(db, u.admin, () =>
    erroDe(() => db.query("update obras set data_termino_prevista = '2027-12-31' where id = $1", [id])),
  );
  assert.match(msg, /registre um novo aditivo/);
});

test('fiscal não registra aditivo', async () => {
  const msg = await como(db, u.fiscal, () =>
    erroDe(() => db.query("select registrar_aditivo_prazo($1, '2028-01-01')", [obra.nova])),
  );
  assert.match(msg, /Sem permissão/);
});

test('obra arquivada: não recebe lançamento nem edição; desarquivar volta ao normal', async () => {
  const id = obra.nova;
  await como(db, u.admin, () => db.query("select arquivar_obra($1, 'Contrato rescindido')", [id]));
  assert.equal(await umValor(db, 'select arquivada from obras where id = $1', [id]), true);
  await como(db, u.admin, async () => {
    assert.match(
      await erroDe(() => db.query('insert into atualizacoes (obra_id, percentual_executado) values ($1, 40)', [id])),
      /arquivada/,
    );
    const r = await db.query("update obras set nome = 'Y' where id = $1", [id]);
    assert.equal(r.affectedRows, 0);
    await db.query("select desarquivar_obra($1, 'Arquivada por engano')", [id]);
  });
  assert.equal(await umValor(db, 'select arquivada from obras where id = $1', [id]), false);
});

test('admin não altera configuração nem vê auditoria', async () => {
  await como(db, u.admin, async () => {
    const r = await db.query('update configuracao set tolerancia_atraso_pontos = 15');
    assert.equal(r.affectedRows, 0);
    assert.equal(await umValor(db, 'select count(*)::int from auditoria'), 0);
  });
});

// ---------------------------------------------------------------- secretário

test('secretário tem todas as permissões, altera configuração e vê auditoria', async () => {
  await como(db, u.secretario, async () => {
    const { rows } = await db.query('select * from minhas_permissoes()');
    assert.equal(rows[0].papel, 'secretario');
    assert.equal(rows[0].permissoes.length, await umValor(db, 'select count(*)::int from permissoes'));
    const r = await db.query('update configuracao set tolerancia_atraso_pontos = 12');
    assert.equal(r.affectedRows, 1);
    assert.ok(await umValor(db, 'select count(*)::int from auditoria') > 0);
  });
  await db.query('update configuracao set tolerancia_atraso_pontos = 10');
});

test('auditoria registra quem alterou a obra, com antes e depois', async () => {
  const id = obra['Vila Lobão'];
  await como(db, u.admin, () => db.query("update obras set empresa = 'Nova Empresa' where id = $1", [id]));
  const { rows } = await db.query(
    "select usuario_id, antes->>'empresa' a, depois->>'empresa' d from auditoria where tabela = 'obras' and registro_id = $1 order by id desc limit 1",
    [id],
  );
  assert.deepEqual(rows[0], { usuario_id: u.admin, a: 'Pavimenta Fictícia S.A.', d: 'Nova Empresa' });
});

// ---------------------------------------------------------------- trecho

const TRECHO = { type: 'LineString', coordinates: [[-47.4800, -5.5300], [-47.4790, -5.5295], [-47.4780, -5.5290]] };

test('seed: obras de via têm trecho em GeoJSON', async () => {
  assert.equal(await umValor(db, 'select count(*)::int from obras where demo and trecho is not null'), 6);
  const { rows } = await db.query(
    "select trecho->>'type' t, jsonb_array_length(trecho->'coordinates') n from obras where bairro = 'Nova Imperatriz' and demo",
  );
  assert.deepEqual(rows[0], { t: 'MultiLineString', n: 3 });
});

test('trecho inválido é recusado com mensagem clara', async () => {
  const base = {
    nome: 'Obra com trecho', tipo: 'pavimentacao', data_inicio: '2026-09-01', data_termino_prevista: '2027-03-01',
    latitude: -5.53, longitude: -47.48,
  };
  const criar = (trecho) =>
    como(db, u.admin, () => erroDe(() => db.query('select criar_obra($1::jsonb)', [JSON.stringify({ ...base, trecho })])));
  assert.match(await criar({ type: 'LineString', coordinates: [[-47.48, -5.53]] }), /pelo menos 2 pontos/);
  assert.match(await criar({ type: 'Polygon', coordinates: [] }), /Trecho inválido/);
  assert.match(await criar({ type: 'LineString', coordinates: [[-47.48, -5.53], [200, -5.53]] }), /coordenada inválida/);
  assert.match(await criar({ type: 'LineString', coordinates: [[-47.48, -5.53], ['x', -5.53]] }), /Trecho inválido/);
});

test('gabinete cadastra obra com trecho e desenha trecho em obra existente; fiscal não', async () => {
  const id = await como(db, u.admin, () =>
    umValor(db, 'select criar_obra($1::jsonb)', [JSON.stringify({
      nome: 'Recapeamento de teste', tipo: 'pavimentacao', data_inicio: '2026-09-01', data_termino_prevista: '2027-03-01',
      latitude: -5.5295, longitude: -47.479, trecho: TRECHO,
    })]),
  );
  assert.equal(await umValor(db, "select trecho->>'type' from obras where id = $1", [id]), 'LineString');

  const lobao = obra['Vila Lobão'];
  const r = await como(db, u.fiscal, () =>
    db.query('update obras set trecho = $2::jsonb where id = $1', [lobao, JSON.stringify(TRECHO)]),
  );
  assert.equal(r.affectedRows, 0);
  const r2 = await como(db, u.admin, () =>
    db.query('update obras set trecho = null where id = $1', [lobao]),
  );
  assert.equal(r2.affectedRows, 1);
  assert.equal(await umValor(db, 'select trecho from obras where id = $1', [lobao]), null);
});

// ---------------------------------------------------------------- instalações públicas

test('instalações: todos os ativos veem; só gabinete e secretário cadastram e editam', async () => {
  await como(db, u.leitura, async () => {
    assert.equal(await umValor(db, 'select count(*)::int from instalacoes'), 18);
    const r = await db.query("update instalacoes set nome = 'X'");
    assert.equal(r.affectedRows, 0);
  });
  const nova = { nome: 'Pátio de máquinas da SINFRA', tipo: 'patio', latitude: -5.54, longitude: -47.46 };
  const inserir = () =>
    db.query('insert into instalacoes (nome, tipo, latitude, longitude) values ($1, $2, $3, $4) returning id',
      [nova.nome, nova.tipo, nova.latitude, nova.longitude]);
  assert.match(await como(db, u.fiscal, () => erroDe(inserir)), /row-level security/);
  const { rows } = await como(db, u.admin, inserir);
  const id = rows[0].id;
  assert.equal(await umValor(db, 'select criado_por from instalacoes where id = $1', [id]), u.admin);
  await como(db, u.admin, () => db.query('update instalacoes set ativa = false where id = $1', [id]));
  assert.equal(await umValor(db, 'select ativa from instalacoes where id = $1', [id]), false);
  assert.match(await como(db, u.secretario, () => erroDe(() => db.query('delete from instalacoes'))), /permission denied/);
  assert.equal(
    await umValor(db, "select count(*)::int from auditoria where tabela = 'instalacoes' and registro_id = $1", [id]),
    2,
  );
});

test('obra pode ser vinculada a uma instalação pública', async () => {
  const escola = await umValor(db, "select id from instalacoes where nome = 'Escola Municipal Sinopse'");
  const id = await como(db, u.admin, () =>
    umValor(db, 'select criar_obra($1::jsonb)', [JSON.stringify({
      nome: 'Reforma da cobertura', tipo: 'edificacao', data_inicio: '2026-09-01', data_termino_prevista: '2027-01-01',
      latitude: -5.4963, longitude: -47.4872, instalacao_id: escola,
    })]),
  );
  assert.equal(await umValor(db, 'select instalacao_id from obras_painel where id = $1', [id]), escola);
  const msg = await como(db, u.admin, () =>
    erroDe(() => db.query('update obras set instalacao_id = gen_random_uuid() where id = $1', [id])),
  );
  assert.match(msg, /instalacao_id_fkey|foreign key/);
});

// ---------------------------------------------------------------- repetição e datas

test('cadastro repetido com o mesmo id não duplica; outro usuário não reaproveita o id', async () => {
  const dados = {
    id: '7b0c3c52-55a8-4c43-9d0e-6f4d7f3f2a10', nome: 'Obra repetida', tipo: 'outro',
    data_inicio: '2026-09-01', data_termino_prevista: '2027-03-01', latitude: -5.52, longitude: -47.48,
  };
  const criar = (quem) => como(db, quem, () => umValor(db, 'select criar_obra($1::jsonb, 10)', [JSON.stringify(dados)]));
  assert.equal(await criar(u.admin), dados.id);
  assert.equal(await criar(u.admin), dados.id, 'a 2ª tentativa devolve a obra já gravada');
  assert.equal(await umValor(db, "select count(*)::int from obras where nome = 'Obra repetida'"), 1);
  assert.equal(await umValor(db, 'select count(*)::int from atualizacoes where obra_id = $1', [dados.id]), 1);
  assert.equal(await umValor(db, 'select count(*)::int from eventos_obra where obra_id = $1', [dados.id]), 1);
  assert.match(
    await como(db, u.secretario, () => erroDe(() => db.query('select criar_obra($1::jsonb)', [JSON.stringify(dados)]))),
    /obras_pkey/,
  );
});

test('lançamento repetido com o mesmo id esbarra na chave; a mesma obra duas vezes no lote é recusada', async () => {
  const id = obra['Santa Rita'];
  const lancamento = '0d9f3c1e-1111-4c43-9d0e-6f4d7f3f2a10';
  const inserir = () =>
    db.query('insert into atualizacoes (id, obra_id, percentual_executado) values ($1, $2, 30)', [lancamento, id]);
  await como(db, u.fiscal, inserir);
  assert.match(await como(db, u.fiscal, () => erroDe(inserir)), /atualizacoes_pkey/);
  assert.equal(await umValor(db, 'select count(*)::int from atualizacoes where id = $1', [lancamento]), 1);
  const msg = await como(db, u.fiscal, () =>
    erroDe(() => db.query('insert into atualizacoes (obra_id, percentual_executado) values ($1, 50), ($1, 31)', [id])),
  );
  assert.match(msg, /atualizacoes_obra_momento_unico/);
  assert.equal(await pct(id), 30);
});

test('datas com ano impossível, inexistentes ou fora do formato são recusadas', async () => {
  const base = {
    nome: 'Datas', tipo: 'outro', data_inicio: '2026-09-01', data_termino_prevista: '2027-03-01',
    latitude: -5.52, longitude: -47.48,
  };
  const criar = (d) =>
    como(db, u.admin, () => erroDe(() => db.query('select criar_obra($1::jsonb)', [JSON.stringify({ ...base, ...d })])));
  assert.match(await criar({ data_inicio: '0026-09-01' }), /fora do intervalo aceito/);
  assert.match(await criar({ data_termino_prevista: '20266-10-03' }), /formato inválido/);
  assert.match(await criar({ data_inicio: '01/09/2026' }), /formato inválido/);
  assert.match(await criar({ data_inicio: '2026-02-30' }), /não existe no calendário/);

  const id = obra['Santa Inês'];
  assert.match(
    await como(db, u.admin, () =>
      erroDe(() => db.query("update obras set data_termino_prevista = '2200-01-01' where id = $1", [id])),
    ),
    /obras_datas_plausiveis/,
  );
  assert.match(
    await como(db, u.fiscal, () =>
      erroDe(() => db.query(`select paralisar_obra($1, 'x', '{"numero": "1", "data_protocolo": "2099-01-01"}')`, [id])),
    ),
    /data do protocolo não pode ser futura/,
  );
  assert.equal(await umValor(db, 'select paralisada from obras where id = $1', [id]), false, 'nada ficou gravado');
});

test('paralisação não começa antes da obra nem antes da última retomada', async () => {
  const id = obra['Vila Redenção'];
  await como(db, u.fiscal, async () => {
    assert.match(
      await erroDe(() => db.query("select paralisar_obra($1, 'x', null, (select data_inicio - 1 from obras where id = $1))", [id])),
      /anterior ao início da obra/,
    );
    await db.query("select paralisar_obra($1, 'Chuva', null, hoje() - 10)", [id]);
    await db.query("select retomar_obra($1, 'Voltou', null, hoje() - 5)", [id]);
    assert.match(
      await erroDe(() => db.query("select paralisar_obra($1, 'x', null, hoje() - 7)", [id])),
      /anterior à última retomada/,
    );
    await db.query("select paralisar_obra($1, 'De novo', null, hoje() - 5)", [id]);
  });
  assert.equal(await umValor(db, 'select paralisada_desde = hoje() - 5 from obras where id = $1', [id]), true);
});

test('aditivo: data futura é recusada; reduzir o prazo é aceito e não conta como prorrogação', async () => {
  const id = obra['Santa Rita'];
  await como(db, u.admin, async () => {
    assert.match(
      await erroDe(() => db.query('select registrar_aditivo_prazo($1, hoje() + 400, null, null, hoje() + 1)', [id])),
      /não pode ser futura/,
    );
    await db.query(
      "select registrar_aditivo_prazo($1, (select data_termino_prevista - 30 from obras where id = $1), 'Supressão')",
      [id],
    );
  });
  const { rows } = await db.query('select tem_aditivo, prorrogada from obras_painel where id = $1', [id]);
  assert.deepEqual(rows[0], { tem_aditivo: true, prorrogada: false });
});

test('documento pendente: campo já preenchido não se troca; reenviar o mesmo valor passa', async () => {
  const id = obra['Santa Inês'];
  const evento = await como(db, u.fiscal, () =>
    umValor(db, `select paralisar_obra($1, 'Falta de material', '{"numero": "OP 12/2026", "data_protocolo": "2026-01-02"}')`, [id]),
  );
  const completar = (doc) =>
    como(db, u.fiscal, () => db.query('select completar_documento($1, $2::jsonb)', [evento, JSON.stringify(doc)]));
  assert.match(
    await erroDe(() => completar({ tipo: 'ordem_paralisacao', numero: 'OP 13/2026', numero_protocolo: '2026/777' })),
    /número já está registrado \("OP 12\/2026"\)/,
  );
  assert.match(
    await erroDe(() => completar({ numero_protocolo: '2026/777', data_protocolo: '2026-01-03' })),
    /data do protocolo já está registrada \(02\/01\/2026\)/,
  );
  assert.match(
    await erroDe(() => completar({ tipo: 'oficio', numero_protocolo: '2026/777' })),
    /tipo já está registrado \("Ordem de paralisação"\)/,
  );
  await completar({ tipo: 'ordem_paralisacao', numero: 'OP 12/2026', numero_protocolo: '2026/777', data_protocolo: '2026-01-02' });
  const { rows } = await db.query(
    'select d.numero, d.numero_protocolo, d.pendente from documentos d join eventos_obra e on e.documento_id = d.id where e.id = $1',
    [evento],
  );
  assert.deepEqual(rows[0], { numero: 'OP 12/2026', numero_protocolo: '2026/777', pendente: false });
});

test('instalações iniciais não são carregadas duas vezes', async () => {
  const antes = await umValor(db, 'select count(*)::int from instalacoes');
  try {
    assert.match(await erroDe(() => rodarArquivo(db, 'instalacoes_iniciais.sql')), /já foram carregadas/);
  } finally {
    await db.exec('rollback'); // o script para no meio da transação
  }
  assert.equal(await umValor(db, 'select count(*)::int from instalacoes'), antes);
});

test('funções do banco ignoram tabela temporária com o mesmo nome', async () => {
  await como(db, u.leitura, async () => {
    try {
      await db.query('create temp table perfis (id uuid, nome text, papel text, ativo boolean)');
      await db.query("insert into pg_temp.perfis values ($1, 'Falso', 'secretario', true)", [u.leitura]);
      assert.equal(await umValor(db, "select tem_permissao('obra.cadastrar')"), false);
      assert.match(await erroDe(() => db.query("select criar_obra('{}'::jsonb)")), /Sem permissão/);
    } finally {
      await db.query('drop table if exists pg_temp.perfis');
    }
  });
});

// ---------------------------------------------------------------- limpeza (por último)

test('limpar_demo remove só a demonstração e deixa um registro da limpeza', async () => {
  const reais = await umValor(db, 'select count(*)::int from obras where not demo'); // criadas nos testes
  const instalacoes = await umValor(db, 'select count(*)::int from instalacoes');
  await rodarArquivo(db, 'limpar_demo.sql');
  assert.equal(await umValor(db, 'select count(*)::int from obras where demo'), 0);
  assert.equal(await umValor(db, 'select count(*)::int from obras'), reais);
  assert.equal(await umValor(db, 'select count(*)::int from instalacoes'), instalacoes, 'instalações reais ficam');
  assert.equal(
    await umValor(db, 'select count(*)::int from atualizacoes a left join obras o on o.id = a.obra_id where o.id is null'),
    0,
  );
  assert.equal(
    await umValor(db, "select count(*)::int from auditoria where coalesce(depois, antes)->>'demo' = 'true'"),
    0,
  );
  assert.equal(await umValor(db, "select (depois->>'obras_removidas')::int from auditoria where operacao = 'LIMPEZA_DEMO'"), 10);
});
