<script setup>
// Botão que abre uma lista de ações. Fecha com Esc, clique fora ou ao escolher;
// setas para cima e para baixo andam entre os itens.
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  rotulo: { type: String, required: true },
  alinhar: { type: String, default: 'direita' }, // lado em que o menu abre
});
const aberto = ref(false);
const caixa = ref(null);
const botao = ref(null);
const menu = ref(null);

const itens = () => [...(menu.value?.querySelectorAll('.suspenso__item:not([disabled])') ?? [])];
watch(aberto, async (v) => {
  if (!v) return;
  await nextTick();
  itens()[0]?.focus();
});
function fechar(focar = true) {
  aberto.value = false;
  if (focar) botao.value?.focus();
}
function teclar(e) {
  if (!aberto.value) return;
  if (e.key === 'Escape') return fechar();
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const lista = itens();
  const i = lista.indexOf(document.activeElement);
  lista[(i + (e.key === 'ArrowDown' ? 1 : -1) + lista.length) % lista.length]?.focus();
}
const fora = (e) => {
  if (aberto.value && caixa.value && !caixa.value.contains(e.target)) fechar(false);
};
// escolheu um item: fecha (o item já fez a ação dele)
const aoClicarMenu = (e) => {
  if (e.target.closest('.suspenso__item')) fechar(false);
};
onMounted(() => document.addEventListener('mousedown', fora));
onBeforeUnmount(() => document.removeEventListener('mousedown', fora));
defineExpose({ fechar });
</script>

<template>
  <div ref="caixa" class="suspenso" @keydown="teclar">
    <button ref="botao" type="button" class="btn" :aria-expanded="aberto" aria-haspopup="menu" @click="aberto = !aberto">
      <slot name="botao">{{ props.rotulo }}</slot>
    </button>
    <div
      v-if="aberto"
      ref="menu"
      :class="['suspenso__menu', props.alinhar === 'esquerda' && 'suspenso__menu--esquerda']"
      role="menu"
      :aria-label="props.rotulo"
      @click="aoClicarMenu"
    >
      <slot />
    </div>
  </div>
</template>
