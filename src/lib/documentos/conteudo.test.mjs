import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrato, montarDocumento, trechos, textoCelula } from './conteudo.js';

const config = {
  orgao_nome: 'Secretaria Municipal de Infraestrutura e Serviços Públicos',
  orgao_sigla: 'SINFRA',
  orgao_endereco: 'Rua Y, s/nº, Nova Imperatriz, CEP 65.907-180, Imperatriz-MA',
  orgao_telefone: '(99) 98453-1653',
  orgao_email: 'sinfra@imperatriz.ma.gov.br',
  prefeitura_cnpj: '06.158.455/0001-16',
  secretario_nome: 'Fulano de Tal',
  secretario_cargo: 'Secretário Municipal de Infraestrutura e Serviços Públicos',
  secretario_matricula: '123',
  secretario_ato: 'Portaria nº 1/2025-GAB',
};

const obra = {
  id: 'o1',
  nome: 'Pavimentação da Rua A',
  bairro: 'Bacuri',
  empresa: 'Construtora X Ltda.',
  empresa_cnpj: '11.111.111/0001-11',
  numero_contrato: '010/2026',
  numero_processo: '2026/555',
  valor_contrato: 1200000,
  data_inicio: '2026-03-01',
  data_termino_original: '2026-09-01',
  data_termino_prevista: '2026-12-01',
  percentual_executado: 45.5,
  ultima_atualizacao_em: '2026-10-01T13:00:00Z',
  paralisada: false,
  fiscal_responsavel: 'Beltrana Silva',
  fiscal_titulo: 'Engenheira Civil',
  fiscal_registro: 'CREA-MA nº 999',
  fiscal_matricula: '456',
  latitude: -5.5, longitude: -47.47,
  situacao: { codigo: 'em_dia', rotulo: 'Em dia', prazoDecorrido: 70 },
};

const historico = {
  eventos: [
    { tipo: 'aditivo_prazo', data_evento: '2026-08-20', dados: { termino_anterior: '2026-09-01', termino_novo: '2026-12-01' }, documento: { numero: 'TA 1/2026' } },
  ],
};

const planilha = {
  orcamento: { descricao: 'Planilha do contrato', data_base: 'SINAPI 01/2026', bdi_percentual: 25 },
  itens: [
    { ordem: 1, nivel: 'etapa', numero: '1', descricao: 'SERVIÇOS PRELIMINARES' },
    { ordem: 2, nivel: 'item', numero: '1.1', descricao: 'Placa de obra', unidade: 'm²', quantidade: 6, preco_unitario: 500, total: 3000, tipo: 'material' },
    { ordem: 3, nivel: 'etapa', numero: '2', descricao: 'PAVIMENTAÇÃO' },
    { ordem: 4, nivel: 'item', numero: '2.1', descricao: 'CBUQ', unidade: 'm³', quantidade: 100, preco_unitario: 1500, total: 150000, tipo: 'servico' },
    { ordem: 5, nivel: 'item', numero: '2.2', descricao: 'CAP 50/70', unidade: 't', quantidade: 10, preco_unitario: 6000, total: 60000, tipo: 'material' },
    { ordem: 6, nivel: 'item', numero: '2.3', descricao: 'Item removido', unidade: 'un', quantidade: 1, preco_unitario: 1, total: 1, removido: true },
  ],
};

const base = { obra, config, historico, planilha, tipoObra: 'Pavimentação', hoje: '2026-10-04' };
const texto = (doc) =>
  doc.blocos.map((b) => (b.trechos ? b.trechos.map((t) => t.t).join('') : b.texto ?? JSON.stringify(b))).join('\n');

test('trechos com negrito', () => {
  assert.deepEqual(trechos('a **b** c'), [{ t: 'a ', b: false }, { t: 'b', b: true }, { t: ' c', b: false }]);
});

test('declaração de andamento: texto oficial, número, data e assinaturas', () => {
  const r = retrato({ ...base, tipo: 'declaracao_andamento', campos: { solicitante: 'Construtora X Ltda.', finalidade: 'medição' } });
  const doc = montarDocumento(r, { numero: 7, ano: 2026 });
  assert.equal(doc.titulo, 'DECLARAÇÃO');
  assert.equal(doc.numero, 'Nº 007/2026-SINFRA');
  assert.equal(doc.fecho, 'Imperatriz-MA, 4 de outubro de 2026.');
  const t = texto(doc);
  assert.match(t, /^Declaramos, para os devidos fins, que a obra Pavimentação da Rua A, no bairro Bacuri/);
  assert.match(t, /Contrato nº 010\/2026 \(Processo Administrativo nº 2026\/555\)/);
  assert.match(t, /um milhão e duzentos mil reais/);
  assert.match(t, /CNPJ sob o nº 11\.111\.111\/0001-11/);
  assert.match(t, /em execução, com 45,5% \(quarenta e cinco vírgula cinco por cento\)/);
  assert.match(t, /conforme termo aditivo de prazo \(término original: 01\/09\/2026\)/);
  assert.match(t, /a pedido de Construtora X Ltda\., para fins de medição\./);
  assert.equal(doc.assinaturas.length, 2);
  assert.deepEqual(doc.assinaturas[0].linhas, [config.secretario_cargo, 'Portaria nº 1/2025-GAB', 'Matrícula nº 123']);
  assert.deepEqual(doc.assinaturas[1].linhas, ['Engenheira Civil', 'CREA-MA nº 999', 'Matrícula nº 456', 'Fiscal da obra']);
  assert.deepEqual(doc.timbre.linhas, ['ESTADO DO MARANHÃO', 'PREFEITURA MUNICIPAL DE IMPERATRIZ', 'SECRETARIA MUNICIPAL DE INFRAESTRUTURA E SERVIÇOS PÚBLICOS']);
  assert.match(doc.timbre.rodape.join(' '), /CNPJ: 06\.158\.455\/0001-16/);
  assert.equal(doc.nomeArquivo, 'Declaracao_andamento_007-2026-SINFRA_Pavimentacao_da_Rua_A');
});

test('obra paralisada e sem fiscal: texto muda e só o secretário assina', () => {
  const o = { ...obra, paralisada: true, paralisada_desde: '2026-09-10', motivo_paralisacao: 'Chuvas.', fiscal_responsavel: null, situacao: { codigo: 'paralisada', rotulo: 'Paralisada' } };
  const doc = montarDocumento(retrato({ ...base, obra: o, tipo: 'declaracao_andamento' }), { numero: 1, ano: 2026 });
  assert.match(texto(doc), /encontra-se paralisada desde 10\/09\/2026/);
  assert.match(texto(doc), /Motivo da paralisação: Chuvas\./);
  assert.equal(doc.assinaturas.length, 1);
});

test('atestado: empresa, RT, ART, só itens com quantidade', () => {
  const campos = {
    periodo_inicio: '2026-03-01', periodo_fim: '2026-09-30', rt_nome: 'Ciclano', rt_titulo: 'Engenheiro Civil',
    rt_registro: 'CREA-MA nº 1', art_numero: 'MA2026000', parcial: false,
    itens: [
      { numero: '2.1', descricao: 'CBUQ', unidade: 'm³', quantidade: 100 },
      { numero: '2.2', descricao: 'CAP', unidade: 't', quantidade: '' },
    ],
  };
  const doc = montarDocumento(retrato({ ...base, tipo: 'atestado_capacidade', campos }), { numero: 2, ano: 2026 });
  const t = texto(doc);
  assert.match(t, /^Atestamos, para os devidos fins, que a empresa Construtora X Ltda\., inscrita no CNPJ/);
  assert.match(t, /executou para o Município de Imperatriz, por intermédio da Secretaria Municipal de Infraestrutura e Serviços Públicos \(SINFRA\)/);
  assert.match(t, /no período de 01\/03\/2026 a 30\/09\/2026/);
  assert.match(t, /responsável técnico Ciclano, Engenheiro Civil, CREA-MA nº 1, conforme Anotação de Responsabilidade Técnica \(ART\) nº MA2026000/);
  const tabela = doc.blocos.find((b) => b.tipo === 'tabela');
  assert.equal(tabela.linhas.length, 1);
  assert.equal(textoCelula(tabela.linhas[0].celulas[3]), '100,00');
});

test('ficha técnica: aditivo, etapas da planilha com percentuais', () => {
  const doc = montarDocumento(retrato({ ...base, tipo: 'ficha_tecnica' }), { numero: 3, ano: 2026 });
  const pares = doc.blocos.filter((b) => b.tipo === 'dados').flatMap((b) => b.pares);
  const valor = (rotulo) => pares.find((p) => p[0] === rotulo)?.[1];
  assert.equal(valor('Término vigente'), '01/12/2026');
  assert.match(valor('1º aditivo de prazo'), /término de 01\/09\/2026 para 01\/12\/2026 \(nº TA 1\/2026\)/);
  const etapas = doc.blocos.find((b) => b.tipo === 'tabela');
  assert.deepEqual(etapas.linhas.map((l) => textoCelula(l.celulas[2])), ['3.000,00', '210.000,00', '213.000,00']);
  assert.equal(etapas.linhas[0].celulas[3], '1,41%');
  assert.match(texto(doc), /difere do valor do contrato/);
});

test('planilha de serviços: deitada, subtotais, filtro só materiais', () => {
  const todos = montarDocumento(retrato({ ...base, tipo: 'planilha_servicos', campos: { filtro_tipo: 'todos' } }), { numero: 4, ano: 2026 });
  assert.equal(todos.paisagem, true);
  const linhas = todos.planilha.linhas;
  assert.equal(linhas.length, 6); // 2 etapas + 3 itens + total (removido fica fora)
  assert.equal(textoCelula(linhas[2].celulas[7]), '210.000,00');
  assert.equal(textoCelula(linhas.at(-1).celulas[7]), '213.000,00');

  const materiais = montarDocumento(
    retrato({ ...base, tipo: 'planilha_servicos', campos: { filtro_tipo: 'material' } }),
    { numero: 5, ano: 2026 },
  );
  const m = materiais.planilha.linhas;
  assert.deepEqual(m.map((l) => l.celulas[0]), ['1', '1.1', '2', '2.2', '']);
  assert.equal(textoCelula(m.at(-1).celulas[7]), '63.000,00');
  assert.equal(m.at(-1).celulas[3], 'TOTAL DOS ITENS LISTADOS');
});
