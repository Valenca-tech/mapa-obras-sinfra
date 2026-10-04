<script setup>
import { computed } from 'vue';
import { estado, bairros, filtroAtivo, limparFiltros } from '../estado.js';
import { LISTA_SITUACOES } from '../lib/situacao.js';

// Sempre o objeto atual: o logout e o "Limpar" trocam estado.filtros por um novo.
const f = computed(() => estado.filtros);
</script>

<template>
  <div class="filtros">
    <label class="campo filtros__busca">
      <span class="oculto">Buscar</span>
      <input v-model="f.busca" type="search" placeholder="Buscar obra, bairro, empresa, contrato…" />
    </label>
    <label class="campo">
      <span class="oculto">Situação</span>
      <select v-model="f.situacao">
        <option value="">Todas as situações</option>
        <option v-for="s in LISTA_SITUACOES" :key="s.codigo" :value="s.codigo">{{ s.rotulo }}</option>
      </select>
    </label>
    <label class="campo">
      <span class="oculto">Tipo</span>
      <select v-model="f.tipo">
        <option value="">Todos os tipos</option>
        <option v-for="t in estado.tiposObra" :key="t.codigo" :value="t.codigo">{{ t.nome }}</option>
      </select>
    </label>
    <label class="campo">
      <span class="oculto">Bairro</span>
      <select v-model="f.bairro">
        <option value="">Todos os bairros</option>
        <option v-for="b in bairros" :key="b" :value="b">{{ b }}</option>
      </select>
    </label>
    <label class="filtros__check">
      <input v-model="f.alerta" type="checkbox" />
      Sem atualização
    </label>
    <label class="filtros__check">
      <input v-model="f.pendencia" type="checkbox" />
      Pendência documental
    </label>
    <button v-if="filtroAtivo" type="button" class="btn btn--link" @click="limparFiltros">Limpar filtros</button>
  </div>
</template>

<style scoped>
.filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.filtros .campo {
  flex: 1 1 150px;
  max-width: 220px;
}
.filtros .filtros__busca {
  flex: 2 1 220px;
  max-width: 340px;
}
.filtros select,
.filtros input[type='search'] {
  min-height: 40px;
  padding: 6px 10px;
}
.filtros__check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.88rem;
  color: var(--texto-2);
  white-space: nowrap;
  cursor: pointer;
  min-height: 40px;
}
.filtros__check input {
  width: 18px;
  height: 18px;
}
@media (max-width: 640px) {
  .filtros .campo,
  .filtros .filtros__busca {
    max-width: none;
    flex-basis: calc(50% - 4px);
  }
  .filtros .filtros__busca {
    flex-basis: 100%;
  }
}
</style>
