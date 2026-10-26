<script setup>
// Executado x prazo decorrido, lado a lado, com o desvio em pontos.
import { pct, pontos } from '../lib/formato.js';
defineProps({ situacao: { type: Object, required: true } });
</script>

<template>
  <div class="barras">
    <div class="barras__linha">
      <span class="barras__rotulo">Executado</span>
      <div class="barra" role="progressbar" :aria-valuenow="situacao.executado" aria-valuemin="0" aria-valuemax="100" aria-label="Executado">
        <div :style="{ width: `${situacao.executado}%`, '--cor': situacao.hex }"></div>
      </div>
      <strong class="num">{{ pct(situacao.executado) }}</strong>
    </div>
    <div class="barras__linha">
      <span class="barras__rotulo">Prazo decorrido</span>
      <div class="barra" role="progressbar" :aria-valuenow="situacao.prazoDecorrido" aria-valuemin="0" aria-valuemax="100" aria-label="Prazo decorrido">
        <div :style="{ width: `${situacao.prazoDecorrido}%`, '--cor': '#8a929e' }"></div>
      </div>
      <strong class="num">{{ pct(situacao.prazoDecorrido) }}</strong>
    </div>
    <p v-if="situacao.codigo !== 'concluida' && situacao.codigo !== 'nao_iniciada'" class="barras__desvio">
      <template v-if="situacao.desvio > 0">{{ pontos(situacao.desvio) }} pontos abaixo do prazo decorrido</template>
      <template v-else-if="situacao.desvio < 0">{{ pontos(-situacao.desvio) }} pontos à frente do prazo decorrido</template>
      <template v-else>Execução igual ao prazo decorrido</template>
    </p>
  </div>
</template>

<style scoped>
.barras {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.barras__linha {
  display: grid;
  grid-template-columns: 108px 1fr 52px;
  align-items: center;
  gap: 10px;
}
.barras__rotulo {
  font-size: 0.86rem;
  color: var(--texto-2);
}
.barras__linha strong {
  text-align: right;
  font-weight: 600;
}
.barras__desvio {
  margin: 0;
  font-size: 0.86rem;
  color: var(--texto-3);
}
</style>
