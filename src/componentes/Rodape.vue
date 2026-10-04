<script setup>
import { ref } from 'vue';
defineProps({ compacto: { type: Boolean, default: false } });
// Logotipos opcionais em public/marcas/ (ifma.png, concretta.png).
const mostrar = ref({ ifma: true, concretta: true });
</script>

<template>
  <footer :class="['rodape', compacto && 'rodape--compacto']">
    <div class="rodape__conteudo">
      <span class="rodape__logos">
        <img v-if="mostrar.ifma" :src="'marcas/ifma.png'" alt="IFMA" @error="mostrar.ifma = false" />
        <img v-if="mostrar.concretta" :src="'marcas/concretta.png'" alt="Concretta Jr" @error="mostrar.concretta = false" />
      </span>
      <span>Piloto desenvolvido pelo <strong>IFMA Campus Imperatriz</strong></span>
      <span class="rodape__sep" aria-hidden="true">·</span>
      <span>LAEST e <strong class="rodape__concretta">Concretta Jr</strong></span>
    </div>
  </footer>
</template>

<style scoped>
.rodape {
  border-top: 1px solid var(--borda);
  background: var(--superficie);
  color: var(--texto-2);
  font-size: 0.82rem;
  position: relative;
}
.rodape::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 0;
  width: 72px;
  height: 3px;
  background: var(--dourado);
}
.rodape__conteudo {
  max-width: 1200px;
  margin: 0 auto;
  padding: 14px 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 8px;
  text-align: center;
}
.rodape--compacto .rodape__conteudo {
  padding: 6px 16px;
  max-width: none;
}
.rodape__logos {
  display: inline-flex;
  gap: 10px;
  align-items: center;
}
.rodape__logos img {
  height: 26px;
  width: auto;
}
.rodape--compacto .rodape__logos {
  display: none;
}
.rodape__concretta {
  color: var(--verde-concretta);
  border-bottom: 2px solid var(--dourado);
}
.rodape__sep {
  color: var(--texto-3);
}
</style>
