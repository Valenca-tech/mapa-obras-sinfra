import { watch } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import { estado, pode, sair } from './estado.js';

import Capa from './telas/Capa.vue';
import Entrar from './telas/Entrar.vue';
import Painel from './telas/Painel.vue';
import Obras from './telas/Obras.vue';
import Obra from './telas/Obra.vue';
import Atualizar from './telas/Atualizar.vue';
import ObraFormulario from './telas/ObraFormulario.vue';
import Relatorio from './telas/Relatorio.vue';
import Configuracao from './telas/Configuracao.vue';
import Auditoria from './telas/Auditoria.vue';
import Pendencias from './telas/Pendencias.vue';
import Instalacoes from './telas/Instalacoes.vue';

/** Tela inicial: o fiscal cai direto em Lançamentos (se puder lançar); os demais, no Painel. */
export const telaInicial = () =>
  estado.perfil?.papel === 'fiscal' && pode('percentual.lancar') ? '/lancamentos' : '/painel';

const routes = [
  { path: '/', redirect: () => telaInicial() },
  { path: '/capa', component: Capa, meta: { publica: true, limpa: true } },
  { path: '/entrar', component: Entrar, meta: { publica: true, limpa: true } },
  { path: '/painel', component: Painel },
  // Obras: cartões e mapa na mesma tela (?ver=mapa), com os mesmos filtros.
  { path: '/obras', component: Obras, meta: { cheia: true } },
  { path: '/obras/nova', component: ObraFormulario, meta: { permissao: 'obra.cadastrar' } },
  { path: '/obras/:id/editar', component: ObraFormulario, props: true, meta: { permissao: 'obra.editar' } },
  { path: '/obras/:id', component: Obra, props: true },
  { path: '/lancamentos', component: Atualizar, meta: { permissao: 'percentual.lancar' } },
  { path: '/pendencias', component: Pendencias },
  { path: '/instalacoes', component: Instalacoes },
  { path: '/relatorio', component: Relatorio, meta: { limpa: true } },
  { path: '/configuracao', component: Configuracao, meta: { permissao: 'configuracao.editar' } },
  { path: '/auditoria', component: Auditoria, meta: { permissao: 'auditoria.ver' } },
  // endereços antigos (links salvos)
  { path: '/mapa', redirect: (para) => ({ path: '/obras', query: { ...para.query, ver: 'mapa' } }) },
  { path: '/central', redirect: (para) => ({ path: '/obras', query: { ...para.query, ver: 'lista' } }) },
  { path: '/lista', redirect: (para) => ({ path: '/obras', query: { ...para.query, ver: 'lista' } }) },
  { path: '/atualizar', redirect: '/lancamentos' },
  { path: '/:caminho(.*)*', redirect: '/' },
];

export const rotas = createRouter({
  history: createWebHashHistory(),
  routes,
  // Topo da página só ao trocar de tela (selecionar obra no mapa muda só o ?obra=);
  // no "voltar", a posição em que estava.
  scrollBehavior: (para, de, salva) => salva ?? (para.path !== de.path ? { top: 0 } : false),
});

// Capa de entrada: aparece uma vez por visita (aba aberta), ao chegar pelo
// endereço da ferramenta; depois de "Iniciar" segue para onde ia.
const CHAVE_CAPA = 'mapa-obras-capa-vista';
let primeiraNavegacao = true;
function capaJaVista() {
  try {
    return sessionStorage.getItem(CHAVE_CAPA) === '1';
  } catch {
    return false;
  }
}
export function marcarCapaVista() {
  try {
    sessionStorage.setItem(CHAVE_CAPA, '1');
  } catch {
    /* sem storage: a capa volta na próxima visita, sem problema */
  }
}

rotas.beforeEach((para) => {
  if (primeiraNavegacao) {
    primeiraNavegacao = false;
    if (para.path !== '/capa' && para.path !== '/relatorio' && !capaJaVista()) {
      return { path: '/capa', query: para.fullPath && para.fullPath !== '/' ? { depois: para.fullPath } : {} };
    }
  }
  if (para.path === '/capa') return true;
  if (para.path === '/entrar' && estado.saindo) return true;
  if (!para.meta.publica && !estado.sessao) return '/entrar';
  if (para.path === '/entrar' && estado.sessao) return telaInicial();
  if (para.meta.permissao && !pode(para.meta.permissao)) {
    const inicial = telaInicial();
    return para.path === inicial ? '/painel' : inicial; // nunca redireciona para si mesma
  }
  return true;
});

/**
 * "Sair": primeiro sai da tela (as telas com algo não salvo perguntam, com a
 * sessão ainda ativa para poder salvar) e só então encerra a sessão.
 */
export async function sairDaConta() {
  estado.saindo = true;
  let falha;
  try {
    falha = await rotas.replace('/entrar');
  } finally {
    estado.saindo = false;
  }
  if (falha) return false; // a pessoa preferiu ficar e salvar
  await sair();
  return true;
}

// ---------------------------------------------------------------- obra selecionada no mapa, na URL

// A obra selecionada no mapa vira ?obra=<id> na URL: o "voltar" do celular
// fecha a prévia em vez de trocar de tela, e o endereço abre a mesma obra.
let fichaEmpurrada = null; // id da ficha cuja abertura criou entrada no histórico

const obraDaUrl = () => {
  const o = rotas.currentRoute.value.query.obra;
  return typeof o === 'string' ? o : null;
};

watch(
  () => estado.obraAberta,
  (id) => {
    const naUrl = obraDaUrl();
    if (id === naUrl) return;
    const query = { ...rotas.currentRoute.value.query };
    if (id) {
      query.obra = id;
      if (naUrl) {
        if (fichaEmpurrada === naUrl) fichaEmpurrada = id; // troca de obra na mesma entrada
        rotas.replace({ query });
      } else {
        fichaEmpurrada = id;
        rotas.push({ query });
      }
    } else if (naUrl) {
      fichaEmpurrada = null;
      delete query.obra;
      rotas.replace({ query });
    }
  },
);

watch(obraDaUrl, (id) => {
  if (!id) fichaEmpurrada = null;
  if (id !== estado.obraAberta) estado.obraAberta = id;
});

/** Fecha a prévia pelo ×: volta no histórico quando a abertura criou uma entrada. */
export function fecharPrevia() {
  const id = estado.obraAberta;
  if (id && fichaEmpurrada === id && obraDaUrl() === id) {
    fichaEmpurrada = null;
    rotas.back(); // o watch acima fecha a ficha quando o ?obra= sai da URL
  } else {
    estado.obraAberta = null;
  }
}
