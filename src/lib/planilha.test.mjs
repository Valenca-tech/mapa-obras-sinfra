import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { acharCabecalho, mapearColunas, lerPlanilha, estruturar } from './planilha.js';

// Planilha no formato mais comum: título, cabeçalho na 5ª linha, etapas sem
// unidade, subtotais e total geral, números ora como número, ora como texto.
const LINHAS = [
  ['PREFEITURA MUNICIPAL DE IMPERATRIZ'],
  ['OBRA: PAVIMENTAÇÃO ASFÁLTICA'],
  ['DATA-BASE: SINAPI 08/2026', '', '', 'BDI: 25%'],
  [],
  ['ITEM', 'CÓDIGO', 'FONTE', 'DESCRIÇÃO DOS SERVIÇOS', 'UND', 'QUANT.', 'PREÇO UNIT. (R$)', 'PREÇO UNIT. C/ BDI (R$)', 'PREÇO TOTAL (R$)'],
  ['1', '', '', 'SERVIÇOS PRELIMINARES', '', '', '', '', ''],
  ['1.1', '4813', 'SINAPI', 'PLACA DE OBRA EM CHAPA GALVANIZADA', 'M2', 6, 280.4, 350.5, 2103],
  ['1.2', '99059', 'SINAPI', 'LOCAÇÃO DE OBRA COM GABARITO', 'M', '120,50', '33,68', '42,10', '5.073,05'],
  ['', '', '', 'SUBTOTAL 1', '', '', '', '', 7176.05],
  ['2', '', '', 'PAVIMENTAÇÃO', '', '', '', '', ''],
  ['2.1', '', '', 'TERRAPLENAGEM', '', '', '', '', ''],
  ['2.1.1', '100576', 'SINAPI', 'REGULARIZAÇÃO DO SUBLEITO', 'M2', 3000, 2, 2.5, 7500],
  ['2.2', '95995', 'SINAPI', 'EXECUÇÃO DE CBUQ, E = 5 CM', 'M3', 300, 1200, 1500, 450000],
  ['', '', '', 'TOTAL GERAL', '', '', '', '', 464676.05],
];

test('acha o cabeçalho e as colunas, preferindo o preço com BDI', () => {
  assert.equal(acharCabecalho(LINHAS), 4);
  assert.deepEqual(mapearColunas(LINHAS[4]), {
    numero: 0, codigo: 1, fonte: 2, descricao: 3, unidade: 4, quantidade: 5, preco_unitario: 7, total: 8,
  });
});

test('etapas, itens e subtotais: o total confere com o da planilha', () => {
  const r = lerPlanilha(LINHAS);
  assert.deepEqual(r.resumo, { etapas: 3, itens: 4, total: 464676.05, totalDeclarado: 464676.05 });
  assert.deepEqual(r.avisos, []);
  assert.deepEqual(
    r.itens.map((x) => [x.nivel, x.numero]),
    [['etapa', '1'], ['item', '1.1'], ['item', '1.2'], ['etapa', '2'], ['etapa', '2.1'], ['item', '2.1.1'], ['item', '2.2']],
  );
  const locacao = r.itens.find((x) => x.numero === '1.2');
  assert.deepEqual([locacao.quantidade, locacao.preco_unitario, locacao.total], [120.5, 42.1, 5073.05]);
});

test('avisa total que não fecha, item sem quantidade e soma diferente do total geral', () => {
  const linhas = LINHAS.map((l) => [...l]);
  linhas[6][8] = 9999; // total errado no 1.1
  linhas[12][5] = ''; // 2.2 sem quantidade
  const r = lerPlanilha(linhas);
  assert.ok(r.avisos.some((a) => /Linha 7 \(1\.1\): quantidade × preço dá 2103\.00, mas o total é 9999\.00/.test(a)));
  assert.ok(r.avisos.some((a) => /Linha 13 \(2\.2\): sem quantidade/.test(a)));
  assert.ok(r.avisos.some((a) => /não confere com o total da planilha/.test(a)));
});

test('subtotal de etapa soma as subetapas; item removido sai', () => {
  const { itens } = lerPlanilha(LINHAS);
  itens.find((x) => x.numero === '1.2').removido = true;
  const e = estruturar(itens);
  const sub = Object.fromEntries(e.linhas.filter((x) => x.nivel === 'etapa').map((x) => [x.numero, x.subtotal]));
  assert.deepEqual(sub, { 1: 2103, 2: 457500, 2.1: 7500 });
  assert.equal(e.total, 459603);
  assert.equal(e.itens, 3);
});

test('arquivo .xlsx de verdade: grava com o SheetJS e lê de volta', () => {
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(LINHAS), 'Orçamento');
  const bytes = XLSX.write(livro, { type: 'array', bookType: 'xlsx' });
  const lido = XLSX.read(bytes, { type: 'array' });
  const linhas = XLSX.utils.sheet_to_json(lido.Sheets[lido.SheetNames[0]], { header: 1, raw: true, defval: '' });
  const r = lerPlanilha(linhas);
  assert.equal(r.resumo.total, 464676.05);
  assert.equal(r.resumo.itens, 4);
});

test('sem cabeçalho reconhecível pede escolha manual', () => {
  const r = lerPlanilha([['a', 'b'], [1, 2]]);
  assert.equal(r.cabecalho, -1);
  assert.match(r.avisos[0], /Escolha as colunas à mão/);
});

test('etapa numerada como 1.0 fica no mesmo nível de 1', async () => {
  const { profundidade } = await import('./planilha.js');
  assert.deepEqual(['1', '1.0', '2.0.0', '1.1', '1.1.0', ''].map(profundidade), [1, 1, 1, 2, 2, 1]);
  const e = estruturar([
    { nivel: 'etapa', numero: '1.0', descricao: 'A' },
    { nivel: 'item', numero: '1.1', descricao: 'x', total: 10 },
    { nivel: 'item', numero: '1.2', descricao: 'y', total: 5 },
    { nivel: 'etapa', numero: '2.0', descricao: 'B' },
    { nivel: 'item', descricao: 'sem número', total: 7 },
  ]);
  assert.deepEqual(e.linhas.filter((x) => x.nivel === 'etapa').map((x) => x.subtotal), [15, 7]);
});

test('sem coluna de tipo: insumo do SINAPI e descrição com "insumo" viram material', () => {
  const r = lerPlanilha([
    ['ITEM', 'CÓDIGO', 'BANCO', 'DESCRIÇÃO', 'UND', 'QUANT.', 'PREÇO UNIT.', 'TOTAL'],
    ['1.1', '92398', 'SINAPI', 'Piso intertravado', 'm2', 10, 100, 1000],
    ['1.2', '00004718', 'SINAPI', 'Pedra britada n. 1', 'm3', 2, 100, 200],
    ['1.3', 'C-10', 'Própria', 'Cimento (insumo)', 'sc', 5, 40, 200],
  ]);
  assert.deepEqual(r.itens.map((x) => x.tipo), ['servico', 'material', 'material']);
});
