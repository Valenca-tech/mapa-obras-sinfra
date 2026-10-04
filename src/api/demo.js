// Modo demonstração: Postgres no navegador (PGlite) com o schema real.
// Os dados ficam no IndexedDB deste navegador; "Reiniciar demonstração" recria tudo.
import { PGlite } from '@electric-sql/pglite';
import shim from '../../supabase/test/shim_supabase.sql?raw';
import schema from '../../supabase/schema.sql?raw';
import seed from '../../supabase/seed_demo.sql?raw';
import instalacoes from '../../supabase/instalacoes_iniciais.sql?raw';
import { mensagemDeErro, ErroAcao } from './erros.js';
import {
  CAMPOS_OBRA_EDITAVEIS, CAMPOS_INSTALACAO, CAMPOS_CONFIGURACAO, CAMPOS_ITEM_ORCAMENTO, filtrar, temDocumento, novoId,
} from './campos.js';
import { NOME_BANCO, SENHA_DEMO, usuariosDemo, popularDemonstracao, sqlDeslocarDatas, versaoDemo } from './demo_dados.js';
import { hojeEmImperatriz, diasEntre } from '../lib/situacao.js';

export { usuariosDemo, SENHA_DEMO };

let db;
let uid = null;
let fila = Promise.resolve();

const guardar = (v) => { try { v ? sessionStorage.setItem('demo_uid', v) : sessionStorage.removeItem('demo_uid'); } catch { /* sem storage */ } };
const lembrar = () => { try { return sessionStorage.getItem('demo_uid'); } catch { return null; } };

// PGlite tem uma conexão só: as chamadas entram em fila para o "set role" de
// uma não vazar para outra.
function emFila(fn) {
  const p = fila.then(fn, fn);
  fila = p.catch(() => {});
  return p;
}

// Executa como o usuário logado, sob as mesmas regras de acesso do Supabase.
// Cada chamada é UMA transação: identidade e papel valem só dentro dela
// ("local") e o PGlite grava no IndexedDB uma vez, no fim, esperando terminar.
// (Gravar a cada comando deixava cada consulta com ~400 ms; gravar em segundo
// plano disputava arquivos com a consulta seguinte e podia deixar o banco do
// navegador inconsistente se a aba fechasse no meio.)
function comoUsuario(fn) {
  return emFila(async () => {
    try {
      return await db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claims', $1, true)", [uid ? JSON.stringify({ sub: uid }) : '']);
        await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
        return await fn(tx);
      });
    } catch (e) {
      const erro = new ErroAcao(mensagemDeErro(e), e.code);
      erro.detalhe = e.message; // texto original do Postgres (ex.: nome da restrição)
      throw erro;
    }
  });
}

// Mesmo critério do supabase.js: repetir uma gravação com o mesmo id não duplica.
const jaGravado = (e, tabela) => e?.code === '23505' && String(e.detalhe ?? '').includes(`${tabela}_pkey`);

// Resultado como JSON, igual ao PostgREST (datas em texto, números como number).
const json = (sql, params = []) =>
  comoUsuario(async (tx) => {
    const r = await tx.query(`select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as j from (${sql}) x`, params);
    return r.rows[0].j;
  });

const valor = (sql, params = []) =>
  comoUsuario(async (tx) => {
    const r = await tx.query(`select to_jsonb((${sql})) as v`, params);
    return r.rows[0]?.v;
  });

const doc = (d) => (temDocumento(d) ? JSON.stringify(d) : null);

// ---------------------------------------------------------------- ciclo de vida

// No arquivo HTML único (npm run html) vêm embutidos na página, compactados em
// gzip + base64: o WebAssembly do Postgres e o banco da demonstração já montado
// (com schema, obras e usuários). Assim a primeira abertura não precisa criar
// um banco do zero, que é a parte mais lenta.
async function descompactar(base64) {
  // fetch de data: URL decodifica base64 em código nativo (bem mais rápido que atob)
  const resposta = await fetch(`data:application/octet-stream;base64,${base64}`);
  return new Response(resposta.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

// Versão do banco pelo conteúdo (schema, seed...). Ela entra no nome do banco no
// IndexedDB: publicação com schema novo = banco novo, sem misturar com o velho.
const VERSAO = versaoDemo({ shim, schema, seed, instalacoes });
const NOME_IDB = `${NOME_BANCO}-${VERSAO}`;
const PREFIXO_IDB = `/pglite/${NOME_BANCO}`;
let aviso = null;

/** Mensagem para mostrar uma vez depois de iniciar (ex.: demonstração atualizada). */
export const avisoInicial = () => aviso;

// No site publicado (npm run build), o banco pronto fica em demo/banco.pgdata
// (tar compactado com gzip), baixado só na primeira visita de cada navegador.
// Alguns servidores descompactam no caminho (Content-Encoding), então o tipo
// é decidido pela assinatura dos bytes, não pela extensão. O "?v=" impede que
// o cache do servidor entregue o arquivo de uma publicação anterior.
async function bancoPublicado() {
  try {
    const r = await fetch('demo/banco.json', { cache: 'no-cache' });
    if (!r.ok) return { opcoes: {} };
    const { dia, versao } = await r.json(); // no `npm run dev` vem HTML e cai no catch
    if (versao !== VERSAO) return { opcoes: {} }; // publicação a meio caminho: monta do zero
    return {
      opcoes: {},
      banco: async () => {
        const b = await fetch(`demo/banco.pgdata?v=${VERSAO}`);
        if (!b.ok) throw new Error(`banco da demonstração indisponível (${b.status})`);
        const bytes = new Uint8Array(await b.arrayBuffer());
        const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
        return new Blob([bytes], { type: gzip ? 'application/x-gzip' : 'application/x-tar' });
      },
      diaDoBanco: dia,
    };
  } catch {
    return { opcoes: {} };
  }
}

async function arquivosEmbutidos() {
  const el = (id) => document.getElementById(id);
  if (!el('pglite-wasm')) return bancoPublicado();
  const [wasm, initdb, dados] = await Promise.all(
    ['pglite-wasm', 'pglite-initdb', 'pglite-data'].map((id) => descompactar(el(id).textContent.trim())),
  );
  const [pgliteWasmModule, initdbWasmModule] = await Promise.all([WebAssembly.compile(wasm), WebAssembly.compile(initdb)]);
  const blocoBanco = el('pglite-banco');
  const usarBloco = blocoBanco && blocoBanco.dataset.versao === VERSAO;
  return {
    opcoes: { pgliteWasmModule, initdbWasmModule, fsBundle: new Blob([dados]) },
    // só descompacta o banco pronto se ele for usado (primeira abertura)
    banco: usarBloco
      ? async () => new Blob([await descompactar(blocoBanco.textContent.trim())], { type: 'application/x-tar' })
      : null,
    diaDoBanco: usarBloco ? blocoBanco.dataset.dia : null,
  };
}

/** Nomes dos bancos desta demonstração no IndexedDB (null se o navegador não informa). */
async function bancosExistentes() {
  if (!indexedDB.databases) return null;
  try {
    return (await indexedDB.databases()).map((d) => d.name).filter((n) => n?.startsWith(PREFIXO_IDB));
  } catch {
    return null;
  }
}

function apagarBanco(nome) {
  return new Promise((ok) => {
    const req = indexedDB.deleteDatabase(nome);
    req.onsuccess = req.onerror = () => ok(true);
    req.onblocked = () => ok(false); // outra aba ainda usa o banco
  });
}

// Uma aba só: duas abas com o mesmo banco no IndexedDB sobrescrevem uma a
// gravação da outra. A trava fica presa enquanto a página estiver aberta.
function travarAba() {
  if (!navigator.locks) return Promise.resolve(true);
  return new Promise((ok) => {
    navigator.locks.request(`trava-${NOME_BANCO}`, { ifAvailable: true }, (trava) => {
      ok(!!trava);
      return trava ? new Promise(() => {}) : undefined;
    });
  });
}

export async function iniciar() {
  if (!(await travarAba())) {
    throw new ErroAcao(
      'A demonstração já está aberta em outra aba ou janela deste navegador. Use aquela aba, ou feche-a e recarregue esta página.',
    );
  }

  const { opcoes, banco, diaDoBanco } = await arquivosEmbutidos();
  const base = { ...opcoes };

  const existentes = await bancosExistentes();
  const jaExiste = existentes === null ? true : existentes.includes(`/pglite/${NOME_IDB}`);
  // Bancos de versões anteriores da demonstração: apaga e avisa.
  const antigos = (existentes ?? []).filter((n) => n !== `/pglite/${NOME_IDB}`);
  if (antigos.length) {
    await Promise.all(antigos.map(apagarBanco));
    aviso = 'A demonstração foi atualizada. Os dados de teste foram reiniciados.';
  }

  if (banco && !jaExiste) {
    try {
      base.loadDataDir = await banco();
    } catch {
      // sem o banco pronto, cria do zero (mais lento, mas funciona)
    }
  }

  try {
    db = new PGlite(`idb://${NOME_IDB}`, base);
    await db.waitReady;
  } catch {
    // sem IndexedDB: só em memória (e, se houver, a partir do banco pronto)
    if (banco && !base.loadDataDir) base.loadDataDir = await banco().catch(() => undefined);
    db = new PGlite(base);
    await db.waitReady;
  }

  const pronto = await db.query("select to_regclass('public.obras') is not null as ok");
  if (!pronto.rows[0].ok) {
    await popularDemonstracao(db, { shim, schema, seed, instalacoes });
  } else if (base.loadDataDir && diaDoBanco) {
    const dias = diasEntre(diaDoBanco, hojeEmImperatriz());
    if (dias) await db.exec(sqlDeslocarDatas(dias));
  }
  uid = lembrar();
}

/**
 * Apaga o banco da demonstração e recarrega a página.
 * Retorna false se não deu (outra aba ainda está com a demonstração aberta).
 */
export async function reiniciarDemo() {
  guardar(null);
  try {
    await db?.close();
  } catch {
    /* já fechado */
  }
  const nomes = (await bancosExistentes()) ?? [`/pglite/${NOME_IDB}`];
  const resultados = await Promise.all(nomes.map(apagarBanco));
  if (resultados.includes(false)) return false;
  location.reload();
  return true;
}

// Uma aba só (travarAba): a sessão não muda por fora. Mantém o contrato.
export const aoMudarSessao = () => () => {};

// ---------------------------------------------------------------- sessão

export async function entrar(email, senha) {
  const r = await emFila(() => db.query('select id from auth.users where lower(email) = lower($1)', [email.trim()]));
  if (!r.rows[0] || senha !== SENHA_DEMO) throw new ErroAcao('E-mail ou senha incorretos.');
  uid = r.rows[0].id;
  guardar(uid);
  const perfil = await meuPerfil();
  if (!perfil) {
    uid = null;
    guardar(null);
    throw new ErroAcao('Usuário sem acesso. Procure a Concretta Jr.');
  }
  return { id: uid };
}

export async function sair() {
  uid = null;
  guardar(null);
}

export const sessao = async () => (uid ? { id: uid } : null);

export async function meuPerfil() {
  const r = await json('select * from public.minhas_permissoes()');
  return r[0] ?? null;
}

// ---------------------------------------------------------------- leitura

export const configuracao = async () => (await json('select * from configuracao'))[0];
export const tiposObra = () => json('select * from tipos_obra where ativo order by ordem, nome');
export const tiposDocumento = () => json('select * from tipos_documento where ativo order by ordem, nome');
export const tiposInstalacao = () => json('select * from tipos_instalacao where ativo order by ordem, nome');

/** Instalações públicas; por padrão só as ativas (as que aparecem no mapa). */
export const listarInstalacoes = ({ inativas = false } = {}) =>
  json('select * from instalacoes where ativa or $1 order by nome', [inativas]);

export const listarObras = ({ arquivadas = false } = {}) =>
  json('select * from obras_painel where arquivada = $1 order by nome', [arquivadas]);

export const obter = async (id) => (await json('select * from obras_painel where id = $1', [id]))[0] ?? null;

export async function historico(id) {
  const [atualizacoes, eventos] = await Promise.all([
    json('select * from atualizacoes where obra_id = $1 order by criado_em desc', [id]),
    json(
      `select e.*, to_jsonb(d) as documento
         from eventos_obra e left join documentos d on d.id = e.documento_id
        where e.obra_id = $1 order by e.criado_em desc`,
      [id],
    ),
  ]);
  return { atualizacoes, eventos };
}

export const pendencias = () => json('select * from pendencias_documentais order by data_evento');
export const auditoria = () => json('select * from auditoria order by id desc limit 300');
export const perfis = () => json('select * from perfis order by nome');
export const permissoesPorPapel = () =>
  json(`select p.codigo, p.nome, p.descricao,
               coalesce(array_agg(pp.permissao order by pp.permissao) filter (where pp.permissao is not null), '{}'::text[]) as permissoes
          from papeis p left join papel_permissoes pp on pp.papel = p.codigo
         group by p.codigo order by p.codigo`);
export const permissoes = () => json('select * from permissoes order by codigo');

// ---------------------------------------------------------------- escrita

/** itens: [{ id, obra_id, percentual_executado, observacao }]. Um único INSERT: tudo ou nada. */
export async function lancar(itens) {
  const linhas = itens.map((i) => ({
    id: i.id ?? novoId(),
    obra_id: i.obra_id,
    percentual_executado: i.percentual_executado,
    observacao: i.observacao ?? null,
  }));
  try {
    await comoUsuario((tx) =>
      tx.query(
        `insert into atualizacoes (id, obra_id, percentual_executado, observacao)
         select id, obra_id, percentual_executado, observacao
           from jsonb_to_recordset($1::jsonb) as t(id uuid, obra_id uuid, percentual_executado numeric, observacao text)`,
        [JSON.stringify(linhas)],
      ),
    );
  } catch (e) {
    if (!jaGravado(e, 'atualizacoes')) throw e;
  }
}

/** dados.id (gerado no formulário) torna o cadastro repetível sem duplicar. */
export const criarObra = (dados, percentualInicial, documento) =>
  valor('public.criar_obra($1::jsonb, $2::numeric, $3::jsonb)', [
    JSON.stringify({ id: novoId(), ...dados }),
    percentualInicial ?? null,
    doc(documento),
  ]);

export async function editarObra(id, campos) {
  const valores = filtrar(campos, CAMPOS_OBRA_EDITAVEIS);
  const cols = Object.keys(valores);
  if (!cols.length) return;
  const n = await comoUsuario(async (tx) => {
    const r = await tx.query(
      `update obras set (${cols.join(', ')}) = (select ${cols.join(', ')} from jsonb_populate_record(null::obras, $2::jsonb))
        where id = $1 returning id`,
      [id, JSON.stringify(valores)],
    );
    return r.rows.length;
  });
  if (!n) throw new ErroAcao('Você não tem permissão para editar esta obra (ou ela está arquivada).');
}

export const registrarAditivo = (id, novoTermino, descricao, documento, data) =>
  valor('public.registrar_aditivo_prazo($1, $2::date, $3, $4::jsonb, $5::date)', [id, novoTermino, descricao || null, doc(documento), data || null]);

export const paralisar = (id, motivo, documento, data) =>
  valor('public.paralisar_obra($1, $2, $3::jsonb, $4::date)', [id, motivo, doc(documento), data || null]);

export const retomar = (id, observacao, documento, data) =>
  valor('public.retomar_obra($1, $2, $3::jsonb, $4::date)', [id, observacao || null, doc(documento), data || null]);

export const arquivar = (id, motivo, documento) =>
  valor('public.arquivar_obra($1, $2, $3::jsonb)', [id, motivo, doc(documento)]);

export const desarquivar = (id, motivo, documento) =>
  valor('public.desarquivar_obra($1, $2, $3::jsonb)', [id, motivo, doc(documento)]);

export const completarDocumento = (eventoId, documento) =>
  valor('public.completar_documento($1, $2::jsonb)', [eventoId, doc(documento) ?? '{}']);

export async function criarInstalacao(dados) {
  const linha = filtrar({ id: novoId(), ...dados }, CAMPOS_INSTALACAO);
  const cols = Object.keys(linha);
  try {
    await comoUsuario((tx) =>
      tx.query(
        `insert into instalacoes (${cols.join(', ')})
         select ${cols.join(', ')} from jsonb_populate_record(null::instalacoes, $1::jsonb)`,
        [JSON.stringify(linha)],
      ),
    );
  } catch (e) {
    if (!jaGravado(e, 'instalacoes')) throw e;
  }
  return linha.id;
}

export async function editarInstalacao(id, campos) {
  const valores = filtrar(campos, CAMPOS_INSTALACAO.filter((c) => c !== 'id'));
  const cols = Object.keys(valores);
  if (!cols.length) return;
  const n = await comoUsuario(async (tx) => {
    const r = await tx.query(
      `update instalacoes set (${cols.join(', ')}) = (select ${cols.join(', ')} from jsonb_populate_record(null::instalacoes, $2::jsonb))
        where id = $1 returning id`,
      [id, JSON.stringify(valores)],
    );
    return r.rows.length;
  });
  if (!n) throw new ErroAcao('Você não tem permissão para editar esta instalação.');
}

// UPDATE só das colunas permitidas, com os valores vindos em JSON (mesmo
// formato do PostgREST). Devolve as linhas alteradas.
function atualizar(tx, tabela, id, valores, chave = 'id') {
  const cols = Object.keys(valores);
  return tx.query(
    `update ${tabela} set (${cols.join(', ')}) = (select ${cols.join(', ')} from jsonb_populate_record(null::${tabela}, $2::jsonb))
      where ${chave} = $1 returning to_jsonb(${tabela}) as linha`,
    [id, JSON.stringify(valores)],
  );
}

export async function salvarConfiguracao(c) {
  const valores = filtrar(c, CAMPOS_CONFIGURACAO);
  if (!Object.keys(valores).length) return;
  const n = await comoUsuario(async (tx) => (await atualizar(tx, 'configuracao', true, valores)).rows.length);
  if (!n) throw new ErroAcao('Você não tem permissão para alterar a configuração.');
}

// ---------------------------------------------------------------- planilha de serviços

/** Planilha vigente da obra: { orcamento, itens } ou null. */
export async function obterOrcamento(obraId) {
  const orcamento = (await json('select * from orcamentos where obra_id = $1 and ativo', [obraId]))[0];
  if (!orcamento) return null;
  const itens = await json('select * from orcamento_itens where orcamento_id = $1 order by ordem', [orcamento.id]);
  return { orcamento, itens };
}

export const listarOrcamentos = (obraId) =>
  json('select * from orcamentos where obra_id = $1 order by criado_em desc', [obraId]);

const CAMPOS_IMPORTACAO = ['nivel', 'numero', 'codigo', 'fonte', 'descricao', 'unidade', 'quantidade', 'preco_unitario', 'total', 'tipo'];

export const importarOrcamento = (obraId, dadosPlanilha, itens) =>
  valor('public.importar_orcamento($1, $2::jsonb, $3::jsonb)', [
    obraId,
    JSON.stringify({ id: novoId(), ...dadosPlanilha }),
    JSON.stringify(itens.map((x) => filtrar(x, CAMPOS_IMPORTACAO))),
  ]);

export async function editarOrcamento(id, campos) {
  const valores = filtrar(campos, ['descricao', 'data_base', 'bdi_percentual']);
  if (!Object.keys(valores).length) return;
  const n = await comoUsuario(async (tx) => (await atualizar(tx, 'orcamentos', id, valores)).rows.length);
  if (!n) throw new ErroAcao('Esta planilha não pode mais ser alterada (é antiga ou a obra está arquivada).');
}

export async function editarItemOrcamento(id, campos) {
  const valores = filtrar(campos, CAMPOS_ITEM_ORCAMENTO);
  if (!Object.keys(valores).length) return null;
  const linhas = await comoUsuario(async (tx) => (await atualizar(tx, 'orcamento_itens', id, valores)).rows);
  if (!linhas.length) throw new ErroAcao('Este item não pode ser alterado (planilha antiga, obra arquivada ou sem permissão).');
  return linhas[0].linha;
}

export async function adicionarItemOrcamento(orcamentoId, item) {
  const linha = {
    id: novoId(),
    ...filtrar(item, ['id', ...CAMPOS_ITEM_ORCAMENTO.filter((c) => c !== 'removido')]),
    orcamento_id: orcamentoId,
  };
  const cols = Object.keys(linha);
  try {
    await comoUsuario((tx) =>
      tx.query(
        `insert into orcamento_itens (${cols.join(', ')})
         select ${cols.join(', ')} from jsonb_populate_record(null::orcamento_itens, $1::jsonb)`,
        [JSON.stringify(linha)],
      ),
    );
  } catch (e) {
    if (!jaGravado(e, 'orcamento_itens')) throw e;
  }
  return linha.id;
}

// ---------------------------------------------------------------- documentos gerados

export const listarDocumentosGerados = (obraId) =>
  json(
    `select id, obra_id, tipo, ano, numero, numero_protocolo, gerado_por_nome, gerado_em
       from documentos_gerados where obra_id = $1 order by gerado_em desc`,
    [obraId],
  );

export const obterDocumentoGerado = async (id) => (await json('select * from documentos_gerados where id = $1', [id]))[0] ?? null;

export const registrarDocumentoGerado = ({ id, obraId, tipo, conteudo, protocolo }) =>
  valor('public.registrar_documento_gerado($1, $2, $3, $4::jsonb, $5)', [
    id ?? novoId(), obraId, tipo, JSON.stringify(conteudo ?? {}), protocolo || null,
  ]);
