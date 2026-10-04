import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularSituacao, prazoDecorrido, diaEmImperatriz, compararParaRelatorio } from './situacao.js';

const HOJE = '2026-10-02';
const obra = (extra) => ({
  data_inicio: '2026-08-03',          // 60 dias antes de HOJE
  data_termino_prevista: '2026-12-01', // 60 dias depois: prazo decorrido = 50%
  percentual_executado: 50,
  paralisada: false,
  ultima_atualizacao_em: '2026-10-01T12:00:00Z',
  ...extra,
});
const sit = (extra, opts = {}) => calcularSituacao(obra(extra), { hoje: HOJE, tolerancia: 10, diasAlerta: 10, ...opts });

// ---------------------------------------------------------------- os cinco casos

test('1. executado 100% -> Concluída, mesmo com prazo vencido', () => {
  assert.equal(sit({ percentual_executado: 100, data_termino_prevista: '2026-09-01' }).codigo, 'concluida');
});

test('2. paralisada -> Paralisada, mesmo atrasada', () => {
  assert.equal(sit({ paralisada: true, percentual_executado: 5 }).codigo, 'paralisada');
});

test('3. antes do início -> Não iniciada', () => {
  assert.equal(sit({ data_inicio: '2026-10-10', percentual_executado: 0 }).codigo, 'nao_iniciada');
});

test('4. prazo vencido e executado < 100 -> Atrasada (prazo vencido)', () => {
  const s = sit({ data_termino_prevista: '2026-10-01', percentual_executado: 99 });
  assert.equal(s.codigo, 'atrasada');
  assert.equal(s.motivoAtraso, 'prazo_vencido');
});

test('5. desvio maior que a tolerância -> Atrasada (desvio)', () => {
  const s = sit({ percentual_executado: 39 }); // 50 - 39 = 11 > 10
  assert.equal(s.codigo, 'atrasada');
  assert.equal(s.motivoAtraso, 'desvio');
});

test('6. demais casos -> Em dia', () => {
  assert.equal(sit({ percentual_executado: 45 }).codigo, 'em_dia');
  assert.equal(sit({ percentual_executado: 80 }).codigo, 'em_dia'); // adiantada
});

// ---------------------------------------------------------------- bordas

test('desvio exatamente igual à tolerância -> Em dia', () => {
  assert.equal(sit({ percentual_executado: 40 }).codigo, 'em_dia');
});

test('a tolerância vem da configuração', () => {
  assert.equal(sit({ percentual_executado: 45 }, { tolerancia: 4 }).codigo, 'atrasada');
});

test('hoje = término: ainda não venceu', () => {
  const s = sit({ data_termino_prevista: HOJE, percentual_executado: 95 });
  assert.equal(s.prazoDecorrido, 100);
  assert.equal(s.codigo, 'em_dia');
});

test('hoje = início: prazo decorrido 0%, Em dia com 0% executado', () => {
  const s = sit({ data_inicio: HOJE, percentual_executado: 0 });
  assert.equal(s.prazoDecorrido, 0);
  assert.equal(s.codigo, 'em_dia');
});

test('início = término (datas iguais) não divide por zero', () => {
  assert.equal(prazoDecorrido('2026-09-01', '2026-09-01', HOJE), 100);
  assert.equal(prazoDecorrido('2026-10-02', '2026-10-02', HOJE), 0);
  assert.ok(Number.isFinite(sit({ data_inicio: '2026-09-01', data_termino_prevista: '2026-09-01' }).desvio));
});

test('percentual 0 no meio do prazo -> Atrasada', () => {
  assert.equal(sit({ percentual_executado: 0 }).codigo, 'atrasada');
});

test('percentual 100 com prazo em curso -> Concluída', () => {
  assert.equal(sit({ percentual_executado: 100 }).codigo, 'concluida');
});

test('percentual chega como texto (numeric do Postgres)', () => {
  assert.equal(sit({ percentual_executado: '100.00' }).codigo, 'concluida');
});

test('prazo decorrido é limitado a 0..100', () => {
  assert.equal(prazoDecorrido('2026-01-01', '2026-02-01', HOJE), 100);
  assert.equal(prazoDecorrido('2026-11-01', '2026-12-01', HOJE), 0);
});

// ---------------------------------------------------------------- alerta sem atualização

test('alerta quando a última atualização passa do limite', () => {
  const s = sit({ ultima_atualizacao_em: '2026-09-21T15:00:00Z' }); // 11 dias
  assert.equal(s.diasSemAtualizacao, 11);
  assert.equal(s.alertaSemAtualizacao, true);
});

test('sem alerta exatamente no limite', () => {
  assert.equal(sit({ ultima_atualizacao_em: '2026-09-22T15:00:00Z' }).alertaSemAtualizacao, false);
});

test('sem alerta em obra concluída, paralisada ou não iniciada', () => {
  const velho = { ultima_atualizacao_em: '2026-01-01T12:00:00Z' };
  assert.equal(sit({ ...velho, percentual_executado: 100 }).alertaSemAtualizacao, false);
  assert.equal(sit({ ...velho, paralisada: true }).alertaSemAtualizacao, false);
  assert.equal(sit({ ...velho, data_inicio: '2026-10-10' }).alertaSemAtualizacao, false);
});

test('obra nunca atualizada conta a partir do cadastro', () => {
  const s = sit({ ultima_atualizacao_em: null, criado_em: '2026-09-01T12:00:00Z' });
  assert.equal(s.nuncaAtualizada, true);
  assert.equal(s.alertaSemAtualizacao, true);
});

test('dia em Imperatriz: 01h UTC ainda é o dia anterior', () => {
  assert.equal(diaEmImperatriz('2026-10-02T01:00:00Z'), '2026-10-01');
  assert.equal(diaEmImperatriz('2026-10-02T03:00:00Z'), '2026-10-02');
});

test('relatório: atrasadas primeiro, maior desvio no topo', () => {
  const lista = [
    { nome: 'A', situacao: sit({ percentual_executado: 45 }) },
    { nome: 'B', situacao: sit({ percentual_executado: 30 }) },
    { nome: 'C', situacao: sit({ percentual_executado: 10 }) },
    { nome: 'D', situacao: sit({ paralisada: true }) },
  ].sort(compararParaRelatorio);
  assert.deepEqual(lista.map((o) => o.nome), ['C', 'B', 'D', 'A']);
});

// ---------------------------------------------------------------- revisão de bordas

test('desvio igual à tolerância em prazo "quebrado" continua Em dia (sem erro de arredondamento)', () => {
  // 60 dias de prazo, 33 decorridos = 55%; 45% executado: desvio de exatamente 10 pontos
  const s = calcularSituacao(
    { data_inicio: '2026-08-30', data_termino_prevista: '2026-10-29', percentual_executado: 45, paralisada: false,
      ultima_atualizacao_em: '2026-10-01T12:00:00Z' },
    { hoje: '2026-10-02', tolerancia: 10 },
  );
  assert.equal(s.desvio, 10);
  assert.equal(s.codigo, 'em_dia');
});

test('obra cadastrada antes do início não amanhece "sem atualização"', () => {
  const s = sit({ data_inicio: '2026-09-28', ultima_atualizacao_em: null, criado_em: '2026-09-01T12:00:00Z' });
  assert.equal(s.atualizacaoDesde, 'inicio');
  assert.equal(s.diasSemAtualizacao, 4);
  assert.equal(s.alertaSemAtualizacao, false);
});

test('depois de uma retomada, a contagem do alerta começa na retomada', () => {
  const s = sit({ ultima_atualizacao_em: '2026-07-01T12:00:00Z', ultima_retomada: '2026-09-30' });
  assert.equal(s.atualizacaoDesde, 'retomada');
  assert.equal(s.diasSemAtualizacao, 2);
  assert.equal(s.alertaSemAtualizacao, false);
  assert.equal(s.diasDesdeLancamento, 93, 'o "atualizada há" continua contando do lançamento');
});
