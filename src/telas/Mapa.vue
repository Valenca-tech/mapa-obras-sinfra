<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute } from 'vue-router';
import L from 'leaflet';
import {
  estado, pode, obrasFiltradas, obrasComSituacao, recarregarObras, recarregarInstalacoes, nomeTipoInstalacao,
  avisar, quantidadeDeFiltros, limparFiltros,
} from '../estado.js';
import { LISTA_SITUACOES } from '../lib/situacao.js';
import { CENTRO_IMPERATRIZ, camadaBase, iconePino, iconeInstalacao, svgInstalacao, escapar } from '../lib/mapa.js';
import {
  segmentosDoTrecho, distanciaAteObra, comprimentoTrecho, formatarExtensao, RAIO_PROXIMIDADE_M,
} from '../lib/geo.js';
import { pct } from '../lib/formato.js';
import Totais from '../componentes/Totais.vue';
import Filtros from '../componentes/Filtros.vue';

// Traço da linha do trecho, além da cor: paralisada tracejada, não iniciada pontilhada.
const TRACO = { paralisada: '12 9', nao_iniciada: '1 9' };

const rota = useRoute();
const el = ref(null);
const filtrosAbertos = ref(false);
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
      `<strong>${escapar(o.nome)}</strong><br>${escapar(o.bairro ?? '')} · ` +
      `<span style="color:${s.texto};font-weight:700">${s.rotulo}</span> · ${pct(s.executado)}` +
      (extensao ? ` · trecho de ${extensao}` : '');
    const abrir = () => (estado.obraAberta = o.id);

    const linhas = [];
    for (const seg of segmentosDoTrecho(o.trecho)) {
      const casco = L.polyline(seg, {
        color: '#ffffff', weight: selecionada ? 13 : 10, opacity: 0.95, lineCap: 'round', lineJoin: 'round',
      });
      const linha = L.polyline(seg, {
        color: s.hex, weight: selecionada ? 8 : 6, opacity: 1, dashArray: TRACO[s.codigo],
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

// Enquadra todas as obras uma vez, só quando o mapa já tem tamanho na tela
// (com a aba em segundo plano o contêiner pode estar com 0 px).
function enquadrar() {
  if (!mapa || enquadrou || !desenhos.size || rota.query.instalacao) return;
  const { x, y } = mapa.getSize();
  if (!x || !y) return;
  mapa.fitBounds(camadaObras.getBounds(), { padding: [40, 40], maxZoom: 15 });
  enquadrou = true;
}

// Leva a obra aberta para a parte do mapa que a ficha não cobre.
function focarObra(id) {
  const d = mapa && id && desenhos.get(id);
  if (!d) return;
  const largo = window.innerWidth > 640;
  const zoom = Math.max(mapa.getZoom(), 15);
  if (d.linhas.length) {
    const limites = L.featureGroup(d.linhas).getBounds().extend(d.pino.getLatLng());
    const altura = mapa.getSize().y;
    mapa.fitBounds(limites, {
      paddingTopLeft: [40, 40],
      paddingBottomRight: largo ? [500, 40] : [40, Math.round(altura * 0.6)],
      maxZoom: 17,
    });
    return;
  }
  const ponto = mapa.project(d.pino.getLatLng(), zoom).add([largo ? 230 : 0, largo ? 0 : 160]);
  mapa.setView(mapa.unproject(ponto, zoom), zoom, { animate: true });
}

// ---------------------------------------------------------------- instalações públicas

function itemObra(o, extra = '') {
  const s = o.situacao;
  return (
    `<li><button type="button" class="balao__obra" data-obra="${escapar(o.id)}">` +
    `<i style="background:${s.hex}">${s.simbolo}</i>` +
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
  if (!estado.mostrarInstalacoes) return;
  for (const i of estado.instalacoes) {
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
  // À esquerda: no computador a ficha da obra ocupa a direita da tela.
  L.control.zoom({ position: 'topleft' }).addTo(mapa);
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

  if (rota.query.instalacao) estado.mostrarInstalacoes = true;
  desenharInstalacoes();
  desenharObras();
  try {
    await Promise.all([recarregarObras(), recarregarInstalacoes()]);
  } catch (e) {
    avisar(e.message, 'erro'); // segue com o que já estava carregado
  }
  if (!mapa) return; // saiu da tela antes de a recarga terminar
  desenharInstalacoes(); // já com a lista nova, antes de abrir o balão
  abrirInstalacaoDaRota();
  // Vindo do cadastro ou da edição com a ficha já aberta: leva o mapa até a obra.
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
watch(() => [estado.instalacoes, estado.mostrarInstalacoes], desenharInstalacoes);
// Já no mapa e veio outro ?instalacao= (link da ficha): a tela não remonta.
watch(
  () => rota.query.instalacao,
  (id) => {
    if (!id) return;
    if (!estado.mostrarInstalacoes) estado.mostrarInstalacoes = true;
    // espera a camada ser redesenhada antes de abrir o balão
    setTimeout(abrirInstalacaoDaRota);
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
  <div :class="['tela-mapa', estado.obraAberta && 'tela-mapa--com-ficha']">
    <div class="tela-mapa__painel">
      <Totais />
      <div class="tela-mapa__linha">
        <button class="btn tela-mapa__botao-filtros" :aria-expanded="filtrosAbertos" @click="filtrosAbertos = !filtrosAbertos">
          Filtros<template v-if="quantidadeDeFiltros"> ({{ quantidadeDeFiltros }})</template>
        </button>
        <button
          v-if="quantidadeDeFiltros && !filtrosAbertos"
          type="button"
          class="btn btn--link tela-mapa__limpar"
          @click="limparFiltros"
        >
          Limpar
        </button>
        <div :class="['tela-mapa__filtros', filtrosAbertos && 'aberto']"><Filtros /></div>
        <div class="acoes tela-mapa__acoes">
          <RouterLink to="/lista" class="btn">Ver em lista</RouterLink>
          <RouterLink to="/relatorio" class="btn">Imprimir relatório</RouterLink>
          <RouterLink v-if="pode('obra.cadastrar')" to="/obras/nova" class="btn btn--primario">+ Nova obra</RouterLink>
        </div>
      </div>
    </div>
    <div class="tela-mapa__mapa">
      <div ref="el" class="tela-mapa__leaflet" role="region" aria-label="Mapa das obras de Imperatriz"></div>
      <label class="tela-mapa__camada" title="Escolas, praças, unidades de saúde e prédios da Prefeitura">
        <input v-model="estado.mostrarInstalacoes" type="checkbox" />
        <span class="instalacao instalacao--mini" aria-hidden="true" v-html="svgInstalacao('sede')"></span>
        Instalações públicas <span class="mudo">({{ estado.instalacoes.length }})</span>
      </label>
      <p v-if="!obrasFiltradas.length" class="tela-mapa__vazio">Nenhuma obra com estes filtros.</p>
    </div>
  </div>
</template>

<style scoped>
.tela-mapa {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.tela-mapa__painel {
  padding: 12px 16px 10px;
  background: var(--superficie);
  border-bottom: 1px solid var(--borda);
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 2;
}
.tela-mapa__linha {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}
.tela-mapa__filtros {
  flex: 1 1 520px;
}
.tela-mapa__botao-filtros,
.tela-mapa__limpar {
  display: none;
}
/* Computador com a ficha aberta (460 px à direita): painel e controles do
   mapa saem de baixo dela. */
@media (min-width: 641px) {
  .tela-mapa--com-ficha .tela-mapa__painel {
    padding-right: 476px;
  }
  .tela-mapa--com-ficha .tela-mapa__camada {
    right: 470px;
  }
  .tela-mapa--com-ficha :deep(.leaflet-right) {
    right: 460px;
  }
}
.tela-mapa__camada {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 500;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 0.86rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  padding: 7px 10px;
  background: rgba(255, 255, 255, 0.96);
  border-radius: var(--raio-p);
  box-shadow: var(--sombra);
}
.tela-mapa__camada input {
  width: 18px;
  height: 18px;
}
.tela-mapa__mapa {
  flex: 1;
  position: relative;
  min-height: 420px;
}
.tela-mapa__leaflet {
  position: absolute;
  inset: 0;
}
.tela-mapa__vazio {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 500;
  margin: 0;
  background: var(--superficie);
  padding: 8px 14px;
  border-radius: var(--raio);
  box-shadow: var(--sombra);
}
.tela-mapa :deep(.legenda) {
  background: rgba(255, 255, 255, 0.95);
  border-radius: var(--raio-p);
  box-shadow: var(--sombra);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.8rem;
}
.tela-mapa :deep(.legenda__itens) {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tela-mapa :deep(.legenda--fechada .legenda__itens) {
  display: none;
}
.tela-mapa :deep(.legenda__botao) {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-weight: 700;
  font-size: 0.78rem;
  color: var(--texto-2);
  text-align: left;
  cursor: pointer;
}
.tela-mapa :deep(.legenda__botao)::after {
  content: ' ▾';
}
.tela-mapa :deep(.legenda--fechada .legenda__botao)::after {
  content: ' ▸';
}
.tela-mapa :deep(.legenda span) {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tela-mapa :deep(.legenda i) {
  font-style: normal;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.tela-mapa :deep(.legenda__sep) {
  margin-top: 3px;
  padding-top: 5px;
  border-top: 1px solid var(--borda);
}
.tela-mapa :deep(.legenda__linha) {
  display: inline-block;
  width: 18px;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(90deg, #b91c1c 0 50%, #0f9d7a 50% 100%);
  box-shadow: 0 0 0 2px #fff, 0 0 0 3px var(--borda-forte);
}
@media (pointer: coarse) {
  .tela-mapa :deep(.legenda__botao) {
    min-height: 44px;
    padding: 0 6px;
  }
}
@media (max-width: 760px) {
  .tela-mapa__botao-filtros,
  .tela-mapa__limpar {
    display: inline-flex;
  }
  .tela-mapa__filtros {
    display: none;
    flex-basis: 100%;
    order: 3;
  }
  .tela-mapa__filtros.aberto {
    display: block;
  }
  .tela-mapa__acoes {
    flex: 1;
    justify-content: flex-end;
  }
  .tela-mapa__acoes .btn {
    padding: 6px 10px;
    font-size: 0.85rem;
  }
  .tela-mapa__mapa {
    min-height: 60dvh;
  }
}
</style>
