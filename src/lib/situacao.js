// Regra de situação da obra.
// Função única, usada pelo mapa, pela lista e pelo relatório. Nunca digitada.
//
// Ordem de avaliação:
//   1. executado = 100                         -> Concluída
//   2. marcada como paralisada                 -> Paralisada
//   3. hoje < início                           -> Não iniciada
//   4. hoje > término vigente                  -> Atrasada (prazo vencido)
//   5. prazo decorrido - executado > tolerância -> Atrasada (desvio)
//   6. demais casos                            -> Em dia
//
// Datas são tratadas como dias de calendário no fuso de Imperatriz
// (America/Fortaleza, UTC-3), nunca como instantes UTC.

// Paleta validada para contraste e para daltonismo (vermelho x verde).
// hex: cor cheia (pinos, barras, bordas); fundo/texto: selo claro com texto escuro.
export const SITUACOES = {
  atrasada:     { codigo: 'atrasada',     rotulo: 'Atrasada',     hex: '#B91C1C', fundo: '#FEE2E2', texto: '#7F1D1D', simbolo: '!', ordem: 1 },
  paralisada:   { codigo: 'paralisada',   rotulo: 'Paralisada',   hex: '#D97706', fundo: '#FEF3C7', texto: '#78350F', simbolo: '❚❚', ordem: 2 },
  em_dia:       { codigo: 'em_dia',       rotulo: 'Em dia',       hex: '#0F9D7A', fundo: '#D1FAE5', texto: '#064E3B', simbolo: '●', ordem: 3 },
  nao_iniciada: { codigo: 'nao_iniciada', rotulo: 'Não iniciada', hex: '#6B7280', fundo: '#E5E7EB', texto: '#374151', simbolo: '○', ordem: 4 },
  concluida:    { codigo: 'concluida',    rotulo: 'Concluída',    hex: '#1D6FB8', fundo: '#DBEAFE', texto: '#1E3A5F', simbolo: '✓', ordem: 5 },
};

export const LISTA_SITUACOES = Object.values(SITUACOES).sort((a, b) => a.ordem - b.ordem);

const MS_DIA = 86_400_000;
const FUSO = 'America/Fortaleza';
const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** 'AAAA-MM-DD' de um instante, no fuso de Imperatriz. */
export function diaEmImperatriz(instante = new Date()) {
  return formatoDia.format(instante instanceof Date ? instante : new Date(instante));
}

/** Hoje em Imperatriz, 'AAAA-MM-DD'. */
export const hojeEmImperatriz = () => diaEmImperatriz(new Date());

/** 'AAAA-MM-DD' -> número de dias desde 1970-01-01 (sem fuso). */
export function numeroDoDia(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(a, m - 1, d) / MS_DIA;
}

export const diasEntre = (de, ate) => numeroDoDia(ate) - numeroDoDia(de);

/** Percentual do prazo já decorrido, de 0 a 100. */
export function prazoDecorrido(inicio, termino, hoje) {
  const i = numeroDoDia(inicio);
  const t = numeroDoDia(termino);
  const h = numeroDoDia(hoje);
  if (h <= i) return 0;
  if (t <= i) return 100; // datas iguais ou invertidas: prazo inteiro já corrido
  return Math.min(Math.max((h - i) / (t - i), 0), 1) * 100;
}

/**
 * De quando conta o "sem atualização": o mais recente entre o último
 * lançamento (ou o cadastro, se nunca houve), o início da obra e a última
 * retomada. Antes de começar, ou enquanto parada, não há o que lançar.
 * Retorna { desde: 'lancamento' | 'cadastro' | 'inicio' | 'retomada', dia } ou null.
 */
function referenciaDeAtualizacao(obra) {
  const opcoes = [];
  const marco = obra.ultima_atualizacao_em ?? obra.criado_em;
  if (marco) {
    opcoes.push({ desde: obra.ultima_atualizacao_em ? 'lancamento' : 'cadastro', dia: numeroDoDia(diaEmImperatriz(marco)) });
  }
  if (obra.data_inicio) opcoes.push({ desde: 'inicio', dia: numeroDoDia(obra.data_inicio) });
  if (obra.ultima_retomada) opcoes.push({ desde: 'retomada', dia: numeroDoDia(obra.ultima_retomada) });
  return opcoes.reduce((a, b) => (b.dia > a.dia ? b : a), opcoes[0] ?? null);
}

const DESDE = {
  lancamento: '',
  cadastro: ' desde o cadastro,',
  inicio: ' desde o início da obra,',
  retomada: ' desde a retomada,',
};

/** 'Sem atualização desde o cadastro, há 12 dias' (texto do alerta). */
export const textoSemAtualizacao = (s) => `Sem atualização${DESDE[s.atualizacaoDesde] ?? ''} há ${s.diasSemAtualizacao} dias`;

/**
 * @param obra  linha de obras_painel
 * @param opts  { hoje: 'AAAA-MM-DD', tolerancia: pontos, diasAlerta: dias }
 */
export function calcularSituacao(obra, { hoje = hojeEmImperatriz(), tolerancia = 10, diasAlerta = 10 } = {}) {
  const executado = Number(obra.percentual_executado ?? 0);
  const prazo = prazoDecorrido(obra.data_inicio, obra.data_termino_prevista, hoje);
  // Desvio com 2 casas, a mesma precisão do percentual e da tolerância: o que a
  // tela mostra é o que se compara (sem 10,000000000000007 > 10 por arredondamento).
  const desvio = Math.round((prazo - executado) * 100) / 100;
  const h = numeroDoDia(hoje);

  let codigo;
  let motivoAtraso = null;
  if (executado >= 100) {
    codigo = 'concluida';
  } else if (obra.paralisada) {
    codigo = 'paralisada';
  } else if (h < numeroDoDia(obra.data_inicio)) {
    codigo = 'nao_iniciada';
  } else if (h > numeroDoDia(obra.data_termino_prevista)) {
    codigo = 'atrasada';
    motivoAtraso = 'prazo_vencido';
  } else if (desvio > Number(tolerancia)) {
    codigo = 'atrasada';
    motivoAtraso = 'desvio';
  } else {
    codigo = 'em_dia';
  }

  // Alerta de falta de atualização: só faz sentido em obra que está andando.
  // Obra concluída, paralisada ou não iniciada não tem o que lançar.
  const referencia = referenciaDeAtualizacao(obra);
  const diasSemAtualizacao = referencia ? h - referencia.dia : null;
  const alertaSemAtualizacao =
    (codigo === 'em_dia' || codigo === 'atrasada') &&
    diasSemAtualizacao !== null &&
    diasSemAtualizacao > Number(diasAlerta);

  const diasParaTermino = numeroDoDia(obra.data_termino_prevista) - h;

  return {
    ...SITUACOES[codigo],
    motivoAtraso,
    prazoDecorrido: prazo,
    executado,
    desvio,
    diasSemAtualizacao, // para o alerta (conta do marco mais recente)
    atualizacaoDesde: referencia?.desde ?? null,
    // dias desde o último lançamento de fato (null se nunca houve)
    diasDesdeLancamento: obra.ultima_atualizacao_em ? h - numeroDoDia(diaEmImperatriz(obra.ultima_atualizacao_em)) : null,
    nuncaAtualizada: !obra.ultima_atualizacao_em,
    alertaSemAtualizacao,
    diasParaTermino,
  };
}

/** Ordem do relatório: atrasadas primeiro (maior desvio no topo), depois as demais. */
export function compararParaRelatorio(a, b) {
  return (
    a.situacao.ordem - b.situacao.ordem ||
    b.situacao.desvio - a.situacao.desvio ||
    a.nome.localeCompare(b.nome, 'pt-BR')
  );
}
