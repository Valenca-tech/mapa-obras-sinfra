// Escolhe a implementação de dados: Supabase (produção) ou demonstração local.
//
// Sem supabaseUrl em public/config.js, a ferramenta roda em modo demonstração:
// o mesmo schema.sql é carregado num Postgres dentro do navegador (PGlite),
// com as mesmas regras de acesso. Nada sai do computador.
//
// Todas as funções retornam dados no mesmo formato do PostgREST
// (datas 'AAAA-MM-DD', números como number).
import { ErroAcao } from './erros.js';

export const config = window.CONFIG ?? {};

// Site publicado (https, fora do computador de desenvolvimento) sem o config.js:
// o arquivo não carregou (rede). Não vira demonstração calado, senão quem
// lançasse gravaria só no próprio navegador achando que gravou no sistema.
const publicado = location.protocol === 'https:' && !/^(localhost|127\.|\[::1\])/.test(location.hostname);
const configNaoCarregou = publicado && !window.CONFIG;

export const modoDemo = !configNaoCarregou && (!config.supabaseUrl || config.modo === 'demo');

/** Preenchido por iniciarApi(); as telas importam e usam direto. */
export const api = {};

export async function iniciarApi() {
  if (configNaoCarregou) {
    throw new ErroAcao('Não foi possível carregar a configuração do servidor. Verifique a internet e recarregue a página.');
  }
  const impl = modoDemo ? await import('./demo.js') : await import('./supabase.js');
  // Antes de iniciar: se a inicialização falhar, "Reiniciar demonstração"
  // continua disponível na tela de erro.
  Object.assign(api, impl);
  await impl.iniciar(config);
}
