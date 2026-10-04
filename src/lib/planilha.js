// Leitura da planilha orçamentária do contrato (Excel, ODS ou CSV).
//
// Não há um formato único: cada orçamentista monta a sua. A leitura então
//   1. acha a linha de cabeçalho (a que tem mais nomes de coluna conhecidos);
//   2. associa cada coluna a um campo (item, código, fonte, descrição, unidade,
//      quantidade, preço unitário, total, tipo), e a pessoa pode corrigir;
//   3. interpreta as linhas: título sem unidade e sem quantidade é etapa; linha
//      de subtotal/total é usada só para conferir a soma; o resto é item.
// Funções puras (sem navegador): testadas no Node.
import { lerNumero } from './formato.js';
import { semAcento } from './texto.js';

/** Campos que a planilha da ferramenta guarda, com os nomes de coluna que costumam aparecer. */
export const CAMPOS = [
  { campo: 'numero', rotulo: 'Item (numeração)', chaves: [/^item$/, /^itens$/, /^it\.?$/, /^n[o.]?$/, /^num/, /^ordem$/] },
  { campo: 'codigo', rotulo: 'Código', chaves: [/codigo/, /^cod\.?$/, /^cod /] },
  { campo: 'fonte', rotulo: 'Fonte / banco de preços', chaves: [/^fonte/, /^banco/, /referencia/, /^base$/, /^orgao$/] },
  { campo: 'descricao', rotulo: 'Descrição', chaves: [/descri/, /discrimina/, /especifica/, /^servicos?$/] },
  { campo: 'unidade', rotulo: 'Unidade', chaves: [/^und?\.?$/, /^unid/, /^unidade/] },
  { campo: 'quantidade', rotulo: 'Quantidade', chaves: [/^quant/, /^qtd/, /^qtde/, /^quantidade/] },
  { campo: 'preco_unitario', rotulo: 'Preço unitário', chaves: [/unit/, /preco un/, /valor un/, /custo un/, /^p\.? ?unit/] },
  { campo: 'total', rotulo: 'Total', chaves: [/total/, /^valor$/, /^preco$/, /^subtotal/] },
  { campo: 'tipo', rotulo: 'Tipo (insumo ou composição)', chaves: [/^tipo$/, /^classe$/, /^natureza$/] },
];

const normalizar = (v) => semAcento(String(v ?? '').replace(/\s+/g, ' ').trim()).replace(/[º°ª]/g, 'o');

/** Linha totalmente vazia. */
const vazia = (linha) => !linha || linha.every((c) => c === null || c === undefined || String(c).trim() === '');

/** Pontos de uma linha como cabeçalho: quantos campos ela nomeia. */
function pontosDeCabecalho(linha) {
  const achados = new Set();
  for (const celula of linha ?? []) {
    const t = normalizar(celula);
    if (!t || t.length > 60) continue;
    for (const c of CAMPOS) if (c.chaves.some((r) => r.test(t))) achados.add(c.campo);
  }
  return achados;
}

/** Índice da linha de cabeçalho nas primeiras 40 linhas (ou -1 se não achar). */
export function acharCabecalho(linhas) {
  let melhor = -1;
  let maior = 0;
  for (let i = 0; i < Math.min(linhas.length, 40); i++) {
    const achados = pontosDeCabecalho(linhas[i]);
    if (!achados.has('descricao')) continue;
    if (achados.size > maior) {
      maior = achados.size;
      melhor = i;
    }
  }
  return maior >= 3 ? melhor : -1;
}

/**
 * Coluna de cada campo a partir do cabeçalho: { campo: índiceDaColuna }.
 * Com dois preços unitários (sem e com BDI), fica o "com BDI": é o que
 * multiplicado pela quantidade dá o total da planilha.
 */
export function mapearColunas(cabecalho) {
  const mapa = {};
  const precos = [];
  (cabecalho ?? []).forEach((celula, i) => {
    const t = normalizar(celula);
    if (!t) return;
    for (const c of CAMPOS) {
      if (!c.chaves.some((r) => r.test(t))) continue;
      if (c.campo === 'preco_unitario') {
        precos.push({ i, comBdi: /bdi/.test(t) && !/sem bdi|s\/ ?bdi/.test(t) });
        break;
      }
      // "total" não pode roubar a coluna do preço unitário ("preço unitário total"?)
      if (c.campo === 'total' && /unit/.test(t)) continue;
      if (mapa[c.campo] === undefined) mapa[c.campo] = i;
      break;
    }
  });
  if (precos.length) mapa.preco_unitario = (precos.find((p) => p.comBdi) ?? precos[0]).i;
  return mapa;
}

function numeroDe(celula) {
  if (celula === null || celula === undefined || celula === '') return null;
  if (typeof celula === 'number') return Number.isFinite(celula) ? celula : null;
  const n = lerNumero(celula);
  return Number.isFinite(n) ? n : null;
}

function textoDe(celula) {
  if (celula === null || celula === undefined) return '';
  if (typeof celula === 'number') return String(celula);
  return String(celula).replace(/\s+/g, ' ').trim();
}

const TOTAL = /^(sub ?total|total|valor total|total geral|total da etapa|total do item|custo total|soma|bdi\b)/;

function tipoDe(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  if (/insumo|material|mat\b/.test(t)) return 'material';
  if (/equip/.test(t)) return 'equipamento';
  if (/compos|servic|cpu|serv\b/.test(t)) return 'servico';
  return null;
}

// Sem coluna de tipo: insumo do SINAPI (código com zeros à esquerda, como
// 00004718) ou descrição com "insumo" vira material; o resto, serviço.
function tipoPeloItem(descricao, codigo, fonte) {
  if (/\binsumo\b/.test(normalizar(descricao))) return 'material';
  if (/sinapi/i.test(fonte) && /^0\d{4,}$/.test(codigo)) return 'material';
  return 'servico';
}

const arred2 = (v) => Math.round(v * 100) / 100;

/**
 * Interpreta as linhas abaixo do cabeçalho.
 * @returns {{ itens: object[], avisos: string[], resumo: object }}
 *   itens no formato de importar_orcamento (nivel, numero, codigo, fonte,
 *   descricao, unidade, quantidade, preco_unitario, total, tipo, linha)
 */
export function interpretarLinhas(linhas, inicio, mapa) {
  const itens = [];
  const avisos = [];
  const totaisDeclarados = [];
  const col = (linha, campo) => (mapa[campo] === undefined ? '' : linha[mapa[campo]]);

  for (let i = inicio; i < linhas.length; i++) {
    const linha = linhas[i] ?? [];
    if (vazia(linha)) continue;
    const descricao = textoDe(col(linha, 'descricao'));
    const numero = textoDe(col(linha, 'numero'));
    const quantidade = numeroDe(col(linha, 'quantidade'));
    const preco = numeroDe(col(linha, 'preco_unitario'));
    let total = numeroDe(col(linha, 'total'));
    const unidade = textoDe(col(linha, 'unidade'));
    const linhaPlanilha = i + 1;

    // Linhas de total servem só para conferir a soma.
    const rotulo = normalizar(descricao || numero);
    if (TOTAL.test(rotulo) && !unidade && quantidade === null) {
      if (total !== null && /geral|^total$|valor total|global/.test(rotulo)) totaisDeclarados.push(total);
      continue;
    }
    if (!descricao) {
      if (quantidade !== null || preco !== null) avisos.push(`Linha ${linhaPlanilha}: sem descrição, ignorada.`);
      continue;
    }

    const ehEtapa = !unidade && (quantidade === null || quantidade === 0) && (preco === null || preco === 0);
    if (ehEtapa) {
      itens.push({ linha: linhaPlanilha, nivel: 'etapa', numero: numero || null, descricao, total: null });
      continue;
    }

    if (total === null && quantidade !== null && preco !== null) total = arred2(quantidade * preco);
    if (quantidade === null) avisos.push(`Linha ${linhaPlanilha} (${numero || descricao.slice(0, 30)}): sem quantidade.`);
    if (preco === null && total === null) avisos.push(`Linha ${linhaPlanilha} (${numero || descricao.slice(0, 30)}): sem preço nem total.`);
    else if (quantidade !== null && preco !== null && total !== null) {
      const calculado = arred2(quantidade * preco);
      if (Math.abs(calculado - total) > Math.max(1, Math.abs(total) * 0.005)) {
        avisos.push(
          `Linha ${linhaPlanilha} (${numero || descricao.slice(0, 30)}): quantidade × preço dá ${calculado.toFixed(2)}, mas o total é ${total.toFixed(2)}.`,
        );
      }
    }

    itens.push({
      linha: linhaPlanilha,
      nivel: 'item',
      numero: numero || null,
      codigo: textoDe(col(linha, 'codigo')) || null,
      fonte: textoDe(col(linha, 'fonte')) || null,
      descricao,
      unidade: unidade || null,
      quantidade,
      preco_unitario: preco,
      total,
      tipo: tipoDe(col(linha, 'tipo')) ?? tipoPeloItem(descricao, textoDe(col(linha, 'codigo')), textoDe(col(linha, 'fonte'))),
    });
  }

  const soItens = itens.filter((x) => x.nivel === 'item');
  const total = arred2(soItens.reduce((s, x) => s + (x.total ?? 0), 0));
  const totalDeclarado = totaisDeclarados.length ? totaisDeclarados[totaisDeclarados.length - 1] : null;
  if (totalDeclarado !== null && Math.abs(totalDeclarado - total) > Math.max(1, totalDeclarado * 0.005)) {
    avisos.push(
      `A soma dos itens (${total.toFixed(2)}) não confere com o total da planilha (${totalDeclarado.toFixed(2)}). ` +
        'Confira se o BDI está em linha separada ou se alguma linha ficou de fora.',
    );
  }
  if (!soItens.length) avisos.push('Nenhum item com quantidade e preço foi encontrado. Confira a escolha das colunas.');

  return {
    itens,
    avisos,
    resumo: {
      etapas: itens.length - soItens.length,
      itens: soItens.length,
      total,
      totalDeclarado,
    },
  };
}

/** Tudo de uma vez: linhas de uma aba -> cabeçalho, colunas e itens. */
export function lerPlanilha(linhas, mapaManual = null, cabecalhoManual = null) {
  const cabecalho = cabecalhoManual ?? acharCabecalho(linhas);
  if (cabecalho < 0) {
    return {
      cabecalho,
      mapa: {},
      itens: [],
      avisos: ['Não achei a linha de cabeçalho (Item, Descrição, Unidade, Quantidade...). Escolha as colunas à mão.'],
      resumo: { etapas: 0, itens: 0, total: 0, totalDeclarado: null },
    };
  }
  const mapa = mapaManual ?? mapearColunas(linhas[cabecalho]);
  return { cabecalho, mapa, ...interpretarLinhas(linhas, cabecalho + 1, mapa) };
}

/**
 * Profundidade pela numeração: '1' -> 1, '1.2' -> 2, '1.2.3' -> 3 (sem número: 1).
 * Zeros no fim não contam: etapa '1.0' é do mesmo nível que '1'.
 */
export function profundidade(numero) {
  if (!numero) return 1;
  const partes = String(numero).trim().split('.').filter(Boolean);
  while (partes.length > 1 && /^0+$/.test(partes[partes.length - 1])) partes.pop();
  return partes.length || 1;
}

/**
 * Planilha pronta para mostrar e exportar: itens removidos saem, cada etapa
 * ganha o subtotal (soma dos itens até a próxima etapa do mesmo nível ou
 * acima, então etapa que tem subetapas soma as subetapas) e cada linha ganha
 * a profundidade. Devolve { linhas, total, etapas, itens }.
 */
export function estruturar(itens) {
  const linhas = (itens ?? [])
    .filter((x) => !x.removido)
    .map((x) => ({ ...x, profundidade: profundidade(x.numero), subtotal: null }));
  const abertas = []; // pilha de etapas
  const fechar = (nivel) => {
    while (abertas.length && abertas[abertas.length - 1].profundidade >= nivel) abertas.pop();
  };
  let total = 0;
  for (const x of linhas) {
    if (x.nivel === 'etapa') {
      fechar(x.profundidade);
      x.subtotal = 0;
      abertas.push(x);
    } else {
      // item sem numeração fica dentro da última etapa aberta
      if (!x.numero) x.profundidade = (abertas[abertas.length - 1]?.profundidade ?? 0) + 1;
      fechar(x.profundidade); // "2.2" encerra a subetapa "2.1", mas não a etapa "2"
      const v = Number(x.total ?? 0);
      total += v;
      for (const e of abertas) e.subtotal = arred2(e.subtotal + v);
    }
  }
  return {
    linhas,
    total: arred2(total),
    etapas: linhas.filter((x) => x.nivel === 'etapa').length,
    itens: linhas.filter((x) => x.nivel === 'item').length,
  };
}
