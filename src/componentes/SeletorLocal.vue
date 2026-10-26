<script setup>
// Mapa para marcar onde fica a obra:
//  - Ponto: clique para marcar, arraste o pino para ajustar. Com o ponto já
//    marcado, clique no mapa não move o pino (o clique também serve para ligar
//    o zoom pela roda); "Marcar de novo" libera um novo clique.
//  - Trecho: clique ao longo da via para desenhar; arraste os pontos para
//    ajustar; "Novo segmento" para outra rua da mesma obra. O pino fica
//    sozinho no meio do segmento mais longo.
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import L from 'leaflet';
import { CENTRO_IMPERATRIZ, camadaBase, iconePino, iconeVertice } from '../lib/mapa.js';
import { segmentosDoTrecho, trechoDeSegmentos, comprimentoTrecho, pontoCentral, formatarExtensao } from '../lib/geo.js';

const local = defineModel({ type: Object, default: null }); // { latitude, longitude }
const trecho = defineModel('trecho', { type: Object, default: null }); // GeoJSON ou null
const props = defineProps({
  erro: { type: Boolean, default: false },
  permitirTrecho: { type: Boolean, default: true },
  cor: { type: String, default: '#1e388c' },
});

const el = ref(null);
const localizando = ref(false);
const erroLocalizacao = ref('');
const afastado = ref(true); // zoom baixo demais para desenhar sobre a rua
const ZOOM_DESENHO = 15;
const modo = ref(trecho.value ? 'trecho' : 'ponto');
// Segmentos em edição ([[lat, lng], ...]); o último é o que recebe os cliques.
const segmentos = ref(trecho.value ? segmentosDoTrecho(trecho.value) : [[]]);
if (!segmentos.value.length) segmentos.value = [[]];

let mapa;
let pino;
let camadaTrecho;
let camadaVertices;
let pontoGuardado = null; // ponto marcado antes de passar para o modo trecho

const extensao = computed(() => formatarExtensao(comprimentoTrecho(trechoDeSegmentos(segmentos.value))));
const qtdSegmentos = computed(() => segmentos.value.filter((s) => s.length >= 2).length);
const atual = computed(() => segmentos.value[segmentos.value.length - 1]);
const totalPontos = computed(() => segmentos.value.reduce((n, s) => n + s.length, 0));

const arred = (v) => Number(v.toFixed(6));

// ---------------------------------------------------------------- ponto

function colocarPino(lat, lng, centralizar = false) {
  local.value = { latitude: arred(lat), longitude: arred(lng) };
  desenharPino();
  if (centralizar) mapa.setView([lat, lng], Math.max(mapa.getZoom(), 16));
}

function desenharPino() {
  const p = local.value;
  if (p?.latitude == null) {
    pino?.remove();
    pino = null;
    return;
  }
  if (!pino) {
    pino = L.marker([p.latitude, p.longitude], {
      icon: iconePino(props.cor, '●'),
      keyboard: true,
      title: modo.value === 'ponto' ? 'Local da obra (arraste para ajustar)' : 'Ponto central do trecho',
      zIndexOffset: 500,
    })
      .addTo(mapa)
      .on('dragend', () => {
        const q = pino.getLatLng();
        local.value = { latitude: arred(q.lat), longitude: arred(q.lng) };
      });
  } else {
    pino.setLatLng([p.latitude, p.longitude]);
  }
  // No modo trecho o pino é calculado: não se arrasta.
  if (modo.value === 'ponto') pino.dragging?.enable();
  else pino.dragging?.disable();
}

// ---------------------------------------------------------------- trecho

function emitirTrecho() {
  const geo = trechoDeSegmentos(segmentos.value);
  trecho.value = geo;
  const centro = pontoCentral(segmentos.value);
  if (centro) {
    local.value = { latitude: centro[0], longitude: centro[1] };
  } else {
    // ainda sem segmento completo: sem pino (o formulário pede para terminar)
    local.value = null;
  }
  desenharPino();
}

function desenharTrecho() {
  camadaTrecho.clearLayers();
  camadaVertices.clearLayers();
  segmentos.value.forEach((seg, i) => {
    if (seg.length >= 2) {
      L.polyline(seg, { color: '#ffffff', weight: 9, opacity: 0.9, interactive: false }).addTo(camadaTrecho);
      L.polyline(seg, { color: props.cor, weight: 5, opacity: 1, interactive: false }).addTo(camadaTrecho);
    }
    const ehAtual = i === segmentos.value.length - 1;
    seg.forEach((ponto, j) => {
      const v = L.marker(ponto, {
        icon: iconeVertice(ehAtual && j === seg.length - 1),
        draggable: true,
        keyboard: false,
        title: 'Arraste para ajustar este ponto',
      });
      v.on('drag', (e) => {
        seg[j] = [e.latlng.lat, e.latlng.lng];
        // redesenha só as linhas durante o arraste
        camadaTrecho.clearLayers();
        segmentos.value.forEach((s) => {
          if (s.length >= 2) {
            L.polyline(s, { color: '#ffffff', weight: 9, opacity: 0.9, interactive: false }).addTo(camadaTrecho);
            L.polyline(s, { color: props.cor, weight: 5, interactive: false }).addTo(camadaTrecho);
          }
        });
      });
      v.on('dragend', (e) => {
        const q = e.target.getLatLng();
        seg[j] = [arred(q.lat), arred(q.lng)];
        emitirTrecho();
        desenharTrecho();
      });
      v.addTo(camadaVertices);
    });
  });
}

function adicionarPonto(lat, lng) {
  atual.value.push([arred(lat), arred(lng)]);
  emitirTrecho();
  desenharTrecho();
}

function desfazerPonto() {
  // Logo depois de "Adicionar outra rua", o segmento atual está vazio: desfaz só ele,
  // sem tirar ponto da rua anterior.
  if (atual.value.length) atual.value.pop();
  else if (segmentos.value.length > 1) segmentos.value.pop();
  emitirTrecho();
  desenharTrecho();
}

function novoSegmento() {
  if (atual.value.length >= 2) segmentos.value.push([]);
  desenharTrecho();
}

function limparTrecho() {
  if (totalPontos.value && !confirm('Apagar todo o trecho desenhado?')) return;
  segmentos.value = [[]];
  emitirTrecho();
  desenharTrecho();
}

function enquadrarTrecho() {
  const pontos = segmentos.value.flat();
  if (pontos.length >= 2) mapa.fitBounds(L.latLngBounds(pontos), { padding: [30, 30], maxZoom: 17 });
  else if (pontos.length === 1) mapa.setView(pontos[0], Math.max(mapa.getZoom(), 16));
}

// ---------------------------------------------------------------- modo

function trocarModo(novo) {
  if (novo === modo.value) return;
  if (novo === 'trecho') {
    // começa um trecho novo; o pino some até o primeiro segmento ficar completo.
    // O ponto marcado fica guardado para quem voltar para "Ponto".
    pontoGuardado = local.value?.latitude != null ? { ...local.value } : null;
    segmentos.value = [[]];
    local.value = null;
  } else {
    if (qtdSegmentos.value) {
      if (!confirm('Trocar para ponto apaga o trecho desenhado. O pino fica no meio do trecho. Continuar?')) return;
      // local já é o meio do trecho
    } else {
      local.value = pontoGuardado; // nada desenhado: volta o ponto de antes
    }
    segmentos.value = [[]];
    trecho.value = null;
  }
  modo.value = novo;
  desenharTrecho();
  desenharPino();
}

/** Libera um novo clique para marcar o ponto (o clique não move pino já marcado). */
function remarcar() {
  local.value = null;
  desenharPino();
}

// ---------------------------------------------------------------- ciclo de vida

onMounted(() => {
  // Roda do mouse só dá zoom depois de clicar no mapa: antes disso ela rola a
  // página do formulário, como a pessoa espera.
  mapa = L.map(el.value, { zoomControl: true, doubleClickZoom: false, scrollWheelZoom: false }).setView(
    CENTRO_IMPERATRIZ,
    13,
  );
  mapa.on('click focus', () => mapa.scrollWheelZoom.enable());
  mapa.on('mouseout blur', () => mapa.scrollWheelZoom.disable());
  mapa.on('zoomend', () => (afastado.value = mapa.getZoom() < ZOOM_DESENHO));
  afastado.value = mapa.getZoom() < ZOOM_DESENHO;
  camadaBase().addTo(mapa);
  camadaTrecho = L.layerGroup().addTo(mapa);
  camadaVertices = L.layerGroup().addTo(mapa);
  mapa.on('click', (e) => {
    if (modo.value === 'trecho') {
      // Com o mapa afastado, o primeiro clique aproxima até as ruas em vez de
      // marcar um ponto impreciso.
      if (!totalPontos.value && mapa.getZoom() < ZOOM_DESENHO) {
        mapa.setView(e.latlng, 17);
        return;
      }
      adicionarPonto(e.latlng.lat, e.latlng.lng);
    } else if (local.value?.latitude == null) colocarPino(e.latlng.lat, e.latlng.lng);
  });
  desenharTrecho();
  desenharPino();
  if (modo.value === 'trecho' && totalPontos.value) enquadrarTrecho();
  else if (local.value?.latitude != null) mapa.setView([local.value.latitude, local.value.longitude], 16);
});
onBeforeUnmount(() => {
  mapa?.remove();
  mapa = null; // respostas que chegam depois (GPS) não mexem no mapa removido
});

// O formulário carrega a obra depois de montar: acompanha o valor inicial.
watch(local, (v) => {
  if (!mapa) return;
  if (v?.latitude != null && pino) {
    const p = pino.getLatLng();
    if (p.lat !== v.latitude || p.lng !== v.longitude) pino.setLatLng([v.latitude, v.longitude]);
  } else desenharPino();
});
watch(trecho, (t) => {
  if (!mapa) return;
  const atualGeo = trechoDeSegmentos(segmentos.value);
  if (JSON.stringify(atualGeo) === JSON.stringify(t ?? null)) return;
  segmentos.value = t ? segmentosDoTrecho(t) : [[]];
  if (!segmentos.value.length) segmentos.value = [[]];
  if (t) modo.value = 'trecho';
  desenharTrecho();
  desenharPino();
  enquadrarTrecho();
});

const ERRO_GPS = {
  1: 'A localização foi bloqueada. Libere a localização para este site nas configurações do navegador.',
  2: 'Não foi possível obter a localização (GPS desligado ou sem sinal).',
  3: 'A localização demorou demais. Tente de novo em local aberto.',
};

function minhaLocalizacao() {
  erroLocalizacao.value = '';
  if (!navigator.geolocation) {
    erroLocalizacao.value = 'Este navegador não informa a localização. Marque o ponto no mapa.';
    return;
  }
  localizando.value = true;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      localizando.value = false;
      if (!mapa) return; // saiu do formulário antes da resposta
      if (modo.value === 'trecho') {
        mapa.setView([pos.coords.latitude, pos.coords.longitude], 17);
      } else {
        colocarPino(pos.coords.latitude, pos.coords.longitude, true);
      }
    },
    (e) => {
      localizando.value = false;
      erroLocalizacao.value = ERRO_GPS[e?.code] ?? ERRO_GPS[2];
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}
</script>

<template>
  <div :class="['seletor', erro && 'seletor--erro']">
    <div v-if="permitirTrecho" class="seletor__modos" role="radiogroup" aria-label="Como marcar a obra">
      <button
        type="button"
        role="radio"
        :aria-checked="modo === 'ponto'"
        :class="['seletor__modo', modo === 'ponto' && 'ativo']"
        @click="trocarModo('ponto')"
      >
        <strong>Ponto</strong>
        <span>edificação, praça, quadra</span>
      </button>
      <button
        type="button"
        role="radio"
        :aria-checked="modo === 'trecho'"
        :class="['seletor__modo', modo === 'trecho' && 'ativo']"
        @click="trocarModo('trecho')"
      >
        <strong>Trecho de via</strong>
        <span>pavimentação, drenagem, iluminação</span>
      </button>
    </div>

    <div ref="el" class="seletor__mapa" role="application" aria-label="Mapa para marcar o local da obra"></div>

    <div class="seletor__barra">
      <template v-if="modo === 'trecho'">
        <span class="pequeno seletor__info">
          <template v-if="qtdSegmentos">
            <strong>{{ extensao }}</strong> em {{ qtdSegmentos }} {{ qtdSegmentos === 1 ? 'segmento' : 'segmentos' }}
            <template v-if="atual.length === 1"> · continue clicando para fechar o segmento</template>
          </template>
          <template v-else-if="atual.length === 1">Clique no próximo ponto da via.</template>
          <template v-else-if="afastado">Clique perto da rua para aproximar o mapa; depois desenhe o trecho.</template>
          <template v-else>Clique ao longo da via, ponto a ponto, para desenhar o trecho.</template>
        </span>
        <span class="seletor__acoes">
          <button type="button" class="btn btn--link" :disabled="!totalPontos" @click="desfazerPonto">Desfazer ponto</button>
          <button type="button" class="btn btn--link" :disabled="atual.length < 2" @click="novoSegmento">Adicionar outra rua</button>
          <button type="button" class="btn btn--link" :disabled="!totalPontos" @click="limparTrecho">Limpar</button>
        </span>
      </template>
      <template v-else>
        <span v-if="local?.latitude != null" class="pequeno mudo num">
          Marcado: {{ local.latitude.toFixed(5) }}, {{ local.longitude.toFixed(5) }} · arraste o pino para ajustar
        </span>
        <span v-else class="pequeno">Clique no mapa para marcar o local da obra.</span>
        <span class="seletor__acoes">
          <button v-if="local?.latitude != null" type="button" class="btn btn--link" @click="remarcar">Marcar de novo</button>
          <button type="button" class="btn btn--link" :disabled="localizando" @click="minhaLocalizacao">
            {{ localizando ? 'Localizando…' : 'Usar minha localização' }}
          </button>
        </span>
      </template>
    </div>
    <p v-if="erroLocalizacao" class="seletor__erro pequeno" role="alert">{{ erroLocalizacao }}</p>
  </div>
</template>

<style scoped>
.seletor {
  border: 1px solid var(--borda-forte);
  border-radius: var(--raio);
  overflow: hidden;
}
.seletor--erro {
  border-color: var(--s-atrasada);
  box-shadow: 0 0 0 1px var(--s-atrasada);
}
.seletor__modos {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid var(--borda);
}
.seletor__modo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 9px 12px;
  border: none;
  background: #f7f9fb;
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: var(--texto-2);
  border-bottom: 3px solid transparent;
}
.seletor__modo + .seletor__modo {
  border-left: 1px solid var(--borda);
}
.seletor__modo strong {
  color: var(--texto);
  font-size: 0.92rem;
}
.seletor__modo span {
  font-size: 0.78rem;
}
.seletor__modo.ativo {
  background: #fff;
  border-bottom-color: var(--azul);
}
.seletor__modo.ativo strong {
  color: var(--azul);
}
.seletor__mapa {
  height: 360px;
  cursor: crosshair;
}
.seletor__barra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 10px;
  background: #f7f9fb;
  border-top: 1px solid var(--borda);
}
.seletor__info {
  color: var(--texto-2);
}
.seletor__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.seletor__erro {
  margin: 0;
  padding: 6px 10px;
  color: #8e1c1c;
  background: var(--erro-fundo);
  border-top: 1px solid #f1bcbc;
}
@media (max-width: 640px) {
  .seletor__mapa {
    height: 300px;
  }
  .seletor__modo span {
    display: none;
  }
}
</style>
