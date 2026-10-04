<script setup>
import { estado } from '../estado.js';
</script>

<template>
  <Transition name="aviso">
    <div
      v-if="estado.aviso"
      :class="['aviso', `aviso--${estado.aviso.tipo}`]"
      :role="estado.aviso.tipo === 'erro' ? 'alert' : 'status'"
      @click="estado.aviso = null"
    >
      {{ estado.aviso.texto }}
    </div>
  </Transition>
</template>

<style scoped>
.aviso {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 3000;
  max-width: min(560px, calc(100vw - 32px));
  padding: 12px 18px;
  border-radius: var(--raio);
  box-shadow: var(--sombra-alta);
  font-weight: 600;
  cursor: pointer;
  background: var(--s-em-dia);
  color: #fff;
}
.aviso--erro {
  background: var(--s-atrasada);
}
.aviso--info {
  background: var(--azul);
}
.aviso-enter-active,
.aviso-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.aviso-enter-from,
.aviso-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}
</style>
