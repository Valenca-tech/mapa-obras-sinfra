<script setup>
defineProps({ situacao: { type: Object, required: true } });
</script>

<template>
  <span class="selo" :style="{ '--fundo': situacao.fundo, '--texto': situacao.texto, '--cor': situacao.hex }">
    <span class="simbolo" aria-hidden="true">{{ situacao.simbolo }}</span>{{ situacao.rotulo }}
  </span>
</template>
