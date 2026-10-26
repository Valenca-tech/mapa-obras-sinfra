<script setup>
// Faixa de contagem por situação, que também filtra: clicar em "Atrasada"
// mostra só as atrasadas (de novo, volta a todas). Os dois alertas à direita
// são filtros que se somam à situação.
import { computed } from 'vue';
import { estado, obrasFiltradasSemSituacao, totais } from '../estado.js';
import { LISTA_SITUACOES } from '../lib/situacao.js';

const t = computed(() => totais(obrasFiltradasSemSituacao.value));
const f = computed(() => estado.filtros);
const escolher = (codigo) => (f.value.situacao = f.value.situacao === codigo ? '' : codigo);
</script>

<template>
  <div class="resumo-situacao">
    <div class="resumo-situacao__abas" role="group" aria-label="Filtrar por situação">
      <button type="button" class="resumo-situacao__aba" :aria-pressed="!f.situacao" @click="f.situacao = ''">
        Todas <span class="contador">{{ t.ativas }}</span>
      </button>
      <button
        v-for="s in LISTA_SITUACOES"
        :key="s.codigo"
        type="button"
        class="resumo-situacao__aba"
        :aria-pressed="f.situacao === s.codigo"
        @click="escolher(s.codigo)"
      >
        <i class="situacao__cor" :style="{ '--cor': s.hex }" aria-hidden="true"></i>
        {{ s.rotulo }} <span class="contador">{{ t[s.codigo] ?? 0 }}</span>
      </button>
    </div>
    <div class="resumo-situacao__extras" role="group" aria-label="Alertas">
      <button
        type="button"
        class="resumo-situacao__aba"
        :aria-pressed="f.alerta"
        :title="`Obras em andamento sem lançamento há mais de ${estado.config.dias_sem_atualizacao_alerta} dias`"
        @click="f.alerta = !f.alerta"
      >
        Sem atualização <span :class="['contador', t.alertas && 'contador--alerta']">{{ t.alertas }}</span>
      </button>
      <button
        type="button"
        class="resumo-situacao__aba"
        :aria-pressed="f.pendencia"
        title="Obras com ato (paralisação, aditivo...) sem número ou protocolo do documento"
        @click="f.pendencia = !f.pendencia"
      >
        Documento pendente <span :class="['contador', t.pendencias && 'contador--alerta']">{{ t.pendencias }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.resumo-situacao {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 4px 16px;
  overflow-x: auto;
  scrollbar-width: none;
  box-shadow: inset 0 -1px 0 var(--borda);
}
.resumo-situacao__abas,
.resumo-situacao__extras {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
}
.resumo-situacao__aba {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px 9px;
  border: none;
  background: none;
  font: inherit;
  font-size: 0.93rem;
  color: var(--texto-2);
  white-space: nowrap;
  cursor: pointer;
  box-shadow: inset 0 -2px 0 transparent;
}
.resumo-situacao__aba:hover {
  color: var(--texto);
}
.resumo-situacao__aba[aria-pressed='true'] {
  color: var(--azul);
  font-weight: 500;
  box-shadow: inset 0 -2px 0 var(--azul);
}
@media (pointer: coarse) {
  .resumo-situacao__aba {
    min-height: 44px;
  }
}
</style>
