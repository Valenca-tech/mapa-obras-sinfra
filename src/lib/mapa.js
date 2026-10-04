// Peças de mapa compartilhadas (Leaflet).
//
// Mapa de fundo: OpenFreeMap (vetorial, dados do OpenStreetMap), sem chave nem
// cadastro e com uso por governo permitido. Por ser vetorial, a camada de
// pontos de interesse (igrejas, comércio, bancos...) é retirada: no mapa só
// ficam ruas, bairros, parques e água, e o destaque vai para obras e
// instalações públicas. Sem WebGL, ou se o OpenFreeMap não responder, cai no
// mapa padrão do OpenStreetMap (com os pontos de interesse).
import L from 'leaflet';

export const CENTRO_IMPERATRIZ = [-5.526, -47.49];

const ESTILO_VETORIAL = 'https://tiles.openfreemap.org/styles/liberty';
const ATRIBUICAO_VETORIAL =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '© <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · ' +
  'dados © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores do OpenStreetMap</a>';

function camadaRaster() {
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>',
  });
}

function temWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// No HTML único o worker do MapLibre vem embutido na página (gzip + base64),
// porque o navegador não abre worker de arquivo local.
async function workerEmbutido() {
  const el = document.getElementById('maplibre-worker');
  if (!el) return null;
  const resposta = await fetch(`data:application/octet-stream;base64,${el.textContent.trim()}`);
  const codigo = await new Response(resposta.body.pipeThrough(new DecompressionStream('gzip'))).text();
  return URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }));
}

// Pedido com prazo: conexão pendurada não deixa o mapa sem fundo por minutos.
function comPrazo(ms) {
  if (AbortSignal.timeout) return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

// Carrega uma vez (biblioteca, worker e estilo) e devolve uma fábrica de camadas.
let fabricaVetorial;
function carregarVetorial() {
  fabricaVetorial ??= (async () => {
    const [maplibregl, plugin, worker, estilo, embutido] = await Promise.all([
      import('maplibre-gl'),
      import('@maplibre/maplibre-gl-leaflet'),
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
      fetch(ESTILO_VETORIAL, { signal: comPrazo(8000) }).then((r) => {
        if (!r.ok) throw new Error(`estilo do mapa indisponível (${r.status})`);
        return r.json();
      }),
      workerEmbutido(),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ]);
    maplibregl.setWorkerUrl(embutido ?? worker.default);
    // fora: pontos de interesse, prédios em 3D e placas de rodovia (inexistentes aqui)
    estilo.layers = estilo.layers.filter(
      (c) => c['source-layer'] !== 'poi' && c.id !== 'building-3d' && !c.id.includes('shield'),
    );
    return () => plugin.maplibreGL({ style: structuredClone(estilo), attribution: ATRIBUICAO_VETORIAL });
  })();
  return fabricaVetorial;
}

// O estilo carregou mas os tiles falham (servidor fora do ar): depois de
// algumas falhas sem nenhum tile carregado, troca pelo mapa padrão do OSM.
function vigiarFalhas(grupo, camada) {
  const gl = camada.getMaplibreMap?.();
  if (!gl) return;
  let falhas = 0;
  let carregou = false;
  gl.on('data', (e) => {
    if (e.dataType === 'source' && e.tile) carregou = true;
  });
  gl.on('error', (e) => {
    if (carregou || ++falhas < 3 || !grupo.hasLayer(camada)) return;
    console.warn('Mapa vetorial sem resposta; usando o mapa padrão do OpenStreetMap.', e?.error);
    grupo.removeLayer(camada);
    grupo.addLayer(camadaRaster());
  });
}

/**
 * Mapa de fundo. Devolve na hora uma camada que se completa quando o mapa
 * vetorial carrega. Obs.: o MapLibre aplica o estilo no próximo quadro de
 * animação; com a aba em segundo plano o navegador pausa os quadros, e o fundo
 * só aparece quando a aba fica visível (comportamento normal).
 */
export function camadaBase() {
  const grupo = L.layerGroup();
  grupo.on('add', () => {
    if (grupo.getLayers().length) return;
    if (!temWebGL()) {
      grupo.addLayer(camadaRaster());
      return;
    }
    carregarVetorial()
      .then((criar) => {
        const camada = criar();
        grupo.addLayer(camada);
        vigiarFalhas(grupo, camada);
      })
      .catch((e) => {
        console.warn('Mapa vetorial indisponível; usando o mapa padrão do OpenStreetMap.', e);
        fabricaVetorial = undefined;
        grupo.addLayer(camadaRaster());
      });
  });
  return grupo;
}

/** Pino colorido com símbolo: cor e forma, para não depender só da cor. */
export function iconePino(cor, simbolo, selecionado = false) {
  return L.divIcon({
    className: '',
    html: `<div class="pino${selecionado ? ' pino--selecionado' : ''}" style="--cor:${cor}"><span>${simbolo}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 36], // a ponta do pino girado fica 21 px abaixo do centro
    tooltipAnchor: [0, -34], // relativo à ponta: abre acima do pino
  });
}

/**
 * Vértice editável do trecho (formulário): ponto visível de 16 px no centro de
 * uma área de toque maior (40 px no celular, onde o dedo erra o ponto pequeno).
 */
export function iconeVertice(ativo = false) {
  const toque = window.matchMedia?.('(pointer: coarse)').matches ? 40 : 24;
  return L.divIcon({
    className: '',
    html: `<div class="vertice${ativo ? ' vertice--ativo' : ''}" style="width:${toque}px;height:${toque}px"><i></i></div>`,
    iconSize: [toque, toque],
    iconAnchor: [toque / 2, toque / 2],
  });
}

// Ícones das instalações públicas: traço branco sobre quadrado azul-escuro,
// forma diferente do pino das obras para não confundir.
const TRACOS = {
  sede: '<path d="M3 7.5 9 4l6 3.5M4.5 8v6M7.5 8v6M10.5 8v6M13.5 8v6M3 14.5h12"/>',
  patio: '<path d="M2.5 12V7h7.5v5M10 9h3l2 2v1M2.5 12h12.5"/><circle cx="5.5" cy="13" r="1.3"/><circle cx="12.5" cy="13" r="1.3"/>',
  usina: '<path d="M3 15V9l3.5 2V9l3.5 2V5.5h2.5V15zM3 15h12"/>',
  almoxarifado: '<path d="M3 6.5 9 3.5l6 3V14l-6 2.5L3 14zM3 6.5l6 3 6-3M9 9.5v7"/>',
  escola: '<path d="M2 7.5 9 4.5l7 3-7 3zM5 9v3.5c2.5 1.8 5.5 1.8 8 0V9"/>',
  saude: '<path d="M7 3.5h4v3.5h3.5v4H11v3.5H7V11H3.5V7H7z"/>',
  praca: '<path d="M9 15.5V10M5.5 10a3.5 3.5 0 1 1 7 0zM6 15.5h6"/>',
  outra: '<circle cx="9" cy="9" r="3"/>',
};

export function svgInstalacao(tipo) {
  return `<svg viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${TRACOS[tipo] ?? TRACOS.outra}</svg>`;
}

export function iconeInstalacao(tipo, selecionada = false) {
  return L.divIcon({
    className: '',
    html: `<div class="instalacao${selecionada ? ' instalacao--selecionada' : ''}">${svgInstalacao(tipo)}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    tooltipAnchor: [0, -14],
    popupAnchor: [0, -14],
  });
}

const ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escapa texto do usuário antes de montar HTML de dica ou balão do Leaflet. */
export const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPE[c]);
