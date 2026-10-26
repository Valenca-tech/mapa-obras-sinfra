<script setup>
// Controle da camada de instalações públicas no mapa: abre uma lista de tipos
// (escolas, unidades de saúde, praças...) para mostrar só os escolhidos.
// A escolha fica guardada neste aparelho.
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { estado } from '../estado.js';
import { ChevronDown } from 'lucide-vue-next';
import { svgInstalacao } from '../lib/mapa.js';

const aberto = ref(false);
const caixa = ref(null);
const botao = ref(null);

// Tipos com pelo menos uma instalação ativa, na ordem da tabela, com a
// contagem, reunidos por área (Educação, Saúde...).
const tipos = computed(() => {
  const contagem = {};
  for (const i of estado.instalacoes) contagem[i.tipo] = (contagem[i.tipo] ?? 0) + 1;
  return estado.tiposInstalacao.filter((t) => contagem[t.codigo]).map((t) => ({ ...t, total: contagem[t.codigo] }));
});
const grupos = computed(() => {
  const lista = [];
  for (const t of tipos.value) {
    const nome = t.grupo ?? 'Outros';
    let g = lista.find((x) => x.nome === nome);
    if (!g) lista.push((g = { nome, tipos: [], total: 0 }));
    g.tipos.push(t);
    g.total += t.total;
  }
  return lista;
});

const visivel = (codigo) => !estado.tiposInstalacaoOcultos.includes(codigo);
const visiveisNoGrupo = (g) => g.tipos.filter((t) => visivel(t.codigo)).length;
// Marca ou desmarca a área inteira (parcial: marca tudo).
function alternarGrupo(g) {
  const codigos = g.tipos.map((t) => t.codigo);
  const ocultos = estado.tiposInstalacaoOcultos.filter((c) => !codigos.includes(c));
  estado.tiposInstalacaoOcultos = visiveisNoGrupo(g) === g.tipos.length ? [...ocultos, ...codigos] : ocultos;
}
const somenteGrupo = (g) =>
  (estado.tiposInstalacaoOcultos = codigos().filter((c) => !g.tipos.some((t) => t.codigo === c)));
const totalVisivel = computed(() => estado.instalacoes.filter((i) => visivel(i.tipo)).length);
const todosVisiveis = computed(() => totalVisivel.value === estado.instalacoes.length);

function alternar(codigo) {
  estado.tiposInstalacaoOcultos = visivel(codigo)
    ? [...estado.tiposInstalacaoOcultos, codigo]
    : estado.tiposInstalacaoOcultos.filter((c) => c !== codigo);
}
const codigos = () => estado.tiposInstalacao.map((t) => t.codigo);
const todos = () => (estado.tiposInstalacaoOcultos = []);
const nenhum = () => (estado.tiposInstalacaoOcultos = codigos());
const somente = (codigo) => (estado.tiposInstalacaoOcultos = codigos().filter((c) => c !== codigo));

// Fecha ao clicar fora ou com Esc (o foco volta ao botão).
const fora = (e) => {
  if (aberto.value && caixa.value && !caixa.value.contains(e.target)) aberto.value = false;
};
const esc = (e) => {
  if (e.key === 'Escape' && aberto.value) {
    aberto.value = false;
    botao.value?.focus();
  }
};
watch(aberto, async (v) => {
  if (!v) return;
  await nextTick();
  caixa.value?.querySelector('.camada__painel input')?.focus();
});
onMounted(() => {
  document.addEventListener('mousedown', fora);
  document.addEventListener('keydown', esc);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', fora);
  document.removeEventListener('keydown', esc);
});
</script>

<template>
  <div ref="caixa" class="camada">
    <button
      ref="botao"
      type="button"
      class="camada__botao"
      :aria-expanded="aberto"
      aria-controls="camada-tipos"
      title="Escolher os tipos de instalação pública que aparecem no mapa"
      @click="aberto = !aberto"
    >
      <span class="instalacao instalacao--mini" aria-hidden="true" v-html="svgInstalacao('sede')"></span>
      <span>Instalações públicas</span>
      <span class="mudo num">
        ({{ totalVisivel }}<template v-if="!todosVisiveis"> de {{ estado.instalacoes.length }}</template>)
      </span>
      <ChevronDown class="icone camada__seta" aria-hidden="true" />
    </button>

    <div v-if="aberto" id="camada-tipos" class="camada__painel" role="group" aria-label="Tipos de instalação pública no mapa">
      <div class="camada__atalhos">
        <span class="pequeno mudo">Mostrar no mapa:</span>
        <button type="button" class="btn btn--link" @click="todos">Todos</button>
        <button type="button" class="btn btn--link" @click="nenhum">Nenhum</button>
      </div>
      <div v-for="g in grupos" :key="g.nome" class="camada__grupo">
        <div class="camada__tipo camada__tipo--grupo">
          <label>
            <input
              type="checkbox"
              :checked="visiveisNoGrupo(g) === g.tipos.length"
              :indeterminate.prop="visiveisNoGrupo(g) > 0 && visiveisNoGrupo(g) < g.tipos.length"
              @change="alternarGrupo(g)"
            />
            <span class="camada__nome">{{ g.nome }}</span>
            <span class="mudo num">{{ g.total }}</span>
          </label>
          <button
            type="button"
            class="btn btn--link camada__so"
            :aria-label="`Mostrar só ${g.nome}`"
            :title="`Mostrar só ${g.nome}`"
            @click="somenteGrupo(g)"
          >
            só
          </button>
        </div>
        <ul class="camada__lista">
          <li v-for="t in g.tipos" :key="t.codigo" class="camada__tipo">
            <label>
              <input type="checkbox" :checked="visivel(t.codigo)" @change="alternar(t.codigo)" />
              <span class="instalacao instalacao--mini" aria-hidden="true" v-html="svgInstalacao(t.codigo)"></span>
              <span class="camada__nome">{{ t.nome }}</span>
              <span class="mudo num">{{ t.total }}</span>
            </label>
            <button
              type="button"
              class="btn btn--link camada__so"
              :aria-label="`Mostrar só ${t.nome}`"
              :title="`Mostrar só ${t.nome}`"
              @click="somente(t.codigo)"
            >
              só
            </button>
          </li>
        </ul>
      </div>
      <p v-if="!tipos.length" class="pequeno mudo">Nenhuma instalação cadastrada.</p>
    </div>
  </div>
</template>

<style scoped>
.camada {
  position: relative;
}
.camada__botao {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  padding: 6px 10px;
  min-height: 34px;
  color: var(--texto);
  background: var(--superficie);
  border: 1px solid var(--borda-forte);
  border-radius: var(--raio);
}
.camada__botao:hover {
  background: #fff;
}
.camada__seta {
  width: 14px;
  height: 14px;
  color: var(--texto-2);
}
.camada__painel {
  position: absolute;
  left: 0;
  top: calc(100% + 4px);
  width: min(340px, calc(100vw - 24px));
  max-height: min(70vh, 560px);
  overflow-y: auto;
  background: var(--superficie);
  border-radius: var(--raio-g);
  box-shadow: var(--sombra-alta);
  padding: 8px;
}
.camada__atalhos {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px 6px;
  border-bottom: 1px solid var(--borda);
  margin-bottom: 4px;
}
.camada__atalhos span {
  margin-right: auto;
}
.camada__lista {
  list-style: none;
  margin: 0 0 4px;
  padding: 0 0 0 18px;
}
.camada__grupo + .camada__grupo {
  border-top: 1px solid var(--borda);
  padding-top: 2px;
}
.camada__tipo--grupo label {
  font-weight: 600;
}
.camada__tipo {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--raio-p);
}
.camada__tipo:hover {
  background: var(--azul-claro);
}
.camada__tipo label {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  min-height: 40px;
  cursor: pointer;
  font-size: 0.9rem;
}
.camada__tipo input {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.camada__nome {
  flex: 1;
}
.camada__so {
  font-size: 0.82rem;
  padding: 4px 8px;
}
@media (pointer: coarse) {
  .camada__botao {
    min-height: 44px;
  }
  .camada__tipo label {
    min-height: 44px;
  }
}
</style>
