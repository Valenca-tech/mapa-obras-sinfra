// Gera public/config.js na publicação (GitHub Actions), a partir das variáveis
// do repositório (Settings > Secrets and variables > Actions > Variables):
//
//   MODO=demo                                -> modo demonstração (dados no navegador)
//   SUPABASE_URL e SUPABASE_ANON_KEY         -> produção (Supabase)
//   nada disso                               -> ERRO: não publica
//
// Sem variável nenhuma o site não pode virar demonstração por engano (quem
// lançasse gravaria só no próprio navegador, achando que gravou no sistema).
// A chave publicada precisa ser a pública (anon ou sb_publishable_): a
// service_role/sb_secret_ no config.js daria a qualquer visitante acesso total,
// por cima da RLS.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Confere se a chave pode ir para o navegador. Devolve '' ou o motivo da recusa. */
export function problemaNaChave(chave) {
  const k = String(chave ?? '').trim();
  if (!k) return 'chave vazia';
  if (k.startsWith('sb_secret_')) return 'é uma chave secreta (sb_secret_), não a pública';
  if (k.startsWith('sb_publishable_')) return '';
  const partes = k.split('.');
  if (partes.length !== 3) return 'formato desconhecido (esperado JWT anon ou sb_publishable_)';
  let carga;
  try {
    carga = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch {
    return 'JWT ilegível';
  }
  if (carga.role !== 'anon') return `JWT com papel "${carga.role}" (só "anon" pode ser publicado)`;
  return '';
}

export function problemaNaUrl(url) {
  try {
    const u = new URL(String(url ?? '').trim());
    return u.protocol === 'https:' ? '' : 'a URL do Supabase precisa começar com https://';
  } catch {
    return 'URL do Supabase inválida';
  }
}

/** Conteúdo do config.js para as variáveis dadas (ou erro). */
export function montarConfig({ MODO, SUPABASE_URL, SUPABASE_ANON_KEY }) {
  if (String(MODO ?? '').trim() === 'demo') {
    return { modo: 'demonstração', texto: "window.CONFIG = { modo: 'demo' };\n" };
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Defina SUPABASE_URL e SUPABASE_ANON_KEY (produção) ou MODO=demo (demonstração) nas variáveis do repositório.',
    );
  }
  const erroUrl = problemaNaUrl(SUPABASE_URL);
  if (erroUrl) throw new Error(erroUrl);
  const erroChave = problemaNaChave(SUPABASE_ANON_KEY);
  if (erroChave) throw new Error(`SUPABASE_ANON_KEY recusada: ${erroChave}.`);
  const config = { supabaseUrl: SUPABASE_URL.trim(), supabaseAnonKey: SUPABASE_ANON_KEY.trim() };
  return { modo: 'produção (Supabase)', texto: `window.CONFIG = ${JSON.stringify(config)};\n` };
}

// Execução direta: node scripts/gerar_config.mjs
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { modo, texto } = montarConfig(process.env);
    writeFileSync(new URL('../public/config.js', import.meta.url), texto);
    console.log(`Modo: ${modo}`);
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}
