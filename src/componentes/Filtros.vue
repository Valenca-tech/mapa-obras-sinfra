<script setup>
// Busca, tipo e bairro (a situação e os alertas ficam na faixa de situação).
import { computed } from 'vue';
import { Search, X } from 'lucide-vue-next';
import { estado, bairros, filtroAtivo, limparFiltros } from '../estado.js';

// Sempre o objeto atual: o logout e o "Limpar" trocam estado.filtros por um novo.
const f = computed(() => estado.filtros);
</script>

<template>
  <div class="filtros">
    <label class="filtros__busca">
      <span class="oculto">Buscar</span>
      <Search class="icone" aria-hidden="true" />
      <input v-model="f.busca" class="controle" type="search" placeholder="Buscar obra, bairro, empresa ou contrato" />
    </label>
    <label>
      <span class="oculto">Tipo</span>
      <select v-model="f.tipo" class="controle">
        <option value="">Todos os tipos</option>
        <option v-for="t in estado.tiposObra" :key="t.codigo" :value="t.codigo">{{ t.nome }}</option>
      </select>
    </label>
    <label>
      <span class="oculto">Bairro</span>
      <select v-model="f.bairro" class="controle">
        <option value="">Todos os bairros</option>
        <option v-for="b in bairros" :key="b" :value="b">{{ b }}</option>
      </select>
    </label>
    <button v-if="filtroAtivo" type="button" class="btn btn--fantasma" @click="limparFiltros">
      <X class="icone" aria-hidden="true" />
      Limpar filtros
    </button>
  </div>
</template>

<style scoped>
.filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.filtros label {
  flex: 0 1 190px;
  min-width: 140px;
}
.filtros .filtros__busca {
  flex: 1 1 260px;
  max-width: 360px;
  position: relative;
}
.filtros__busca .icone {
  position: absolute;
  left: 9px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--texto-3);
  pointer-events: none;
}
.filtros__busca input {
  padding-left: 32px;
}
@media (max-width: 640px) {
  .filtros label {
    flex: 1 1 calc(50% - 4px);
  }
  .filtros .filtros__busca {
    flex-basis: 100%;
    max-width: none;
  }
}
</style>
