<script setup>
// Diálogo. Com "sujo" (algo digitado e não salvo), o toque no fundo não fecha
// (no celular é o gesto para esconder o teclado) e Esc ou × pedem confirmação.
// O Tab fica preso dentro do diálogo e o foco volta para onde estava ao fechar.
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { X } from 'lucide-vue-next';

const props = defineProps({
  titulo: { type: String, required: true },
  largura: { type: String, default: '520px' },
  sujo: { type: Boolean, default: false },
});
const emit = defineEmits(['fechar']);
const caixa = ref(null);
let focoAnterior = null;

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function pedirFechar() {
  if (props.sujo && !confirm('Fechar sem salvar? O que foi preenchido será perdido.')) return;
  emit('fechar');
}

function aoClicarFundo() {
  if (!props.sujo) emit('fechar');
}

function aoTeclar(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    pedirFechar();
    return;
  }
  if (e.key !== 'Tab' || !caixa.value) return;
  const itens = [...caixa.value.querySelectorAll(FOCAVEIS)].filter((el) => el.offsetParent !== null);
  if (!itens.length) return;
  const primeiro = itens[0];
  const ultimo = itens[itens.length - 1];
  if (e.shiftKey && (document.activeElement === primeiro || !caixa.value.contains(document.activeElement))) {
    e.preventDefault();
    ultimo.focus();
  } else if (!e.shiftKey && (document.activeElement === ultimo || !caixa.value.contains(document.activeElement))) {
    e.preventDefault();
    primeiro.focus();
  }
}

onMounted(() => {
  focoAnterior = document.activeElement;
  document.addEventListener('keydown', aoTeclar);
  caixa.value?.querySelector('input:not([type=checkbox]):not([readonly]), select, textarea, button:not(.modal__fechar)')?.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', aoTeclar);
  if (focoAnterior?.isConnected) focoAnterior.focus?.();
});
</script>

<template>
  <div class="modal" @mousedown.self="aoClicarFundo">
    <div ref="caixa" class="modal__caixa" :style="{ maxWidth: largura }" role="dialog" aria-modal="true" :aria-label="titulo">
      <header class="modal__topo">
        <h2>{{ titulo }}</h2>
        <button class="modal__fechar" type="button" aria-label="Fechar" @click="pedirFechar"><X class="icone" aria-hidden="true" /></button>
      </header>
      <div class="modal__corpo"><slot /></div>
      <footer v-if="$slots.rodape" class="modal__rodape"><slot name="rodape" /></footer>
    </div>
  </div>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 2500;
  background: rgba(16, 24, 40, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.modal__caixa {
  background: var(--superficie);
  border-radius: var(--raio-g);
  box-shadow: var(--sombra-alta);
  width: 100%;
  max-height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
}
.modal__topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 12px 20px;
  border-bottom: 1px solid var(--borda);
}
.modal__topo h2 {
  margin: 0;
  font-size: 1.02rem;
}
.modal__fechar {
  border: none;
  background: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--texto-2);
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: var(--raio);
}
.modal__fechar:hover {
  background: var(--superficie-2);
}
.modal__corpo {
  padding: 18px 20px;
  overflow-y: auto;
}
.modal__rodape {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--borda);
  background: var(--superficie-2);
  border-radius: 0 0 var(--raio-g) var(--raio-g);
}
@media (pointer: coarse) {
  .modal__fechar {
    width: 44px;
    height: 44px;
  }
}
@media (max-width: 560px) {
  .modal {
    align-items: flex-end;
    padding: 0;
  }
  .modal__caixa {
    border-radius: var(--raio-g) var(--raio-g) 0 0;
    max-height: 92dvh;
  }
  .modal__rodape {
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
}
@media print {
  .modal {
    display: none !important;
  }
}
</style>
