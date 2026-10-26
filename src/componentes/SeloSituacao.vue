<script setup>
// Situação da obra: quadrado na cor da situação e o nome (nunca só a cor).
defineProps({ situacao: { type: Object, required: true } });
</script>

<template>
  <span class="situacao"><i class="situacao__cor" :style="{ '--cor': situacao.hex }" aria-hidden="true"></i>{{ situacao.rotulo }}</span>
</template>
