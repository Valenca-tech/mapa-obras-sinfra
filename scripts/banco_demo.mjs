// Monta o banco da demonstração (schema + obras + usuários) num Postgres em
// memória e devolve o diretório de dados em .tar, para o navegador carregar
// pronto em vez de criar um Postgres do zero (a etapa mais lenta: ~10 s).
// Usado pelo HTML único e pelo site publicado.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { popularDemonstracao, versaoDemo } from '../src/api/demo_dados.js';
import { hojeEmImperatriz } from '../src/lib/situacao.js';

export const raiz = fileURLToPath(new URL('..', import.meta.url));

/**
 * @returns {Promise<{ tar: Buffer, dia: string, versao: string }>}
 *   dia = 'AAAA-MM-DD' em que as datas do seed foram calculadas;
 *   versao = versaoDemo() do conteúdo, igual à que o navegador calcula.
 */
export async function montarBancoDemo() {
  const lerSql = (nome) => readFileSync(join(raiz, 'supabase', nome), 'utf8');
  const fontes = {
    shim: lerSql('test/shim_supabase.sql'),
    schema: lerSql('schema.sql'),
    seed: lerSql('seed_demo.sql'),
    instalacoes: lerSql('instalacoes_iniciais.sql'),
  };
  const db = new PGlite();
  await popularDemonstracao(db, fontes);
  const dia = hojeEmImperatriz();
  const tar = Buffer.from(await (await db.dumpDataDir('none')).arrayBuffer());
  await db.close();
  return { tar, dia, versao: versaoDemo(fontes) };
}
