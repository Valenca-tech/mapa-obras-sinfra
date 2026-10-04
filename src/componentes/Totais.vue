<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { estado, obrasFiltradasSemSituacao, totais } from '../estado.js';
import { LISTA_SITUACOES } from '../lib/situacao.js';
import { reaisCompacto, reais } from '../lib/formato.js';

const t = computed(() => totais(obrasFiltradasSemSituacao.value));
const alternar = (codigo) => (estado.filtros.situacao = estado.filtros.situacao === codigo ? '' : codigo);

// Com filtro de tipo, bairro, busca ou alerta, o 1º total não é mais "todas".
const filtrado = computed(() => {
  const f = estado.filtros;
  return !!(f.tipo || f.bairro || f.busca.trim() || f.pendencia || f.alerta);
});

// No celular a faixa rola de lado: o total escolhido (inclusive pelo filtro
// "Situação") fica sempre à vista.
const faixa = ref(null);
watch(
  () => [estado.filtros.situacao, estado.filtros.alerta, estado.filtros.pendencia],
  async () => {
    await nextTick();
    faixa.value?.querySelector('.total.ativo:not(:first-child)')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },
);
</script>

<template>
  <div ref="faixa" class="totais" role="group" aria-label="Totais por situação. Clique para filtrar.">
    <button :class="['total', !estado.filtros.situacao && 'ativo']" @click="estado.filtros.situacao = ''">
      <strong class="num">{{ t.ativas }}</strong>
      <span>{{ filtrado ? 'Obras no filtro' : 'Obras ativas' }}</span>
    </button>
    <button
      v-for="s in LISTA_SITUACOES"
      :key="s.codigo"
      :class="['total', estado.filtros.situacao === s.codigo && 'ativo']"
      :style="{ '--cor': s.hex, '--tx': s.texto }"
      :aria-pressed="estado.filtros.situacao === s.codigo"
      @click="alternar(s.codigo)"
    >
      <strong class="num">{{ t[s.codigo] ?? 0 }}</strong>
      <span><i aria-hidden="true">{{ s.simbolo }}</i> {{ s.rotulo }}</span>
    </button>
    <button
      :class="['total', 'total--alerta', estado.filtros.alerta && 'ativo']"
      :aria-pressed="estado.filtros.alerta"
      :title="`Obras em andamento sem lançamento há mais de ${estado.config.dias_sem_atualizacao_alerta} dias`"
      @click="estado.filtros.alerta = !estado.filtros.alerta"
    >
      <strong class="num">{{ t.alertas }}</strong>
      <span><i aria-hidden="true">⚠</i> Sem atualização</span>
    </button>
    <button
      :class="['total', 'total--pendencia', estado.filtros.pendencia && 'ativo']"
      :aria-pressed="estado.filtros.pendencia"
      title="Obras com ato (paralisação, aditivo...) sem número ou protocolo do documento"
      @click="estado.filtros.pendencia = !estado.filtros.pendencia"
    >
      <strong class="num">{{ t.pendencias }}</strong>
      <span><i aria-hidden="true">📄</i> Documento pendente</span>
    </button>
    <div class="total total--valor" :title="reais(t.valor)">
      <strong class="num">{{ reaisCompacto(t.valor) }}</strong>
      <span>Valor contratado</span>
    </div>
  </div>
</template>

<style scoped>
.totais {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: thin;
  padding-bottom: 2px;
}
.total {
  flex: 1 0 auto;
  min-width: 104px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 8px 12px;
  border: 1px solid var(--borda);
  border-left: 4px solid var(--cor, var(--azul));
  border-radius: var(--raio-p);
  background: var(--superficie);
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: var(--texto);
}
.total strong {
  font-size: 1.3rem;
  line-height: 1.1;
  color: var(--tx, var(--azul-escuro));
}
.total span {
  font-size: 0.78rem;
  color: var(--texto-2);
  white-space: nowrap;
}
.total span i {
  font-style: normal;
  color: var(--cor);
}
.total:hover {
  background: #f7f9fc;
}
.total.ativo {
  background: var(--azul-claro);
  border-color: var(--azul-borda);
  border-left-color: var(--cor, var(--azul));
  box-shadow: inset 0 0 0 1px var(--cor, var(--azul));
}
.total--alerta {
  --cor: #d4a017;
  --tx: var(--alerta);
}
.total--pendencia {
  --cor: #c2410c;
  --tx: #7a2e0e;
}
.total--valor {
  cursor: default;
  border-left-color: var(--dourado);
}
.total--valor strong {
  color: var(--texto);
}
.total--valor:hover {
  background: var(--superficie);
}
</style>
