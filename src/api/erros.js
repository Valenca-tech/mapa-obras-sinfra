// Traduz erros do banco (Supabase ou PGlite) e da rede para mensagens ao usuário.
// Regra: nunca mostrar texto técnico ou em inglês; o original vai para o console.

const RESTRICOES = {
  obras_termino_apos_inicio: 'O término previsto deve ser posterior ao início.',
  obras_original_apos_inicio: 'O início não pode ser posterior ao término original do contrato.',
  obras_nome_obrigatorio: 'Informe o nome da obra.',
  obras_valor_nao_negativo: 'O valor do contrato não pode ser negativo.',
  obras_latitude_valida: 'Localização inválida. Marque o ponto no mapa.',
  obras_longitude_valida: 'Localização inválida. Marque o ponto no mapa.',
  atualizacoes_percentual_valido: 'O percentual deve estar entre 0 e 100.',
  configuracao_tolerancia_valida: 'A tolerância deve estar entre 0 e 100 pontos.',
  configuracao_dias_validos: 'O prazo do alerta deve ser de pelo menos 1 dia.',
  obras_instalacao_id_fkey: 'A instalação escolhida não existe mais. Escolha outra.',
  obras_tipo_fkey: 'Tipo de obra inválido. Escolha um tipo da lista.',
  obras_datas_plausiveis: 'Data fora do intervalo aceito (anos 2000 a 2099). Confira o ano.',
  documentos_datas_plausiveis: 'Data do documento fora do intervalo aceito (anos 2000 a 2099). Confira o ano.',
  documentos_tipo_fkey: 'Tipo de documento inválido. Escolha um tipo da lista.',
  eventos_data_plausivel: 'Data fora do intervalo aceito (anos 2000 a 2099). Confira o ano.',
  atualizacoes_obra_momento_unico: 'A mesma obra apareceu duas vezes no lançamento. Recarregue a página e lance de novo.',
  atualizacoes_obra_id_fkey: 'Obra não encontrada. Recarregue a página.',
  instalacoes_nome_obrigatorio: 'Informe o nome da instalação.',
  instalacoes_latitude_valida: 'Localização inválida. Marque o ponto no mapa.',
  instalacoes_longitude_valida: 'Localização inválida. Marque o ponto no mapa.',
  instalacoes_tipo_fkey: 'Tipo de instalação inválido. Escolha um tipo da lista.',
};

// Falha de rede: Chrome ("Failed to fetch"), Firefox ("NetworkError"),
// Safari/iPhone ("Load failed", "network connection was lost", "offline").
const REDE = /Failed to fetch|NetworkError|Load failed|network connection was lost|appears to be offline|fetch failed|ERR_INTERNET_DISCONNECTED|timed? ?out|AbortError/i;

export const MSG_REDE = 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
export const MSG_SESSAO = 'Sua sessão terminou. Entre de novo.';

/** A falha foi de rede (o pedido pode ou não ter chegado ao servidor)? */
export function ehErroDeRede(erro) {
  if (!erro) return false;
  if (erro.code === 'REDE') return true;
  const msg = `${erro.message ?? ''} ${erro.details ?? ''}`;
  return REDE.test(msg) || (erro.status === 0 && !erro.code);
}

export function mensagemDeErro(erro) {
  const msg = erro?.message ?? String(erro ?? '');
  const codigo = erro?.code;
  const status = erro?.status;

  if (codigo === 'P0001' || codigo === 'P0002') return msg; // mensagens escritas no banco, já em português
  if (codigo === 'SESSAO' || /JWT expired|invalid JWT|refresh_token_not_found|session_not_found/i.test(msg)) return MSG_SESSAO;
  if (codigo === 'REDE' || ehErroDeRede(erro)) return MSG_REDE;
  if (codigo === '42501' || /permission denied|row-level security|Sem permissão/i.test(msg)) {
    return 'Você não tem permissão para esta ação.';
  }
  for (const [nome, texto] of Object.entries(RESTRICOES)) {
    if (msg.includes(nome)) return texto;
  }
  if (/Invalid login credentials|senha incorretos/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email.?not.?confirmed/i.test(msg) || codigo === 'email_not_confirmed') {
    return 'Este e-mail ainda não foi confirmado. Procure a Concretta Jr.';
  }
  if (status === 429 || codigo === 'over_request_rate_limit' || /rate limit|too many requests/i.test(msg)) {
    return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
  }
  if (codigo === 'PGRST002' || status === 503 || status === 502 || status === 504) {
    return 'O servidor está iniciando ou ocupado. Aguarde alguns segundos e tente de novo.';
  }
  if (
    /invalid input syntax for type|date\/time field value out of range|out of range for type date/i.test(msg) ||
    ['22P02', '22007', '22008'].includes(codigo)
  ) {
    return 'Algum campo tem valor em formato inválido. Confira datas e números.';
  }
  if (codigo === '22003' || /numeric field overflow|out of range/i.test(msg)) {
    return 'Número grande demais. Confira o valor digitado.';
  }
  if (codigo === '23505') return 'Este registro já existe.';
  // Qualquer outra coisa: mensagem genérica; o detalhe técnico fica no console.
  console.error('Erro sem tradução:', erro);
  return 'Não foi possível concluir. Tente de novo; se continuar, avise a Concretta Jr.';
}

export class ErroAcao extends Error {
  constructor(mensagem, codigo) {
    super(mensagem);
    this.code = codigo;
  }
}
