<script setup>
// Aviso passageiro (gravou, deu erro). Clique fecha.
import { CircleCheck, CircleAlert, Info } from 'lucide-vue-next';
import { estado } from '../estado.js';

const ICONE = { ok: CircleCheck, erro: CircleAlert, info: Info };
</script>

<template>
  <Transition name="aviso">
    <div
      v-if="estado.aviso"
      :class="['aviso', `aviso--${estado.aviso.tipo}`]"
      :role="estado.aviso.tipo === 'erro' ? 'alert' : 'status'"
      @click="estado.aviso = null"
    >
      <component :is="ICONE[estado.aviso.tipo] ?? Info" class="icone" aria-hidden="true" />
      <span>{{ estado.aviso.texto }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.aviso {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 3000;
  max-width: min(440px, calc(100vw - 32px));
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 11px 14px;
  border-radius: var(--raio-g);
  box-shadow: var(--sombra-alta);
  background: #1f2937;
  color: #fff;
  font-size: 0.93rem;
  cursor: pointer;
}
.aviso .icone {
  margin-top: 1px;
  width: 18px;
  height: 18px;
}
.aviso--ok .icone {
  color: #6ee7b7;
}
.aviso--erro {
  background: var(--erro);
}
.aviso--info .icone {
  color: #a5b4fc;
}
@media (max-width: 640px) {
  .aviso {
    left: 16px;
    right: 16px;
    bottom: 16px;
    max-width: none;
  }
}
.aviso-enter-active,
.aviso-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.aviso-enter-from,
.aviso-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
