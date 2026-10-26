<script setup>
// Vista em mapa da tela Obras. Clicar numa obra seleciona (?obra=id) e abre a
// prévia à direita; a página completa da obra fica a um clique ("Abrir obra").
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute } from 'vue-router';
import L from 'leaflet';
import {
  estado, obrasFiltradas, obrasComSituacao, recarregarInstalacoes, nomeTipoInstalacao, avisar,
  instalacoesVisiveis, mostrarTipoInstalacao,
} from '../estado.js';
import { LISTA_SITUACOES } from '../lib/situacao.js';
import { CENTRO_IMPERATRIZ, camadaBase, iconePino, iconeInstalacao, svgInstalacao, escapar } from '../lib/mapa.js';
import {
  segmentosDoTrecho, distanciaAteObra, comprimentoTrecho, formatarExtensao, RAIO_PROXIMIDADE_M,
} from '../lib/geo.js';
import { pct } from '../lib/formato.js';
import CamadaInstalacoes from './CamadaInstalacoes.vue';
import PreviaObra from './PreviaObra.vue';

// Traço da linha do trecho, além da cor: paralisada tracejada, não iniciada pontilhada.
const TRACO = { paralisada: '12 9', nao_iniciada: '1 9' };
const LARGURA_PREVIA = 360;

const rota = useRoute();
const el = ref(null);
let mapa;
let camadaObras;
let camadaInstalacoes;
const desenhos = new Map(); // id da obra -> { pino, linhas }
const marcadoresInstalacao = new Map();
let enquadrou = false;
let observador;

// ---------------------------------------------------------------- obras

function desenharObras() {
  if (!mapa) return;
  camadaObras.clearLayers();
  desenhos.clear();
  for (const o of obrasFiltradas.value) {
    const s = o.situacao;
    const selecionada = o.id === estado.obraAberta;
    const extensao = o.trecho ? formatarExtensao(comprimentoTrecho(o.trecho)) : '';
    const dica =
      `<strong>${escapar(o.nome)}</strong><br>${escapar(o.bairro ?? '')} · ${s.rotulo} · ${pct(s.executado)}` +
      (extensao ? ` · trecho de ${extensao}` : '');
    const abrir = () => (estado.obraAberta = o.id);

    const linhas = [];
    for (const seg of segmentosDoTrecho(o.trecho)) {
      const casco = L.polyline(seg, {
        color: '#ffffff', weight: selecionada ? 12 : 9, opacity: 0.95, lineCap: 'round', lineJoin: 'round',
      });
      const linha = L.polyline(seg, {
        color: s.hex, weight: selecionada ? 7 : 5, opacity: 1, dashArray: TRACO[s.codigo],
        lineCap: s.codigo === 'nao_iniciada' ? 'round' : 'butt', lineJoin: 'round',
      });
      for (const l of [casco, linha]) {
        l.on('click', abrir).bindTooltip(dica, { className: 'dica-obra', sticky: true }).addTo(camadaObras);
        linhas.push(l);
      }
    }

    const pino = L.marker([o.latitude, o.longitude], {
      icon: iconePino(s.hex, s.simbolo, selecionada),
      title: `${o.nome}: ${s.rotulo}`,
      alt: `${o.nome}: ${s.rotulo}`,
      riseOnHover: true,
      zIndexOffset: selecionada ? 1000 : s.ordem === 1 ? 500 : 0,
    })
      .bindTooltip(dica, { className: 'dica-obra', direction: 'top' })
      .on('click', abrir)
      .addTo(camadaObras);
    desenhos.set(o.id, { pino, linhas });
  }
  enquadrar();
}

// Enquadra todas as obras uma vez, só quando o mapa já tem tamanho na tela.
function enquadrar() {
  if (!mapa || enquadrou || !desenhos.size || rota.query.instalacao) return;
  const { x, y } = mapa.getSize();
  if (!x || !y) return;
  mapa.fitBounds(camadaObras.getBounds(), { padding: [40, 40], maxZoom: 15 });
  enquadrou = true;
}

// Leva a obra selecionada para a parte do mapa que a prévia não cobre.
function focarObra(id) {
  const d = mapa && id && desenhos.get(id);
  if (!d) return;
  const largo = window.innerWidth > 760;
  const zoom = Math.max(mapa.getZoom(), 15);
  if (d.linhas.length) {
    const limites = L.featureGroup(d.linhas).getBounds().extend(d.pino.getLatLng());
    const altura = mapa.getSize().y;
    mapa.fitBounds(limites, {
      paddingTopLeft: [40, 40],
      paddingBottomRight: largo ? [LARGURA_PREVIA + 40, 40] : [40, Math.round(altura * 0.55)],
      maxZoom: 17,
    });
    return;
  }
  const ponto = mapa.project(d.pino.getLatLng(), zoom).add([largo ? LARGURA_PREVIA / 2 : 0, largo ? 0 : 140]);
  mapa.setView(mapa.unproject(ponto, zoom), zoom, { animate: true });
}

// ---------------------------------------------------------------- instalações públicas

function itemObra(o, extra = '') {
  const s = o.situacao;
  return (
    `<li><button type="button" class="balao__obra" data-obra="${escapar(o.id)}">` +
    `<i style="background:${s.hex}" aria-hidden="true"></i>` +
    `<span><strong>${escapar(o.nome)}</strong><small>${s.rotulo} · ${pct(s.executado)}${extra}</small></span>` +
    `</button></li>`
  );
}

function conteudoBalao(i) {
  const centro = [i.latitude, i.longitude];
  const vinculadas = obrasComSituacao.value.filter((o) => o.instalacao_id === i.id);
  const proximas = obrasComSituacao.value
    .filter((o) => o.instalacao_id !== i.id)
    .map((o) => ({ o, d: distanciaAteObra(centro, o) }))
    .filter((x) => x.d <= RAIO_PROXIMIDADE_M)
    .sort((a, b) => a.d - b.d);

  const div = L.DomUtil.create('div', 'balao');
  div.innerHTML =
    `<header class="balao__topo"><span class="instalacao">${svgInstalacao(i.tipo)}</span>` +
    `<span><strong>${escapar(i.nome)}</strong><small>${escapar(nomeTipoInstalacao(i.tipo))}</small></span></header>` +
    ([i.endereco, i.bairro].some(Boolean) ? `<p class="balao__end">${escapar([i.endereco, i.bairro].filter(Boolean).join(' · '))}</p>` : '') +
    (vinculadas.length ? `<h4>Obras nesta instalação</h4><ul>${vinculadas.map((o) => itemObra(o)).join('')}</ul>` : '') +
    `<h4>Obras a até ${RAIO_PROXIMIDADE_M} m</h4>` +
    (proximas.length
      ? `<ul>${proximas.map(({ o, d }) => itemObra(o, ` · a ${formatarExtensao(d) || 'menos de 1 m'}`)).join('')}</ul>`
      : '<p class="balao__vazio">Nenhuma obra ativa por perto.</p>') +
    (i.observacao ? `<p class="balao__obs">${escapar(i.observacao)}</p>` : '');
  L.DomEvent.disableClickPropagation(div);
  div.addEventListener('click', (e) => {
    const b = e.target.closest('[data-obra]');
    if (!b) return;
    mapa.closePopup();
    estado.obraAberta = b.dataset.obra;
  });
  return div;
}

function desenharInstalacoes() {
  if (!mapa) return;
  camadaInstalacoes.clearLayers();
  marcadoresInstalacao.clear();
  for (const i of instalacoesVisiveis.value) {
    const m = L.marker([i.latitude, i.longitude], {
      icon: iconeInstalacao(i.tipo),
      title: `${i.nome} (${nomeTipoInstalacao(i.tipo)})`,
      alt: i.nome,
      zIndexOffset: -600,
    })
      .bindTooltip(`<strong>${escapar(i.nome)}</strong><br>${escapar(nomeTipoInstalacao(i.tipo))}`, {
        className: 'dica-obra',
        direction: 'top',
      })
      .bindPopup(() => conteudoBalao(i), { maxWidth: 320, minWidth: 240, className: 'balao-instalacao' })
      .addTo(camadaInstalacoes);
    marcadoresInstalacao.set(i.id, m);
  }
}

// Instalação pedida no endereço (?instalacao=id) aparece mesmo se o tipo dela
// estiver escondido no filtro da camada.
function revelarInstalacaoDaRota() {
  const id = rota.query.instalacao;
  const i = id && estado.instalacoes.find((x) => x.id === String(id));
  if (i) mostrarTipoInstalacao(i.tipo);
}

// Vindo da tela Instalações (?instalacao=id): centraliza e abre o balão.
function abrirInstalacaoDaRota() {
  const id = rota.query.instalacao;
  const m = mapa && id && marcadoresInstalacao.get(String(id));
  if (!m) return;
  mapa.setView(m.getLatLng(), 16);
  m.openPopup();
  enquadrou = true;
}

// ---------------------------------------------------------------- ciclo de vida

onMounted(async () => {
  mapa = L.map(el.value, { zoomControl: false }).setView(CENTRO_IMPERATRIZ, 13);
  L.control.zoom({ position: 'bottomright' }).addTo(mapa);
  camadaBase().addTo(mapa);
  camadaInstalacoes = L.featureGroup().addTo(mapa);
  camadaObras = L.featureGroup().addTo(mapa);

  const legenda = L.control({ position: 'bottomleft' });
  legenda.onAdd = () => {
    // No celular começa recolhida: aberta, cobriria metade do mapa.
    const fechada = window.innerWidth < 640;
    const div = L.DomUtil.create('div', `legenda${fechada ? ' legenda--fechada' : ''}`);
    div.innerHTML =
      `<button type="button" class="legenda__botao" aria-expanded="${!fechada}">Legenda</button>` +
      '<div class="legenda__itens">' +
      LISTA_SITUACOES.map((s) => `<span><i style="background:${s.hex}">${s.simbolo}</i>${s.rotulo}</span>`).join('') +
      '<span class="legenda__sep"><b class="legenda__linha"></b>Trecho de via</span>' +
      `<span><b class="instalacao instalacao--mini">${svgInstalacao('sede')}</b>Instalação pública</span>` +
      '</div>';
    L.DomEvent.disableClickPropagation(div);
    div.querySelector('.legenda__botao').addEventListener('click', (e) => {
      const aberta = div.classList.toggle('legenda--fechada') === false;
      e.currentTarget.setAttribute('aria-expanded', String(aberta));
    });
    return div;
  };
  legenda.addTo(mapa);

  observador = new ResizeObserver(() => {
    if (!mapa) return;
    mapa.invalidateSize();
    enquadrar();
  });
  observador.observe(el.value);

  revelarInstalacaoDaRota();
  desenharInstalacoes();
  desenharObras();
  try {
    await recarregarInstalacoes();
  } catch (e) {
    avisar(e.message, 'erro'); // segue com o que já estava carregado
  }
  if (!mapa) return; // saiu da tela antes de a recarga terminar
  revelarInstalacaoDaRota();
  desenharInstalacoes();
  abrirInstalacaoDaRota();
  if (estado.obraAberta) {
    desenharObras();
    focarObra(estado.obraAberta);
  }
});
onBeforeUnmount(() => {
  observador?.disconnect();
  mapa?.remove();
  mapa = null; // as guardas "if (!mapa)" passam a valer para o que chegar depois
});

watch(obrasFiltradas, desenharObras);
watch(instalacoesVisiveis, desenharInstalacoes);
watch(
  () => rota.query.instalacao,
  (id) => {
    if (!id) return;
    revelarInstalacaoDaRota();
    setTimeout(abrirInstalacaoDaRota); // espera a camada ser redesenhada
  },
);
watch(
  () => estado.obraAberta,
  (id) => {
    desenharObras();
    focarObra(id);
  },
);
</script>

<template>
  <div class="mapa-obras">
    <div ref="el" class="mapa-obras__leaflet" role="region" aria-label="Mapa das obras de Imperatriz"></div>
    <CamadaInstalacoes class="mapa-obras__camada" />
    <p v-if="!obrasFiltradas.length" class="mapa-obras__vazio">Nenhuma obra com estes filtros.</p>
    <PreviaObra v-if="estado.obraAberta" :key="estado.obraAberta" :id="estado.obraAberta" class="mapa-obras__previa" />
  </div>
</template>

<style scoped>
.mapa-obras {
  position: relative;
  flex: 1;
  min-height: 360px;
}
.mapa-obras__leaflet {
  position: absolute;
  inset: 0;
}
.mapa-obras__camada {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 600;
}
.mapa-obras__previa {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 700;
  width: 360px;
  max-height: calc(100% - 24px);
}
.mapa-obras__vazio {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 500;
  margin: 0;
  background: var(--superficie);
  padding: 7px 12px;
  border: 1px solid var(--borda);
  border-radius: var(--raio);
}
.mapa-obras :deep(.legenda) {
  background: var(--superficie);
  border: 1px solid var(--borda-forte);
  border-radius: var(--raio);
  padding: 7px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.86rem;
}
.mapa-obras :deep(.legenda__itens) {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mapa-obras :deep(.legenda--fechada .legenda__itens) {
  display: none;
}
.mapa-obras :deep(.legenda__botao) {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-weight: 600;
  color: var(--texto-2);
  text-align: left;
  cursor: pointer;
}
.mapa-obras :deep(.legenda span) {
  display: flex;
  align-items: center;
  gap: 7px;
}
.mapa-obras :deep(.legenda i) {
  font-style: normal;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.mapa-obras :deep(.legenda__sep) {
  margin-top: 3px;
  padding-top: 5px;
  border-top: 1px solid var(--borda);
}
.mapa-obras :deep(.legenda__linha) {
  display: inline-block;
  width: 16px;
  height: 5px;
  background: linear-gradient(90deg, #b91c1c 0 50%, #0b7a5e 50% 100%);
}
@media (pointer: coarse) {
  .mapa-obras :deep(.legenda__botao) {
    min-height: 40px;
    padding: 0 6px;
  }
}
/* toque: zoom com os dedos, sem os botões + e − */
@media (pointer: coarse) {
  .mapa-obras :deep(.leaflet-control-zoom) {
    display: none;
  }
}
@media (max-width: 760px) {
  .mapa-obras__previa {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    max-height: 75%;
    z-index: 1100; /* por cima dos controles do mapa enquanto aberta */
  }
}
</style>
