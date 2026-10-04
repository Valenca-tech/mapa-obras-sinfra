// Estado compartilhado entre as telas.
import { reactive, computed } from 'vue';
import { api } from './api/index.js';
import { ehErroDeRede } from './api/erros.js';
import { calcularSituacao, hojeEmImperatriz } from './lib/situacao.js';
import { semAcento } from './lib/texto.js';

function filtrosVazios() {
  return { situacao: '', tipo: '', bairro: '', busca: '', pendencia: false, alerta: false };
}

export const estado = reactive({
  pronto: false,
  sessao: null,
  perfil: null, // { nome, papel, permissoes[] }
  config: { tolerancia_atraso_pontos: 10, dias_sem_atualizacao_alerta: 10 },
  tiposObra: [],
  tiposDocumento: [],
  tiposInstalacao: [],
  obras: [],
  instalacoes: [], // instalações públicas ativas (camada do mapa)
  hoje: hojeEmImperatriz(),
  filtros: filtrosVazios(),
  mostrarInstalacoes: true, // camada de instalações públicas ligada no mapa
  obraAberta: null, // id da obra exibida na ficha
  acao: null, // { id, tipo, obra, evento } diálogo de ação aberto
  versao: 0, // incrementa a cada gravação, para as telas recarregarem
  aviso: null, // { texto, tipo }
  erroInicial: null,
  saindo: false, // "Sair" em andamento: a rota /entrar fica liberada
});

/** Atualiza o "hoje" (aba aberta de um dia para o outro). */
export function atualizarHoje() {
  const h = hojeEmImperatriz();
  if (h !== estado.hoje) estado.hoje = h;
}

// Cada abertura ganha um id: o App remonta o diálogo, mesmo que outro já
// estivesse aberto (dois cliques seguidos em "Completar" de linhas diferentes).
let seqAcao = 0;

/** Abre o diálogo de ação (paralisar, retomar, aditivo, arquivar, documento, lancar). */
export function abrirAcao(tipo, obra, evento = null) {
  atualizarHoje();
  estado.acao = { id: ++seqAcao, tipo, obra, evento };
}

/**
 * Depois de qualquer gravação: recarrega as obras e avisa as telas abertas.
 * Nunca lança erro: a gravação já aconteceu, e uma falha só na leitura
 * seguinte não pode parecer que nada foi salvo (o usuário repetiria).
 */
export async function aposGravar(mensagem) {
  let recarregou = true;
  try {
    await recarregarObras();
  } catch {
    recarregou = false;
  }
  estado.versao++;
  if (!recarregou) avisar(`${mensagem ?? 'Salvo.'} Não foi possível atualizar a tela; recarregue a página.`, 'erro');
  else if (mensagem) avisar(mensagem);
}

/**
 * Mensagem para erro numa gravação. Erro de rede não diz se o servidor
 * gravou ou não: avisa para conferir antes de repetir e recarrega a lista.
 */
export function mensagemDeFalhaAoGravar(e) {
  if (ehErroDeRede(e)) {
    recarregarObras().catch(() => {});
    return 'A conexão falhou e não foi possível confirmar se a gravação chegou ao servidor. Confira antes de repetir.';
  }
  return e?.message ?? String(e);
}

export const pode = (permissao) => !!estado.perfil?.permissoes?.includes(permissao);

export const ROTULO_PAPEL = {
  secretario: 'Secretário',
  admin: 'Gabinete',
  fiscal: 'Fiscal',
  leitura: 'Consulta',
};

export const nomeTipo = (codigo) => estado.tiposObra.find((t) => t.codigo === codigo)?.nome ?? codigo;
export const nomeTipoDocumento = (codigo) => estado.tiposDocumento.find((t) => t.codigo === codigo)?.nome ?? codigo;
export const nomeTipoInstalacao = (codigo) => estado.tiposInstalacao.find((t) => t.codigo === codigo)?.nome ?? codigo;
export const instalacaoPorId = (id) => (id ? estado.instalacoes.find((i) => i.id === id) ?? null : null);

/** Obras ativas com a situação calculada. */
export const obrasComSituacao = computed(() =>
  estado.obras.map((o) => ({
    ...o,
    situacao: calcularSituacao(o, {
      hoje: estado.hoje,
      tolerancia: estado.config.tolerancia_atraso_pontos,
      diasAlerta: estado.config.dias_sem_atualizacao_alerta,
    }),
  })),
);

/** Algum filtro ligado (o mapa e a lista mostram só parte das obras). */
export const filtroAtivo = computed(() => {
  const f = estado.filtros;
  return !!(f.situacao || f.tipo || f.bairro || f.busca.trim() || f.pendencia || f.alerta);
});

export const quantidadeDeFiltros = computed(() => {
  const f = estado.filtros;
  return [f.situacao, f.tipo, f.bairro, f.busca.trim(), f.pendencia, f.alerta].filter(Boolean).length;
});

export const limparFiltros = () => (estado.filtros = filtrosVazios());

/** Filtros de tipo, bairro, busca, pendência e alerta (sem o de situação: os totais usam esta lista). */
export const obrasFiltradasSemSituacao = computed(() => {
  const f = estado.filtros;
  const busca = semAcento(f.busca.trim());
  return obrasComSituacao.value.filter(
    (o) =>
      (!f.tipo || o.tipo === f.tipo) &&
      (!f.bairro || o.bairro === f.bairro) &&
      (!f.pendencia || o.pendencias_documentais > 0) &&
      (!f.alerta || o.situacao.alertaSemAtualizacao) &&
      (!busca || semAcento(`${o.nome} ${o.bairro} ${o.empresa} ${o.numero_contrato}`).includes(busca)),
  );
});

export const obrasFiltradas = computed(() =>
  obrasFiltradasSemSituacao.value.filter((o) => !estado.filtros.situacao || o.situacao.codigo === estado.filtros.situacao),
);

export const bairros = computed(() =>
  [...new Set(estado.obras.map((o) => o.bairro).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
);

export function totais(lista) {
  const t = { ativas: lista.length, valor: 0, alertas: 0, pendencias: 0 };
  for (const o of lista) {
    t[o.situacao.codigo] = (t[o.situacao.codigo] ?? 0) + 1;
    t.valor += Number(o.valor_contrato || 0);
    if (o.situacao.alertaSemAtualizacao) t.alertas++;
    if (o.pendencias_documentais > 0) t.pendencias++;
  }
  return t;
}

// ---------------------------------------------------------------- alterações não salvas

// Telas com formulário registram aqui se têm algo digitado e não salvo. O
// "Sair" e o fechamento da aba consultam antes de descartar.
const naoSalvos = new Map();

/** Registra (ou remove, com fn nula) a verificação de alterações não salvas de uma tela. */
export function registrarNaoSalvo(chave, fn) {
  if (fn) naoSalvos.set(chave, fn);
  else naoSalvos.delete(chave);
}

export const haAlteracoesNaoSalvas = () => [...naoSalvos.values()].some((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (ev) => {
    if (!haAlteracoesNaoSalvas()) return;
    ev.preventDefault();
    ev.returnValue = ''; // navegadores antigos
  });
}

// ---------------------------------------------------------------- carregamento

export async function carregarSessao() {
  estado.sessao = await api.sessao();
  estado.perfil = estado.sessao ? await api.meuPerfil() : null;
  if (!estado.perfil) estado.sessao = null;
  if (estado.sessao) await carregarDados();
}

export async function carregarDados() {
  const [config, tiposObra, tiposDocumento, tiposInstalacao] = await Promise.all([
    api.configuracao(),
    api.tiposObra(),
    api.tiposDocumento(),
    api.tiposInstalacao(),
  ]);
  estado.config = config;
  estado.tiposObra = tiposObra;
  estado.tiposDocumento = tiposDocumento;
  estado.tiposInstalacao = tiposInstalacao;
  await Promise.all([recarregarObras(), recarregarInstalacoes()]);
}

// Recargas concorrentes (montagem da tela e depois de gravar): vale a mais
// recente pedida, não a última a chegar (no 3G, uma resposta antiga chegando
// por último voltaria o percentual para o valor de antes).
let seqObras = 0;
let seqInstalacoes = 0;
let ultimaRecarga = 0;

export async function recarregarInstalacoes() {
  const n = ++seqInstalacoes;
  const lista = await api.listarInstalacoes();
  if (n === seqInstalacoes) estado.instalacoes = lista;
}

export async function recarregarObras() {
  atualizarHoje();
  ultimaRecarga = Date.now();
  const n = ++seqObras;
  const lista = await api.listarObras();
  if (n === seqObras) estado.obras = lista;
}

export async function entrar(email, senha) {
  await api.entrar(email, senha);
  await carregarSessao();
}

/** Encerra a sessão e limpa o estado. Quem chama já navegou para /entrar. */
export async function sair() {
  naoSalvos.clear();
  await api.sair();
  estado.sessao = null;
  estado.perfil = null;
  estado.obras = [];
  estado.instalacoes = [];
  estado.obraAberta = null;
  estado.acao = null;
  estado.filtros = filtrosVazios(); // o próximo usuário não herda filtros escondidos
}

/** Apaga os dados da demonstração e recarrega (só no modo demonstração). */
export async function reiniciarDemonstracao() {
  if (!confirm('Apagar tudo o que foi feito na demonstração e recarregar as 10 obras de exemplo?')) return;
  naoSalvos.clear();
  const ok = await api.reiniciarDemo();
  if (ok === false) {
    alert('Não foi possível reiniciar: a demonstração está aberta em outra aba ou janela. Feche as outras e tente de novo.');
  }
}

let temporizador;
export function avisar(texto, tipo = 'ok') {
  estado.aviso = { texto, tipo };
  clearTimeout(temporizador);
  temporizador = setTimeout(() => (estado.aviso = null), tipo === 'erro' ? 9000 : 3500);
}

// ---------------------------------------------------------------- aba de volta ao primeiro plano

// O celular do fiscal fica dias com a aba aberta: ao voltar, atualiza o dia e
// as obras (outro fiscal pode ter lançado), sem atrapalhar quem está digitando.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    atualizarHoje();
    if (!estado.sessao || Date.now() - ultimaRecarga < 60_000) return;
    recarregarObras().catch(() => {});
  });
}
