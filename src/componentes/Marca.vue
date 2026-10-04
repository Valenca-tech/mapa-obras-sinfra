<script setup>
// Marca da ferramenta: placa da Prefeitura + palavra SINFRA + "Mapa de Obras".
// variante "escura": sobre o azul do cabeçalho. "clara": sobre fundo branco.
// Arquivos em public/marcas/ (ver LEIAME.txt); sem a placa, fica só a palavra.
import { ref } from 'vue';

defineProps({
  variante: { type: String, default: 'escura' },
  grande: { type: Boolean, default: false },
});
const temPlaca = ref(true);
</script>

<template>
  <span :class="['marca', `marca--${variante}`, grande && 'marca--grande']">
    <img
      v-if="temPlaca"
      :src="'marcas/prefeitura.png'"
      alt="Prefeitura de Imperatriz"
      class="marca__placa"
      @error="temPlaca = false"
    />
    <span v-if="temPlaca" class="marca__divisor" aria-hidden="true"></span>
    <span class="marca__sinfra">
      <strong class="marca__palavra">SINFRA</strong>
      <small>Mapa de Obras</small>
    </span>
  </span>
</template>

<style scoped>
.marca {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: #fff;
}
.marca__placa {
  height: 40px;
  width: auto;
  display: block;
}
.marca__divisor {
  width: 1px;
  align-self: stretch;
  margin: 6px 0;
  background: rgba(255, 255, 255, 0.35);
}
.marca__sinfra {
  display: flex;
  flex-direction: column;
  line-height: 1;
}
.marca__palavra {
  font-family: 'Archivo Black', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 900;
  font-size: 1.55rem;
  letter-spacing: 0.02em;
}
.marca__sinfra small {
  margin-top: 3px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.9;
}
.marca--clara {
  color: var(--azul);
}
.marca--clara .marca__divisor {
  background: var(--borda-forte);
}
.marca--clara .marca__sinfra small {
  color: var(--texto-2);
  opacity: 1;
}
.marca--grande .marca__placa {
  height: 52px;
}
.marca--grande .marca__palavra {
  font-size: 2rem;
}
@media (max-width: 420px) {
  .marca {
    gap: 8px;
  }
  .marca__placa {
    height: 32px;
  }
  .marca__palavra {
    font-size: 1.25rem;
  }
  .marca--grande .marca__placa {
    height: 40px;
  }
  .marca--grande .marca__palavra {
    font-size: 1.6rem;
  }
}
</style>
