<script setup>
// Central de Obras: página da obra, com abas. A aba fica no endereço
// (?aba=servicos), para o "voltar" e o link copiado abrirem no mesmo lugar.
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { nomeTipo } from '../estado.js';
import { usarObra } from '../lib/usarObra.js';
import ResumoObra from '../componentes/ResumoObra.vue';
import PlanilhaObra from '../componentes/PlanilhaObra.vue';
import DocumentosObra from '../componentes/DocumentosObra.vue';

const props = defineProps({ id: { type: String, required: true } });
const rota = useRoute();
const roteador = useRouter();

const { obra, carregando, naoEncontrada } = usarObra(() => props.id);

const ABAS = [
  { codigo: 'resumo', rotulo: 'Resumo e histórico' },
  { codigo: 'servicos', rotulo: 'Serviços e etapas' },
  { codigo: 'documentos', rotulo: 'Documentos' },
];
const aba = computed(() => (ABAS.some((a) => a.codigo === rota.query.aba) ? rota.query.aba : 'resumo'));
const irPara = (codigo) => roteador.replace({ query: { ...rota.query, aba: codigo === 'resumo' ? undefined : codigo } });

// Setas do teclado entre as abas (padrão WAI-ARIA de abas).
function teclaNaAba(e, i) {
  const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!passo) return;
  e.preventDefault();
  const proxima = ABAS[(i + passo + ABAS.length) % ABAS.length];
  irPara(proxima.codigo);
  document.getElementById(`aba-${proxima.codigo}`)?.focus();
}
</script>

<template>
  <div class="obra">
    <RouterLink to="/central" class="obra__voltar">← Central de Obras</RouterLink>

    <p v-if="naoEncontrada" class="cartao mudo">
      Esta obra não existe ou não está disponível para o seu usuário. Confira o endereço ou procure na Central de Obras.
    </p>
    <p v-else-if="!obra && carregando" class="mudo">Carregando…</p>

    <template v-if="obra">
      <header class="obra__topo" :style="{ '--cor-situacao': obra.situacao.hex }">
        <div class="obra__titulo">
          <p class="obra__tipo">{{ nomeTipo(obra.tipo) }} · {{ obra.bairro ?? 'sem bairro' }}</p>
          <h1>{{ obra.nome }}</h1>
        </div>
        <div class="acoes">
          <RouterLink :to="{ path: '/mapa', query: { obra: obra.id } }" class="btn">Ver no mapa</RouterLink>
        </div>
      </header>

      <div class="abas" role="tablist" aria-label="Seções da obra">
        <button
          v-for="(a, i) in ABAS"
          :id="`aba-${a.codigo}`"
          :key="a.codigo"
          type="button"
          role="tab"
          class="abas__aba"
          :aria-selected="aba === a.codigo"
          :aria-controls="`painel-${a.codigo}`"
          :tabindex="aba === a.codigo ? 0 : -1"
          @click="irPara(a.codigo)"
          @keydown="teclaNaAba($event, i)"
        >
          {{ a.rotulo }}
          <span v-if="a.codigo === 'servicos' && !obra.tem_planilha" class="abas__marca mudo">(sem planilha)</span>
        </button>
      </div>

      <section :id="`painel-${aba}`" role="tabpanel" :aria-labelledby="`aba-${aba}`" class="obra__painel">
        <ResumoObra v-if="aba === 'resumo'" :obra="obra" largo />
        <PlanilhaObra v-else-if="aba === 'servicos'" :obra="obra" />
        <DocumentosObra v-else :obra="obra" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.obra {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.obra__voltar {
  font-size: 0.9rem;
  align-self: flex-start;
}
.obra__topo {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  justify-content: space-between;
  padding-left: 12px;
  border-left: 5px solid var(--cor-situacao);
}
.obra__titulo h1 {
  margin: 0;
  font-size: 1.45rem;
}
.obra__tipo {
  margin: 0 0 2px;
  font-size: 0.8rem;
  color: var(--texto-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.abas {
  display: flex;
  gap: 2px;
  box-shadow: inset 0 -2px 0 var(--borda);
  overflow-x: auto;
  overflow-y: hidden;
}
.abas__aba {
  font: inherit;
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--texto-2);
  background: none;
  border: none;
  padding: 10px 14px;
  min-height: 44px;
  cursor: pointer;
  white-space: nowrap;
}
.abas__aba:hover {
  color: var(--azul);
}
.abas__aba[aria-selected='true'] {
  color: var(--azul);
  box-shadow: inset 0 -3px 0 var(--azul);
}
.abas__marca {
  font-weight: 400;
  font-size: 0.8rem;
}
.obra__painel {
  padding-top: 4px;
}
</style>
