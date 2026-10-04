// Conteúdo dos documentos oficiais da Central de Obras, sem formato:
// o mesmo modelo vira PDF (pdf.js), Word (word.js) e, na planilha, Excel
// (excel.js).
//
// Dois passos:
//   1. retrato(): no momento da emissão, copia tudo o que o documento usa
//      (obra, contrato, órgão, assinaturas, planilha, campos do formulário).
//      O retrato fica guardado em documentos_gerados.dados: baixar de novo,
//      meses depois, sai igual ao que foi assinado, mesmo que a obra mude.
//   2. montarDocumento(): do retrato e do número oficial, monta o modelo
//      (título, blocos de texto, tabelas, assinaturas e papel timbrado).
//
// Padrão seguido (o Município não publica manual próprio de papel timbrado):
// brasão e as três linhas ESTADO / PREFEITURA / SECRETARIA no cabeçalho,
// endereço e CNPJ no rodapé, número "Nº 001/2026-SINFRA", local e data por
// extenso ("Imperatriz-MA, 4 de outubro de 2026.") e bloco de assinatura com
// nome, cargo, matrícula e, para o engenheiro, título e registro no CREA
// (Lei 5.194/1966, art. 14), como nos documentos da Prefeitura e no Manual
// de Redação da Presidência da República.
//
// Funções puras, testadas no Node.
import { data, reais } from '../formato.js';
import { reaisPorExtenso, percentualPorExtenso, dataPorExtenso, numeroOficial } from '../extenso.js';
import { estruturar } from '../planilha.js';

export const TIPOS_DOCUMENTO = {
  declaracao_andamento: {
    nome: 'Declaração de andamento',
    titulo: 'DECLARAÇÃO',
    descricao: 'Declara a situação da obra (em execução, paralisada ou concluída) e o percentual executado.',
    arquivo: 'Declaracao_andamento',
  },
  atestado_capacidade: {
    nome: 'Atestado de capacidade técnica',
    titulo: 'ATESTADO DE CAPACIDADE TÉCNICA',
    descricao: 'Atesta à empresa os serviços executados, com quantidades, responsável técnico e ART.',
    arquivo: 'Atestado_capacidade_tecnica',
  },
  ficha_tecnica: {
    nome: 'Ficha técnica da obra',
    titulo: 'FICHA TÉCNICA DA OBRA',
    descricao: 'Resumo da obra: identificação, contrato, prazos, aditivos, execução e etapas da planilha.',
    arquivo: 'Ficha_tecnica',
  },
  planilha_servicos: {
    nome: 'Planilha de serviços e valores',
    titulo: 'PLANILHA DE SERVIÇOS E VALORES',
    descricao: 'Serviços, etapas, materiais, quantidades e valores da planilha do contrato.',
    arquivo: 'Planilha_servicos',
  },
};

export const FILTROS_PLANILHA = {
  todos: 'Todos os itens',
  servico: 'Somente serviços',
  material: 'Somente materiais',
  equipamento: 'Somente equipamentos',
};

const SITE = 'www.imperatriz.ma.gov.br';
const AVALIACAO_PADRAO =
  'de forma satisfatória, em conformidade com as especificações técnicas e o contrato, ' +
  'nada constando em nossos registros que desabone a conduta técnica da empresa';

// ---------------------------------------------------------------- 1. retrato

const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Tudo o que o documento usa, copiado no momento da emissão.
 * @param o.obra        linha de obras_painel com .situacao (calcularSituacao)
 * @param o.config      linha de configuracao
 * @param o.historico   { eventos } de api.historico (aditivos e paralisações)
 * @param o.planilha    { orcamento, itens } de api.obterOrcamento, ou null
 * @param o.campos      campos do formulário de emissão
 * @param o.tipoObra    nome do tipo da obra
 * @param o.instalacao  nome da instalação atendida, ou null
 * @param o.extensao    extensão do trecho já formatada, ou null
 * @param o.hoje        'AAAA-MM-DD'
 */
export function retrato({ tipo, obra, config, historico, planilha, campos = {}, tipoObra, instalacao, extensao, hoje }) {
  const eventos = historico?.eventos ?? [];
  const r = {
    versao: 1,
    tipo,
    emitido_em: hoje,
    orgao: {
      nome: texto(config.orgao_nome) || 'Secretaria Municipal de Infraestrutura e Serviços Públicos',
      sigla: texto(config.orgao_sigla) || 'SINFRA',
      endereco: texto(config.orgao_endereco),
      telefone: texto(config.orgao_telefone),
      email: texto(config.orgao_email),
      cnpj: texto(config.prefeitura_cnpj),
    },
    secretario: {
      nome: texto(config.secretario_nome),
      cargo: texto(config.secretario_cargo) || 'Secretário Municipal de Infraestrutura e Serviços Públicos',
      matricula: texto(config.secretario_matricula),
      ato: texto(config.secretario_ato),
    },
    obra: {
      id: obra.id,
      nome: texto(obra.nome),
      tipo: texto(tipoObra),
      bairro: texto(obra.bairro),
      empresa: texto(obra.empresa),
      empresa_cnpj: texto(obra.empresa_cnpj),
      numero_contrato: texto(obra.numero_contrato),
      numero_processo: texto(obra.numero_processo),
      valor_contrato: obra.valor_contrato === null || obra.valor_contrato === undefined ? null : Number(obra.valor_contrato),
      data_inicio: obra.data_inicio,
      data_termino_original: obra.data_termino_original,
      data_termino_prevista: obra.data_termino_prevista,
      percentual_executado: Number(obra.percentual_executado ?? 0),
      ultima_atualizacao: obra.ultima_atualizacao_em ? String(obra.ultima_atualizacao_em).slice(0, 10) : null,
      situacao: { codigo: obra.situacao?.codigo ?? '', rotulo: obra.situacao?.rotulo ?? '' },
      prazo_decorrido: obra.situacao?.prazoDecorrido ?? null,
      paralisada: !!obra.paralisada,
      paralisada_desde: obra.paralisada_desde ?? null,
      motivo_paralisacao: texto(obra.motivo_paralisacao),
      latitude: obra.latitude,
      longitude: obra.longitude,
      instalacao: instalacao || null,
      extensao: extensao || null,
      fiscal: {
        nome: texto(obra.fiscal_responsavel),
        titulo: texto(obra.fiscal_titulo),
        registro: texto(obra.fiscal_registro),
        matricula: texto(obra.fiscal_matricula),
      },
      aditivos: eventos
        .filter((e) => e.tipo === 'aditivo_prazo')
        .map((e) => ({
          data: e.data_evento,
          de: e.dados?.termino_anterior ?? null,
          para: e.dados?.termino_novo ?? null,
          documento: descreverDocumento(e.documento),
        }))
        .sort((a, b) => String(a.data).localeCompare(String(b.data))),
      paralisacoes: eventos
        .filter((e) => e.tipo === 'paralisacao' || e.tipo === 'retomada')
        .map((e) => ({ tipo: e.tipo, data: e.data_evento, descricao: texto(e.descricao), documento: descreverDocumento(e.documento) }))
        .sort((a, b) => String(a.data).localeCompare(String(b.data))),
    },
    planilha: null,
    campos: { ...campos },
  };
  if (planilha?.orcamento && (tipo === 'planilha_servicos' || tipo === 'ficha_tecnica')) {
    const est = estruturar(planilha.itens);
    r.planilha = {
      descricao: texto(planilha.orcamento.descricao),
      data_base: texto(planilha.orcamento.data_base),
      bdi_percentual: planilha.orcamento.bdi_percentual === null ? null : Number(planilha.orcamento.bdi_percentual),
      total: est.total,
      // a ficha técnica só usa as etapas
      linhas: est.linhas
        .filter((x) => tipo === 'planilha_servicos' || (x.nivel === 'etapa' && x.profundidade === 1))
        .map((x) => ({
          nivel: x.nivel,
          numero: x.numero,
          codigo: x.codigo ?? null,
          fonte: x.fonte ?? null,
          descricao: x.descricao,
          unidade: x.unidade ?? null,
          quantidade: x.quantidade === null || x.quantidade === undefined ? null : Number(x.quantidade),
          preco_unitario: x.preco_unitario === null || x.preco_unitario === undefined ? null : Number(x.preco_unitario),
          total: x.total === null || x.total === undefined ? null : Number(x.total),
          tipo: x.tipo ?? null,
          subtotal: x.subtotal,
        })),
    };
  }
  return r;
}

function descreverDocumento(d) {
  if (!d) return '';
  return [d.numero && `nº ${d.numero}`, d.numero_protocolo && `protocolo ${d.numero_protocolo}`].filter(Boolean).join(', ');
}

// ---------------------------------------------------------------- 2. modelo

/** Texto com **negrito** -> trechos [{ t, b }]. */
export function trechos(s) {
  const lista = String(s)
    .split('**')
    .map((t, i) => ({ t, b: i % 2 === 1 }))
    .filter((x) => x.t);
  // Pontuação logo depois do negrito vai junto com ele: na justificação, o
  // PDF trata a troca de trecho como espaço ("Imperatriz ,").
  for (let i = 1; i < lista.length; i++) {
    const m = lista[i].t.match(/^[,.;:)]+/);
    if (m && lista[i - 1].b) {
      lista[i - 1].t += m[0];
      lista[i].t = lista[i].t.slice(m[0].length);
    }
  }
  return lista.filter((x) => x.t);
}

const par = (s, opcoes = {}) => ({ tipo: 'paragrafo', trechos: trechos(s), ...opcoes });
const secao = (s) => ({ tipo: 'secao', texto: s });
const moeda = (v) => (v === null || v === undefined ? null : { n: Number(v), fmt: 'moeda' });
const quant = (v) => (v === null || v === undefined ? null : { n: Number(v), fmt: 'quant' });

/** Número no padrão brasileiro com as casas pedidas (no máximo). */
export function numeroBr(v, maxCasas = 2, minCasas = 0) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: minCasas, maximumFractionDigits: maxCasas }).format(Number(v));
}

/** Célula da tabela como texto (PDF e Word; o Excel usa o número). */
export function textoCelula(c) {
  if (c === null || c === undefined) return '';
  if (typeof c !== 'object') return String(c);
  if (c.fmt === 'moeda') return numeroBr(c.n, 2, 2);
  if (c.fmt === 'quant') return numeroBr(c.n, 4, 2);
  return String(c.n);
}

const valorComExtenso = (v) => `${reais(v)} (${reaisPorExtenso(v)})`;

function frasesDaObra(o, { comValor = true } = {}) {
  let s = `a obra **${o.nome}**`;
  if (o.bairro) s += `, no bairro ${o.bairro}`;
  s += ', neste Município';
  if (o.numero_contrato) {
    s += `, objeto do Contrato nº ${o.numero_contrato}`;
    if (o.numero_processo) s += ` (Processo Administrativo nº ${o.numero_processo})`;
  } else if (o.numero_processo) s += `, objeto do Processo Administrativo nº ${o.numero_processo}`;
  if (comValor && o.valor_contrato) s += `, no valor de ${valorComExtenso(o.valor_contrato)}`;
  return s;
}

const empresaComCnpj = (o, cnpj = o.empresa_cnpj) =>
  `**${o.empresa || 'empresa contratada'}**${cnpj ? `, inscrita no CNPJ sob o nº ${cnpj}` : ''}`;

function situacaoNaData(o) {
  const executado = percentualPorExtenso(o.percentual_executado);
  const registro = o.ultima_atualizacao ? `, conforme registro da fiscalização em ${data(o.ultima_atualizacao)}` : '';
  switch (o.situacao.codigo) {
    case 'concluida':
      return `teve sua execução concluída, com ${percentualPorExtenso(100)} dos serviços executados${registro}`;
    case 'paralisada':
      return `encontra-se paralisada desde ${data(o.paralisada_desde)}, com ${executado} dos serviços executados até a paralisação`;
    case 'nao_iniciada':
      return `tem o início da execução previsto para ${data(o.data_inicio)}`;
    default:
      return `encontra-se em execução, com ${executado} dos serviços executados${registro}`;
  }
}

function frasePrazo(o) {
  const n = o.aditivos.length;
  const aditivo = o.data_termino_prevista !== o.data_termino_original
    ? `, conforme ${n > 1 ? `${n} termos aditivos` : 'termo aditivo'} de prazo (término original: ${data(o.data_termino_original)})`
    : '';
  const inicio = o.situacao.codigo === 'nao_iniciada' ? 'tem início previsto para' : 'teve início em';
  return `O prazo de execução ${inicio} ${data(o.data_inicio)}, com término previsto para ${data(o.data_termino_prevista)}${aditivo}.`;
}

function assinaturas(r) {
  const lista = [];
  const s = r.secretario;
  lista.push({
    nome: s.nome || '(nome do secretário: preencher em Configuração)',
    linhas: [s.cargo, s.ato, s.matricula && `Matrícula nº ${s.matricula}`].filter(Boolean),
  });
  const f = r.obra.fiscal;
  if (f.nome) {
    lista.push({
      nome: f.nome,
      linhas: [f.titulo, f.registro, f.matricula && `Matrícula nº ${f.matricula}`, 'Fiscal da obra'].filter(Boolean),
    });
  }
  return lista;
}

function timbre(r) {
  const o = r.orgao;
  const linha3 = [o.telefone && `Tel.: ${o.telefone}`, o.email, o.cnpj && `CNPJ: ${o.cnpj}`].filter(Boolean).join('   ');
  return {
    linhas: ['ESTADO DO MARANHÃO', 'PREFEITURA MUNICIPAL DE IMPERATRIZ', o.nome.toUpperCase()],
    rodape: [o.nome.toUpperCase(), o.endereco, linha3].filter(Boolean),
    site: SITE,
  };
}

const slug = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);

/**
 * Modelo do documento.
 * @param r       retrato (documentos_gerados.dados)
 * @param numero  número sequencial do tipo no ano
 * @param ano     ano da numeração
 */
export function montarDocumento(r, { numero, ano }) {
  const tipo = TIPOS_DOCUMENTO[r.tipo];
  if (!tipo) throw new Error(`Tipo de documento desconhecido: ${r.tipo}`);
  // sem número: prévia para conferir antes de emitir (não vale como documento)
  const previa = numero === null || numero === undefined;
  const numeroTexto = previa ? 'PREVIA' : numeroOficial(numero, ano, r.orgao.sigla);
  const corpo = MONTADORES[r.tipo](r);
  return {
    tipo: r.tipo,
    previa,
    titulo: corpo.titulo ?? tipo.titulo,
    numero: previa ? 'PRÉVIA PARA CONFERÊNCIA, SEM NÚMERO E SEM VALOR DE DOCUMENTO' : `Nº ${numeroTexto}`,
    paisagem: !!corpo.paisagem,
    timbre: timbre(r),
    blocos: corpo.blocos,
    fecho: `Imperatriz-MA, ${dataPorExtenso(r.emitido_em)}.`,
    assinaturas: assinaturas(r),
    nomeArquivo: `${tipo.arquivo}_${numeroTexto.replace('/', '-')}_${slug(r.obra.nome)}`,
    // para a planilha em Excel
    planilha: corpo.planilha ?? null,
  };
}

// ---------------------------------------------------------------- cada documento

const MONTADORES = {
  declaracao_andamento(r) {
    const o = r.obra;
    const c = r.campos;
    const blocos = [];
    let p1 = `Declaramos, para os devidos fins, que ${frasesDaObra(o)}`;
    if (o.empresa) p1 += `, contratada com a empresa ${empresaComCnpj(o)}`;
    p1 += `, ${situacaoNaData(o)}.`;
    blocos.push(par(p1, { recuo: true }));
    blocos.push(par(frasePrazo(o), { recuo: true }));
    if (o.situacao.codigo === 'paralisada' && o.motivo_paralisacao) {
      blocos.push(par(`Motivo da paralisação: ${o.motivo_paralisacao}`, { recuo: true }));
    }
    const solicitante = texto(c.solicitante);
    const finalidade = texto(c.finalidade);
    if (solicitante || finalidade) {
      blocos.push(par(
        `Esta declaração é emitida${solicitante ? ` a pedido de ${solicitante}` : ''}${finalidade ? `${solicitante ? ',' : ''} para fins de ${finalidade}` : ''}.`,
        { recuo: true },
      ));
    }
    if (texto(c.observacao)) blocos.push(par(texto(c.observacao), { recuo: true }));
    blocos.push(par('Por ser expressão da verdade, firmamos a presente declaração.', { recuo: true }));
    return { blocos };
  },

  atestado_capacidade(r) {
    const o = r.obra;
    const c = r.campos;
    const parcial = !!c.parcial;
    const inicio = c.periodo_inicio || o.data_inicio;
    const fim = c.periodo_fim;
    const blocos = [];
    const verbo = parcial ? 'vem executando' : 'executou';
    const periodo = parcial
      ? `desde ${data(inicio)}`
      : `no período de ${data(inicio)} a ${data(fim)}`;
    blocos.push(par(
      `Atestamos, para os devidos fins, que a empresa ${empresaComCnpj(o, texto(c.empresa_cnpj) || o.empresa_cnpj)}, ` +
        `${verbo} para o Município de Imperatriz, por intermédio da ${r.orgao.nome} (${r.orgao.sigla}), ` +
        `${frasesDaObra(o)}, ${periodo}.`,
      { recuo: true },
    ));
    if (parcial) {
      blocos.push(par(
        `Até a data de emissão deste atestado, foram executados ${percentualPorExtenso(o.percentual_executado)} dos serviços contratados.`,
        { recuo: true },
      ));
    }
    const rt = texto(c.rt_nome);
    if (rt) {
      const partes = [rt, texto(c.rt_titulo), texto(c.rt_registro)].filter(Boolean).join(', ');
      const art = texto(c.art_numero);
      blocos.push(par(
        `Os serviços tiveram como responsável técnico ${partes}${art ? `, conforme Anotação de Responsabilidade Técnica (ART) nº ${art}` : ''}.`,
        { recuo: true },
      ));
    }
    const itens = (c.itens ?? []).filter((x) => x.quantidade !== null && x.quantidade !== '' && Number(x.quantidade) > 0);
    if (itens.length) {
      blocos.push(secao('SERVIÇOS EXECUTADOS'));
      blocos.push({
        tipo: 'tabela',
        colunas: [
          { titulo: 'Item', largura: 8, alinhar: 'esquerda' },
          { titulo: 'Descrição', largura: 62, alinhar: 'esquerda' },
          { titulo: 'Unid.', largura: 10, alinhar: 'centro' },
          { titulo: 'Quantidade', largura: 20, alinhar: 'direita' },
        ],
        linhas: itens.map((x) => ({ celulas: [x.numero ?? '', x.descricao, x.unidade ?? '', quant(x.quantidade)] })),
      });
    }
    blocos.push(par(`Atestamos, ainda, que os serviços foram executados ${texto(c.avaliacao) || AVALIACAO_PADRAO}.`, { recuo: true }));
    if (texto(c.observacao)) blocos.push(par(texto(c.observacao), { recuo: true }));
    return { blocos };
  },

  ficha_tecnica(r) {
    const o = r.obra;
    const blocos = [];
    const coord = o.latitude !== null && o.latitude !== undefined
      ? `${numeroBr(o.latitude, 5)}, ${numeroBr(o.longitude, 5)}` : '';
    blocos.push(secao('1. IDENTIFICAÇÃO'));
    blocos.push({
      tipo: 'dados',
      pares: [
        ['Obra', o.nome],
        ['Tipo', o.tipo],
        ['Bairro', o.bairro || 'não informado'],
        ['Localização (latitude, longitude)', coord],
        o.extensao && ['Extensão do trecho', o.extensao],
        o.instalacao && ['Instalação pública atendida', o.instalacao],
      ].filter(Boolean),
    });
    blocos.push(secao('2. CONTRATO'));
    const f = o.fiscal;
    blocos.push({
      tipo: 'dados',
      pares: [
        ['Empresa contratada', o.empresa || 'não informada'],
        o.empresa_cnpj && ['CNPJ da empresa', o.empresa_cnpj],
        ['Contrato nº', o.numero_contrato || 'não informado'],
        ['Processo administrativo nº', o.numero_processo || 'não informado'],
        ['Valor do contrato', o.valor_contrato ? valorComExtenso(o.valor_contrato) : 'não informado'],
        ['Fiscal da obra', [f.nome, f.titulo, f.registro].filter(Boolean).join(', ') || 'não informado'],
      ].filter(Boolean),
    });
    blocos.push(secao('3. PRAZOS'));
    const dias = Math.round((Date.parse(o.data_termino_prevista) - Date.parse(o.data_inicio)) / 86_400_000);
    const pares = [
      ['Início', data(o.data_inicio)],
      ['Término original', data(o.data_termino_original)],
      ['Término vigente', data(o.data_termino_prevista)],
      ['Prazo vigente', `${dias} dias`],
    ];
    if (o.prazo_decorrido !== null) pares.push(['Prazo decorrido na emissão', `${numeroBr(o.prazo_decorrido, 1)}%`]);
    o.aditivos.forEach((a, i) => pares.push([
      `${i + 1}º aditivo de prazo`,
      `${data(a.data)}: término de ${data(a.de)} para ${data(a.para)}${a.documento ? ` (${a.documento})` : ''}`,
    ]));
    o.paralisacoes.forEach((p) => pares.push([
      p.tipo === 'paralisacao' ? 'Paralisação' : 'Retomada',
      `${data(p.data)}${p.descricao ? `: ${p.descricao}` : ''}${p.documento ? ` (${p.documento})` : ''}`,
    ]));
    blocos.push({ tipo: 'dados', pares });
    blocos.push(secao('4. EXECUÇÃO FÍSICA'));
    blocos.push({
      tipo: 'dados',
      pares: [
        ['Situação na emissão', o.situacao.rotulo],
        ['Percentual executado', percentualPorExtenso(o.percentual_executado)],
        ['Último registro da fiscalização', o.ultima_atualizacao ? data(o.ultima_atualizacao) : 'nenhum'],
        o.paralisada && ['Paralisada desde', `${data(o.paralisada_desde)}${o.motivo_paralisacao ? `: ${o.motivo_paralisacao}` : ''}`],
      ].filter(Boolean),
    });
    const p = r.planilha;
    if (p) {
      blocos.push(secao('5. PLANILHA ORÇAMENTÁRIA: RESUMO POR ETAPA'));
      const extras = [p.descricao, p.data_base && `data-base ${p.data_base}`, p.bdi_percentual !== null && `BDI ${numeroBr(p.bdi_percentual, 2)}%`]
        .filter(Boolean).join('; ');
      if (extras) blocos.push(par(extras, { pequeno: true }));
      const etapas = p.linhas.filter((x) => x.nivel === 'etapa');
      blocos.push({
        tipo: 'tabela',
        colunas: [
          { titulo: 'Etapa', largura: 10, alinhar: 'esquerda' },
          { titulo: 'Descrição', largura: 55, alinhar: 'esquerda' },
          { titulo: 'Valor (R$)', largura: 22, alinhar: 'direita' },
          { titulo: '% do total', largura: 13, alinhar: 'direita' },
        ],
        linhas: [
          ...etapas.map((x) => ({
            celulas: [x.numero ?? '', x.descricao, moeda(x.subtotal), p.total ? `${numeroBr((x.subtotal / p.total) * 100, 2, 2)}%` : ''],
          })),
          { celulas: ['', 'TOTAL', moeda(p.total), '100,00%'], estilo: 'total' },
        ],
      });
      if (o.valor_contrato && Math.abs(p.total - o.valor_contrato) >= 0.01) {
        blocos.push(par(
          `Observação: a soma da planilha (${reais(p.total)}) difere do valor do contrato (${reais(o.valor_contrato)}).`,
          { pequeno: true },
        ));
      }
    }
    if (texto(r.campos.observacao)) {
      blocos.push(secao(p ? '6. OBSERVAÇÕES' : '5. OBSERVAÇÕES'));
      blocos.push(par(texto(r.campos.observacao)));
    }
    return { blocos };
  },

  planilha_servicos(r) {
    const o = r.obra;
    const p = r.planilha;
    const filtro = r.campos.filtro_tipo && r.campos.filtro_tipo !== 'todos' ? r.campos.filtro_tipo : null;
    const blocos = [];
    blocos.push({
      tipo: 'dados',
      pares: [
        ['Obra', `${o.nome}${o.bairro ? ` (${o.bairro})` : ''}`],
        ['Contrato', [o.numero_contrato && `nº ${o.numero_contrato}`, o.empresa].filter(Boolean).join(', ') || 'não informado'],
        p && ['Planilha', [p.descricao, p.data_base && `data-base ${p.data_base}`, p.bdi_percentual !== null && `BDI ${numeroBr(p.bdi_percentual, 2)}%`].filter(Boolean).join('; ')],
        filtro && ['Itens', FILTROS_PLANILHA[filtro]],
      ].filter(Boolean),
      compacto: true,
    });
    if (!p) {
      blocos.push(par('A obra não tem planilha de serviços importada.'));
      return { blocos, paisagem: true };
    }
    // Com filtro (ex.: só materiais): reestrutura para recalcular os subtotais
    // e tira as etapas que ficaram vazias.
    let linhas = p.linhas;
    let total = p.total;
    if (filtro) {
      const est = estruturar(p.linhas.filter((x) => x.nivel === 'etapa' || x.tipo === filtro));
      linhas = est.linhas.filter((x) => x.nivel === 'item' || x.subtotal > 0);
      total = est.total;
    }
    const tabela = linhas.map((x) =>
      x.nivel === 'etapa'
        ? { celulas: [x.numero ?? '', '', '', x.descricao, '', '', '', moeda(x.subtotal)], estilo: 'etapa' }
        : {
          celulas: [x.numero ?? '', x.codigo ?? '', x.fonte ?? '', x.descricao, x.unidade ?? '', quant(x.quantidade),
            moeda(x.preco_unitario), moeda(x.total)],
        });
    tabela.push({ celulas: ['', '', '', filtro ? 'TOTAL DOS ITENS LISTADOS' : 'TOTAL GERAL', '', '', '', moeda(total)], estilo: 'total' });
    const colunas = [
      { titulo: 'Item', largura: 6, alinhar: 'esquerda' },
      { titulo: 'Código', largura: 8, alinhar: 'esquerda' },
      { titulo: 'Fonte', largura: 7, alinhar: 'esquerda' },
      { titulo: 'Descrição', largura: 41, alinhar: 'esquerda' },
      { titulo: 'Unid.', largura: 6, alinhar: 'centro' },
      { titulo: 'Quant.', largura: 9, alinhar: 'direita' },
      { titulo: 'Preço unit. (R$)', largura: 11, alinhar: 'direita' },
      { titulo: 'Total (R$)', largura: 12, alinhar: 'direita' },
    ];
    blocos.push({ tipo: 'tabela', colunas, linhas: tabela, pequena: true, repetirCabecalho: true });
    blocos.push(par(`${filtro ? 'Total dos itens listados' : 'Valor total da planilha'}: **${valorComExtenso(total)}**.`));
    if (!filtro && o.valor_contrato && Math.abs(total - o.valor_contrato) >= 0.01) {
      blocos.push(par(`Observação: a soma da planilha difere do valor do contrato (${reais(o.valor_contrato)}).`, { pequeno: true }));
    }
    return {
      blocos,
      paisagem: true,
      planilha: { colunas, linhas: tabela },
    };
  },
};
