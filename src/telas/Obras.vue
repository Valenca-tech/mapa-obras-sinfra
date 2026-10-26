<script setup>
// Obras: a tela principal. Mesmos filtros e contagens para as duas vistas,
// Lista e Mapa (?ver=mapa). A vista escolhida fica guardada no aparelho.
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { List, Map as IconeMapa, Plus, SlidersHorizontal } from 'lucide-vue-next';
import { estado, pode, recarregarObras, avisar, obrasFiltradas, filtroAtivo } from '../estado.js';

// No celular a busca, o tipo e o bairro ficam atrás do botão "Filtros".
const filtrosAbertos = ref(false);
const filtrosLigados = computed(() => [estado.filtros.busca.trim(), estado.filtros.tipo, estado.filtros.bairro].filter(Boolean).length);
import { reais, reaisCompacto } from '../lib/formato.js';
import Filtros from '../componentes/Filtros.vue';
import ResumoSituacao from '../componentes/ResumoSituacao.vue';
import TabelaObras from '../componentes/TabelaObras.vue';
import MapaObras from '../componentes/MapaObras.vue';

const CHAVE_VISTA = 'mapa-obras-vista';
const rota = useRoute();
const roteador = useRouter();

function vistaGuardada() {
  try {
    return localStorage.getItem(CHAVE_VISTA) === 'lista' ? 'lista' : 'mapa';
  } catch {
    return 'mapa';
  }
}
const valor = computed(() => obrasFiltradas.value.reduce((s, o) => s + Number(o.valor_contrato || 0), 0));
const vista = computed(() => (rota.query.ver === 'lista' || rota.query.ver === 'mapa' ? rota.query.ver : vistaGuardada()));

function trocarVista(v) {
  try {
    localStorage.setItem(CHAVE_VISTA, v);
  } catch {
    /* sem storage: vale só nesta visita */
  }
  // obra selecionada no mapa não faz sentido na lista
  const query = { ...rota.query, ver: v };
  if (v === 'lista') delete query.obra;
  roteador.replace({ query });
}
watch(vista, (v) => {
  if (v === 'lista') estado.obraAberta = null;
});

onMounted(() => recarregarObras().catch((e) => avisar(e.message, 'erro')));
</script>

<template>
  <div :class="['obras', `obras--${vista}`]">
    <div class="obras__topo">
      <div class="pagina__cabecalho obras__cabecalho">
        <div>
          <h1>Obras</h1>
          <p class="pagina__subtitulo">
            {{ obrasFiltradas.length }} {{ obrasFiltradas.length === 1 ? 'obra' : 'obras' }}{{ filtroAtivo || estado.filtros.situacao ? ' no filtro' : ' ativas' }}
            · <span :title="reais(valor)">{{ reaisCompacto(valor) }} contratados</span>
          </p>
        </div>
        <div class="acoes">
          <div class="segmentado" role="group" aria-label="Forma de ver as obras">
            <button type="button" :aria-pressed="vista === 'lista'" @click="trocarVista('lista')">
              <List class="icone" aria-hidden="true" />Lista
            </button>
            <button type="button" :aria-pressed="vista === 'mapa'" @click="trocarVista('mapa')">
              <IconeMapa class="icone" aria-hidden="true" />Mapa
            </button>
          </div>
          <button type="button" class="btn obras__botao-filtros" :aria-expanded="filtrosAbertos" @click="filtrosAbertos = !filtrosAbertos">
            <SlidersHorizontal class="icone" aria-hidden="true" />Filtros<span v-if="filtrosLigados" class="contador">{{ filtrosLigados }}</span>
          </button>
          <RouterLink v-if="pode('obra.cadastrar')" to="/obras/nova" class="btn btn--primario">
            <Plus class="icone" aria-hidden="true" />Nova obra
          </RouterLink>
        </div>
      </div>
      <Filtros :class="['obras__filtros', filtrosAbertos && 'obras__filtros--aberto']" />
      <ResumoSituacao class="obras__resumo" />
    </div>

    <div v-if="vista === 'lista'" class="obras__lista">
      <TabelaObras />
    </div>
    <MapaObras v-else class="obras__mapa" />
  </div>
</template>

<style scoped>
.obras {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.obras__topo {
  padding: 18px 24px 0;
  background: var(--superficie);
  border-bottom: 1px solid var(--borda);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.obras__cabecalho {
  margin-bottom: 0;
  align-items: center;
}
.obras__resumo {
  margin: 0 -24px;
  padding: 0 14px;
  box-shadow: none;
}
.obras__lista {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px 32px;
}
.obras__mapa {
  flex: 1;
}
.obras__botao-filtros {
  display: none;
}
@media (max-width: 640px) {
  .obras__topo {
    padding: 12px 14px 0;
    gap: 10px;
  }
  .obras__botao-filtros {
    display: inline-flex;
  }
  .obras__filtros {
    display: none;
  }
  .obras__filtros--aberto {
    display: flex;
  }
  .obras__resumo {
    margin: 0 -14px;
    padding: 0 4px;
  }
  .obras__lista {
    padding: 12px 14px 28px;
  }
}
</style>
