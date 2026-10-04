// Produção: Supabase com a anon key. Quem protege os dados é a RLS do schema.sql.
// Mesmo contrato que demo.js (o teste supabase/test/contrato.test.mjs confere).
import { createClient } from '@supabase/supabase-js';
import { mensagemDeErro, ehErroDeRede, ErroAcao, MSG_REDE, MSG_SESSAO } from './erros.js';
import {
  CAMPOS_OBRA_EDITAVEIS, CAMPOS_INSTALACAO, CAMPOS_CONFIGURACAO, CAMPOS_ITEM_ORCAMENTO, filtrar, temDocumento, novoId,
} from './campos.js';

// Chave fixa da sessão no localStorage: assim o "Sair" consegue apagá-la mesmo
// quando a biblioteca não consegue (sem rede e com o token vencido).
const CHAVE_SESSAO = 'mapa-obras-sinfra-sessao';

let sb;
let usuarioAtual = null; // quem está usando ESTA aba
const ouvintes = new Set();

function falha(error) {
  if (ehErroDeRede(error)) return new ErroAcao(MSG_REDE, 'REDE');
  return new ErroAcao(mensagemDeErro(error), error?.code);
}

async function temSessao() {
  try {
    const { data } = await sb.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

async function dados(promessa) {
  const { data, error } = await promessa;
  if (error) {
    // Sem sessão válida (token vencido que não renovou, saída em outra aba) o
    // supabase-js passa a usar a anon key e tudo volta como "sem permissão":
    // a mensagem certa é que a sessão terminou.
    const semPermissao = error.code === '42501' || error.code === 'PGRST301' || /JWT/i.test(error.message ?? '');
    if (semPermissao && !(await temSessao())) throw new ErroAcao(MSG_SESSAO, 'SESSAO');
    throw falha(error);
  }
  return data;
}

const rpc = (nome, args) => dados(sb.rpc(nome, args));
const doc = (d) => (temDocumento(d) ? d : null);

// Repetir uma gravação depois de perder a resposta não duplica: o id vem do
// navegador, e "já existe" (23505 na chave primária) quer dizer que gravou.
const jaGravado = (error, tabela) => error?.code === '23505' && String(error.message ?? '').includes(`${tabela}_pkey`);

// ---------------------------------------------------------------- ciclo de vida

export async function iniciar(config) {
  sb = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: CHAVE_SESSAO },
  });
  const { data } = await sb.auth.getSession();
  usuarioAtual = data.session?.user?.id ?? null;

  // Sessão encerrada ou trocada fora desta aba (saída em outra aba, token
  // revogado, outro usuário entrou no mesmo navegador): a tela não pode seguir
  // mostrando o usuário antigo. Sem await aqui dentro (recomendação do supabase-js).
  sb.auth.onAuthStateChange((evento, sessao) => {
    const id = sessao?.user?.id ?? null;
    if (!usuarioAtual) {
      if (evento === 'SIGNED_IN') usuarioAtual = id;
      return;
    }
    if (evento === 'SIGNED_OUT' || (id && id !== usuarioAtual)) {
      usuarioAtual = id;
      ouvintes.forEach((fn) => fn(evento));
    }
  });
}

/** Chamado quando a sessão desta aba deixa de valer por motivo externo. */
export function aoMudarSessao(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

// ---------------------------------------------------------------- sessão

export async function entrar(email, senha) {
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error) {
    const credenciais = error.code === 'invalid_credentials' || (error.status === 400 && !error.code);
    throw new ErroAcao(credenciais ? 'E-mail ou senha incorretos.' : mensagemDeErro(error), error.code);
  }
  usuarioAtual = data.user.id;
  const perfil = await meuPerfil();
  if (!perfil) {
    await sair();
    throw new ErroAcao('Usuário sem acesso ou desativado. Procure a Concretta Jr.');
  }
  return { id: data.user.id };
}

export async function sair() {
  usuarioAtual = null; // a própria saída não dispara o aviso de sessão encerrada
  try {
    // 'local': sai só deste aparelho (o padrão 'global' derrubaria o celular da mesma pessoa)
    const { error } = await sb.auth.signOut({ scope: 'local' });
    if (error) throw error;
  } catch {
    try {
      for (const sufixo of ['', '-code-verifier', '-user']) localStorage.removeItem(CHAVE_SESSAO + sufixo);
    } catch {
      /* sem storage */
    }
  }
}

export async function sessao() {
  try {
    const { data } = await sb.auth.getSession();
    return data.session ? { id: data.session.user.id } : null;
  } catch {
    return null;
  }
}

export async function meuPerfil() {
  const r = await rpc('minhas_permissoes');
  return r?.[0] ?? null;
}

// ---------------------------------------------------------------- leitura

export const configuracao = () => dados(sb.from('configuracao').select('*').single());
export const tiposObra = () => dados(sb.from('tipos_obra').select('*').eq('ativo', true).order('ordem'));
export const tiposDocumento = () => dados(sb.from('tipos_documento').select('*').eq('ativo', true).order('ordem'));
export const tiposInstalacao = () => dados(sb.from('tipos_instalacao').select('*').eq('ativo', true).order('ordem'));

/** Instalações públicas; por padrão só as ativas (as que aparecem no mapa). */
export function listarInstalacoes({ inativas = false } = {}) {
  let q = sb.from('instalacoes').select('*').order('nome');
  if (!inativas) q = q.eq('ativa', true);
  return dados(q);
}

export const listarObras = ({ arquivadas = false } = {}) =>
  dados(sb.from('obras_painel').select('*').eq('arquivada', arquivadas).order('nome'));

export const obter = (id) => dados(sb.from('obras_painel').select('*').eq('id', id).maybeSingle());

export async function historico(id) {
  const [atualizacoes, eventos] = await Promise.all([
    dados(sb.from('atualizacoes').select('*').eq('obra_id', id).order('criado_em', { ascending: false })),
    dados(sb.from('eventos_obra').select('*, documento:documentos(*)').eq('obra_id', id).order('criado_em', { ascending: false })),
  ]);
  return { atualizacoes, eventos };
}

export const pendencias = () => dados(sb.from('pendencias_documentais').select('*').order('data_evento'));
export const auditoria = () => dados(sb.from('auditoria').select('*').order('id', { ascending: false }).limit(300));
export const perfis = () => dados(sb.from('perfis').select('*').order('nome'));
export const permissoes = () => dados(sb.from('permissoes').select('*').order('codigo'));

export async function permissoesPorPapel() {
  const [papeis, pp] = await Promise.all([
    dados(sb.from('papeis').select('*').order('codigo')),
    dados(sb.from('papel_permissoes').select('*')),
  ]);
  return papeis.map((p) => ({
    ...p,
    permissoes: pp.filter((x) => x.papel === p.codigo).map((x) => x.permissao).sort(),
  }));
}

// ---------------------------------------------------------------- escrita

/** itens: [{ id, obra_id, percentual_executado, observacao }]. Um único INSERT: tudo ou nada. */
export async function lancar(itens) {
  const linhas = itens.map((i) => ({
    id: i.id ?? novoId(),
    obra_id: i.obra_id,
    percentual_executado: i.percentual_executado,
    observacao: i.observacao ?? null,
  }));
  const { error } = await sb.from('atualizacoes').insert(linhas);
  if (error && !jaGravado(error, 'atualizacoes')) await dados(Promise.resolve({ error }));
}

/** dados_.id (gerado no formulário) torna o cadastro repetível sem duplicar. */
export const criarObra = (dados_, percentualInicial, documento) =>
  rpc('criar_obra', {
    p_dados: { id: novoId(), ...dados_ },
    p_percentual_inicial: percentualInicial ?? null,
    p_documento: doc(documento),
  });

export async function editarObra(id, campos) {
  const valores = filtrar(campos, CAMPOS_OBRA_EDITAVEIS);
  if (!Object.keys(valores).length) return;
  const r = await dados(sb.from('obras').update(valores).eq('id', id).select('id'));
  if (!r.length) throw new ErroAcao('Você não tem permissão para editar esta obra (ou ela está arquivada).');
}

export const registrarAditivo = (id, novoTermino, descricao, documento, data) =>
  rpc('registrar_aditivo_prazo', {
    p_obra: id, p_novo_termino: novoTermino, p_descricao: descricao || null,
    p_documento: doc(documento), p_data: data || null,
  });

export const paralisar = (id, motivo, documento, data) =>
  rpc('paralisar_obra', { p_obra: id, p_motivo: motivo, p_documento: doc(documento), p_data: data || null });

export const retomar = (id, observacao, documento, data) =>
  rpc('retomar_obra', { p_obra: id, p_observacao: observacao || null, p_documento: doc(documento), p_data: data || null });

export const arquivar = (id, motivo, documento) =>
  rpc('arquivar_obra', { p_obra: id, p_motivo: motivo, p_documento: doc(documento) });

export const desarquivar = (id, motivo, documento) =>
  rpc('desarquivar_obra', { p_obra: id, p_motivo: motivo, p_documento: doc(documento) });

export const completarDocumento = (eventoId, documento) =>
  rpc('completar_documento', { p_evento: eventoId, p_documento: doc(documento) ?? {} });

export async function criarInstalacao(dadosInstalacao) {
  const linha = filtrar({ id: novoId(), ...dadosInstalacao }, CAMPOS_INSTALACAO);
  const { error } = await sb.from('instalacoes').insert(linha);
  if (error && !jaGravado(error, 'instalacoes')) await dados(Promise.resolve({ error }));
  return linha.id;
}

export async function editarInstalacao(id, campos) {
  const valores = filtrar(campos, CAMPOS_INSTALACAO.filter((c) => c !== 'id'));
  if (!Object.keys(valores).length) return;
  const r = await dados(sb.from('instalacoes').update(valores).eq('id', id).select('id'));
  if (!r.length) throw new ErroAcao('Você não tem permissão para editar esta instalação.');
}

export async function salvarConfiguracao(c) {
  const valores = filtrar(c, CAMPOS_CONFIGURACAO);
  if (!Object.keys(valores).length) return;
  const r = await dados(sb.from('configuracao').update(valores).eq('id', true).select('id'));
  if (!r.length) throw new ErroAcao('Você não tem permissão para alterar a configuração.');
}

// ---------------------------------------------------------------- planilha de serviços

// O PostgREST devolve no máximo 1.000 linhas por pedido: planilha grande vem em partes.
async function todas(montar, tamanho = 1000) {
  const linhas = [];
  for (let de = 0; ; de += tamanho) {
    const parte = await dados(montar().range(de, de + tamanho - 1));
    linhas.push(...parte);
    if (parte.length < tamanho) return linhas;
  }
}

/** Planilha vigente da obra: { orcamento, itens } ou null. */
export async function obterOrcamento(obraId) {
  const orcamento = await dados(sb.from('orcamentos').select('*').eq('obra_id', obraId).eq('ativo', true).maybeSingle());
  if (!orcamento) return null;
  const itens = await todas(() => sb.from('orcamento_itens').select('*').eq('orcamento_id', orcamento.id).order('ordem'));
  return { orcamento, itens };
}

/** Versões da planilha da obra (a vigente e as anteriores). */
export const listarOrcamentos = (obraId) =>
  dados(sb.from('orcamentos').select('*').eq('obra_id', obraId).order('criado_em', { ascending: false }));

const CAMPOS_IMPORTACAO = ['nivel', 'numero', 'codigo', 'fonte', 'descricao', 'unidade', 'quantidade', 'preco_unitario', 'total', 'tipo'];

/** Importa a planilha (vira a vigente). dadosPlanilha.id torna a importação repetível. */
export const importarOrcamento = (obraId, dadosPlanilha, itens) =>
  rpc('importar_orcamento', {
    p_obra: obraId,
    p_dados: { id: novoId(), ...dadosPlanilha },
    p_itens: itens.map((x) => filtrar(x, CAMPOS_IMPORTACAO)),
  });

export async function editarOrcamento(id, campos) {
  const valores = filtrar(campos, ['descricao', 'data_base', 'bdi_percentual']);
  if (!Object.keys(valores).length) return;
  const r = await dados(sb.from('orcamentos').update(valores).eq('id', id).select('id'));
  if (!r.length) throw new ErroAcao('Esta planilha não pode mais ser alterada (é antiga ou a obra está arquivada).');
}

export async function editarItemOrcamento(id, campos) {
  const valores = filtrar(campos, CAMPOS_ITEM_ORCAMENTO);
  if (!Object.keys(valores).length) return null;
  const r = await dados(sb.from('orcamento_itens').update(valores).eq('id', id).select('*'));
  if (!r.length) throw new ErroAcao('Este item não pode ser alterado (planilha antiga, obra arquivada ou sem permissão).');
  return r[0];
}

export async function adicionarItemOrcamento(orcamentoId, item) {
  const linha = { id: novoId(), ...filtrar(item, ['id', ...CAMPOS_ITEM_ORCAMENTO.filter((c) => c !== 'removido')]), orcamento_id: orcamentoId };
  const { error } = await sb.from('orcamento_itens').insert(linha);
  if (error && !jaGravado(error, 'orcamento_itens')) await dados(Promise.resolve({ error }));
  return linha.id;
}

// ---------------------------------------------------------------- documentos gerados

const COLUNAS_DOCUMENTO = 'id, obra_id, tipo, ano, numero, numero_protocolo, gerado_por_nome, gerado_em';

export const listarDocumentosGerados = (obraId) =>
  dados(sb.from('documentos_gerados').select(COLUNAS_DOCUMENTO).eq('obra_id', obraId).order('gerado_em', { ascending: false }));

export const obterDocumentoGerado = (id) => dados(sb.from('documentos_gerados').select('*').eq('id', id).maybeSingle());

/** Registra a emissão e devolve { id, numero, ano }. id gerado no aparelho: repetir não gasta número. */
export const registrarDocumentoGerado = ({ id, obraId, tipo, conteudo, protocolo }) =>
  rpc('registrar_documento_gerado', {
    p_id: id ?? novoId(), p_obra: obraId, p_tipo: tipo, p_dados: conteudo ?? {}, p_protocolo: protocolo || null,
  });

// Só fazem algo no modo demonstração; aqui existem para manter o mesmo contrato.
export const usuariosDemo = [];
export const reiniciarDemo = async () => true;
export const avisoInicial = () => null;
