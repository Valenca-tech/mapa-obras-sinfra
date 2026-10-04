import { createApp } from 'vue';
import 'leaflet/dist/leaflet.css';
import './estilo.css';
import App from './App.vue';
import { api, iniciarApi } from './api/index.js';
import { ErroAcao, mensagemDeErro, ehErroDeRede, MSG_REDE } from './api/erros.js';
import { estado, carregarSessao, avisar } from './estado.js';
import { rotas } from './rotas.js';

// Publicação nova enquanto a página estava aberta: os pedaços antigos do
// JavaScript somem do servidor. Recarrega uma vez para pegar os novos.
window.addEventListener('vite:preloadError', (ev) => {
  try {
    const ultima = Number(sessionStorage.getItem('recarga-publicacao') || 0);
    if (Date.now() - ultima < 30_000) return; // já tentou agora há pouco: deixa o erro aparecer
    sessionStorage.setItem('recarga-publicacao', String(Date.now()));
  } catch {
    /* sem storage: recarrega assim mesmo */
  }
  ev.preventDefault();
  location.reload();
});

/** Mensagem em português para falha ao iniciar (nunca o texto técnico). */
function mensagemInicial(e) {
  const texto = String(e?.message ?? e ?? '');
  if (e instanceof ErroAcao) return e.message;
  if (/supabaseUrl|supabaseKey|Invalid URL/i.test(texto)) {
    return 'A configuração do servidor (config.js) está incompleta ou inválida. Avise a Concretta Jr.';
  }
  if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(texto)) {
    return 'A ferramenta foi atualizada enquanto esta página estava aberta. Recarregue a página.';
  }
  if (ehErroDeRede(e)) return MSG_REDE;
  console.error('Falha ao iniciar:', e);
  return 'Ocorreu um erro inesperado ao abrir a ferramenta. Recarregue a página; se continuar, avise a Concretta Jr.';
}

// Rede de segurança: erro não tratado numa tela vira aviso, em vez de só
// aparecer no console com a tela parada.
function avisarErro(e) {
  avisar(e instanceof ErroAcao ? e.message : mensagemDeErro(e), 'erro');
}

async function iniciar() {
  const app = createApp(App);
  app.config.errorHandler = (e) => avisarErro(e);
  window.addEventListener('unhandledrejection', (ev) => {
    if (ev.reason?.name === 'AbortError') return; // pedido cancelado de propósito (ex.: tiles do mapa)
    avisarErro(ev.reason);
  });
  try {
    await iniciarApi();
    await carregarSessao();
    // Sessão encerrada ou trocada fora desta aba (saída em outra aba, outro
    // usuário entrou no mesmo navegador): recarrega para não seguir mostrando
    // o usuário antigo.
    api.aoMudarSessao?.(() => location.reload());
  } catch (e) {
    estado.erroInicial = mensagemInicial(e);
  }
  app.use(rotas);
  estado.pronto = true;
  app.mount('#app');
  const aviso = api.avisoInicial?.();
  if (aviso) avisar(aviso, 'info');
}

iniciar();
