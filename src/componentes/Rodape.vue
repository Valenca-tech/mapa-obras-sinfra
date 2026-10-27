<script setup>
// Crédito do piloto: só na tela de entrada (e no relatório impresso).
import { ref } from 'vue';
const mostrar = ref({ ifma: true, concretta: true });
</script>

<template>
  <footer class="rodape">
    <span class="rodape__logos">
      <img v-if="mostrar.ifma" :src="'marcas/ifma.png'" alt="IFMA" @error="mostrar.ifma = false" />
      <img v-if="mostrar.concretta" :src="'marcas/concretta.png'" alt="Concretta Jr" @error="mostrar.concretta = false" />
    </span>
    <span>Piloto desenvolvido pelo IFMA Campus Imperatriz e pela Concretta Jr</span>
  </footer>
</template>

<style scoped>
.rodape {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 12px;
  padding: 16px;
  color: var(--texto-3);
  font-size: 0.84rem;
  text-align: center;
}
.rodape__logos {
  display: inline-flex;
  gap: 10px;
  align-items: center;
}
.rodape__logos img {
  height: 22px;
  width: auto;
}
</style>
