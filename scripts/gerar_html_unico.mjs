// Gera um único arquivo HTML da demonstração, que abre com dois cliques,
// sem servidor e sem instalar nada (precisa de internet só para o mapa de fundo).
//
//   npm run html  ->  demonstracao/Mapa_de_Obras_SINFRA_DEMO.html
//
// O JavaScript e o CSS vão embutidos na página. O Postgres do navegador
// (PGlite: pglite.wasm, initdb.wasm, pglite.data) e o banco da demonstração
// já montado vão compactados em
// gzip + base64 dentro de <script type="application/octet-stream">, e o
// src/api/demo.js o descompacta ao abrir.
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { gzipSync, constants } from 'node:zlib';
import { join } from 'node:path';
import { raiz, montarBancoDemo } from './banco_demo.mjs';

const saidaTemp = join(raiz, 'dist-html');
const pastaFinal = join(raiz, 'demonstracao');
const arquivoFinal = join(pastaFinal, 'Mapa_de_Obras_SINFRA_DEMO.html');
const pglite = join(raiz, 'node_modules', '@electric-sql', 'pglite', 'dist');

await build({
  root: raiz,
  logLevel: 'warn',
  build: {
    outDir: saidaTemp,
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: false,
    modulePreload: false,
    // embute imagens e fontes pequenas; o WebAssembly vai à parte (abaixo)
    assetsInlineLimit: (arquivo) => !/\.(wasm|data)$/.test(arquivo),
    rollupOptions: { output: { codeSplitting: false } },
  },
});

let html = readFileSync(join(saidaTemp, 'index.html'), 'utf8');

// CSS embutido
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g, (_, caminho) =>
  `<style>\n${readFileSync(join(saidaTemp, caminho), 'utf8')}\n</style>`,
);

// JavaScript embutido (escapando "</script" para não fechar a tag)
let js = '';
html = html.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/, (_, caminho) => {
  js = readFileSync(join(saidaTemp, caminho), 'utf8').replace(/<\/script/gi, '<\\/script');
  return '<!--APP-->';
});
if (!js) throw new Error('Script principal não encontrado no index.html gerado.');

// Marcas (public/marcas/*.png) embutidas: o HTML único não tem a pasta ao lado.
const pastaMarcas = join(raiz, 'public', 'marcas');
for (const nome of readdirSync(pastaMarcas).filter((n) => n.endsWith('.png'))) {
  const dataUri = `data:image/png;base64,${readFileSync(join(pastaMarcas, nome)).toString('base64')}`;
  js = js.split(`marcas/${nome}`).join(dataUri);
}

// Sem config.js: modo demonstração fixo
html = html.replace(/<script src="\.\/config\.js"><\/script>/, `<script>window.CONFIG = { modo: 'demo' };</script>`);

// Banco da demonstração já montado (schema + obras + usuários), para a primeira
// abertura não ter de criar um Postgres do zero (era a etapa mais lenta: ~10 s).
const { tar: banco, dia: diaDoBanco, versao } = await montarBancoDemo();

// WebAssembly do Postgres e banco, compactados
const embutir = (id, bytes, atributos = '') => {
  const b64 = gzipSync(bytes, { level: constants.Z_BEST_COMPRESSION }).toString('base64');
  return `<script id="${id}" type="application/octet-stream"${atributos}>${b64}</script>`;
};
const dados = [
  embutir('pglite-wasm', readFileSync(join(pglite, 'pglite.wasm'))),
  embutir('pglite-initdb', readFileSync(join(pglite, 'initdb.wasm'))),
  embutir('pglite-data', readFileSync(join(pglite, 'pglite.data'))),
  embutir('pglite-banco', banco, ` data-dia="${diaDoBanco}" data-versao="${versao}"`),
  // worker do mapa vetorial: o Vite o gera como arquivo à parte em assets/,
  // e o navegador não abre worker de arquivo local (src/lib/mapa.js o lê daqui)
  ...readdirSync(join(saidaTemp, 'assets'))
    .filter((nome) => /worker.*\.js$/.test(nome))
    .slice(0, 1)
    .map((nome) => embutir('maplibre-worker', readFileSync(join(saidaTemp, 'assets', nome)))),
].join('\n');

// Função de substituição: o código tem "$&", "$'" etc., que um texto de
// substituição comum interpretaria como padrões.
html = html.replace('<!--APP-->', () => `${dados}\n<script type="module">\n${js}\n</script>`);

mkdirSync(pastaFinal, { recursive: true });
writeFileSync(arquivoFinal, html);
rmSync(saidaTemp, { recursive: true, force: true });

const mb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(1);
console.log(`Gerado: ${arquivoFinal} (${mb} MB)`);
