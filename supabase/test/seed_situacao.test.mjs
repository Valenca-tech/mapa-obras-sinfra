// Critério de aceite 4: a situação de cada obra do seed confere com a regra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco } from './banco.mjs';
import { calcularSituacao, hojeEmImperatriz, diaEmImperatriz } from '../../src/lib/situacao.js';
import { sqlDeslocarDatas } from '../../src/api/demo_dados.js';

const ESPERADO = {
  'Centro':          ['concluida', false],
  'Bacuri':          ['nao_iniciada', false],
  'Nova Imperatriz': ['atrasada', false],
  'Vila Lobão':      ['atrasada', false],
  'Santa Rita':      ['em_dia', false],
  'Bom Sucesso':     ['em_dia', false],
  'Vila Nova':       ['paralisada', false],
  'Parque Alvorada': ['em_dia', false],
  'Vila Redenção':   ['em_dia', true],
  'Santa Inês':      ['em_dia', false],
};

// O HTML único traz o banco montado no dia da geração; ao abrir N dias depois,
// as datas andam N dias e cada obra precisa continuar na situação planejada.
test('banco pronto aberto dias depois: datas deslocadas mantêm as situações', async () => {
  const db = await novoBanco();
  const N = 9;
  const contarAuditoria = async () => (await db.query('select count(*)::int n from auditoria')).rows[0].n;
  const auditoriaAntes = await contarAuditoria();
  await db.exec(sqlDeslocarDatas(N));
  assert.equal(await contarAuditoria(), auditoriaAntes, 'o ajuste não pode gerar auditoria');
  const { rows } = await db.query('select jsonb_agg(to_jsonb(o)) j from obras_painel o');
  const depois = new Date(Date.now() + N * 86_400_000);
  const hoje = diaEmImperatriz(depois);
  for (const o of rows[0].j) {
    const s = calcularSituacao(o, { hoje, tolerancia: 10, diasAlerta: 10 });
    assert.deepEqual([s.codigo, s.alertaSemAtualizacao], ESPERADO[o.bairro], o.bairro);
  }
  const alvorada = rows[0].j.find((o) => o.bairro === 'Parque Alvorada');
  const evento = await db.query("select dados from eventos_obra where tipo = 'aditivo_prazo' and obra_id = $1", [alvorada.id]);
  assert.equal(evento.rows[0].dados.termino_novo, alvorada.data_termino_prevista);
});

test('situação de cada obra do seed confere com o planejado', async () => {
  const db = await novoBanco();
  const { rows } = await db.query(
    "select jsonb_agg(to_jsonb(o)) j from obras_painel o",
  );
  const hoje = hojeEmImperatriz();
  for (const o of rows[0].j) {
    const s = calcularSituacao(o, { hoje, tolerancia: 10, diasAlerta: 10 });
    assert.deepEqual([s.codigo, s.alertaSemAtualizacao], ESPERADO[o.bairro], o.bairro);
  }
  const vilaNova = rows[0].j.find((o) => o.bairro === 'Vila Nova');
  assert.equal(vilaNova.pendencias_documentais, 1);
  const alvorada = rows[0].j.find((o) => o.bairro === 'Parque Alvorada');
  assert.equal(alvorada.prorrogada, true);
});
