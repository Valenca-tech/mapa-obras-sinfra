// Depois do `vite build`: grava em dist/demo/ o banco da demonstração já
// montado, para o site publicado em modo demonstração abrir rápido.
//
//   dist/demo/banco.pgdata   diretório de dados do Postgres (PGlite), tar + gzip.
//                            Extensão neutra para nenhum servidor descompactar no caminho.
//   dist/demo/banco.json     { "dia": "AAAA-MM-DD", "versao": "..." } dia em que as
//                            datas foram calculadas e versão do conteúdo
//
// O src/api/demo.js só baixa estes arquivos na primeira visita de cada
// navegador; depois o banco fica no IndexedDB.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, constants } from 'node:zlib';
import { raiz, montarBancoDemo } from './banco_demo.mjs';

const pasta = join(raiz, 'dist', 'demo');
const { tar, dia, versao } = await montarBancoDemo();
mkdirSync(pasta, { recursive: true });
const gz = gzipSync(tar, { level: constants.Z_BEST_COMPRESSION });
writeFileSync(join(pasta, 'banco.pgdata'), gz);
writeFileSync(join(pasta, 'banco.json'), JSON.stringify({ dia, versao }));
console.log(`Banco da demonstração: dist/demo/banco.pgdata (${(gz.length / 1024 / 1024).toFixed(1)} MB), dia ${dia}, versão ${versao}`);
