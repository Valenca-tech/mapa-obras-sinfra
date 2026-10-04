<script setup>
// Ficha lateral da obra (mapa, pendências). O detalhe completo (planilha de
// serviços e documentos) fica na Central de Obras: botão "Abrir na Central".
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { estado, nomeTipo } from '../estado.js';
import { fecharFicha } from '../rotas.js';
import { usarObra } from '../lib/usarObra.js';
import ResumoObra from './ResumoObra.vue';

const props = defineProps({ id: { type: String, required: true } });

const { obra, naoEncontrada } = usarObra(() => props.id);
const botaoFechar = ref(null);

const fechar = () => fecharFicha();

// Foco: vai para o × ao abrir e volta para onde estava ao fechar (teclado e
// leitor de tela percebem que a ficha abriu). No celular a ficha cobre a tela
// e funciona como diálogo modal.
let focoAnterior = null;
const movel = ref(false);
let consulta = null;
const aoMudarTela = () => (movel.value = !!consulta?.matches);
const aoTeclar = (e) => e.key === 'Escape' && !estado.acao && fechar();
onMounted(async () => {
  focoAnterior = document.activeElement;
  document.addEventListener('keydown', aoTeclar);
  consulta = window.matchMedia?.('(max-width: 640px)') ?? null;
  aoMudarTela();
  consulta?.addEventListener?.('change', aoMudarTela);
  await nextTick();
  botaoFechar.value?.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', aoTeclar);
  consulta?.removeEventListener?.('change', aoMudarTela);
  if (focoAnterior?.isConnected && !estado.acao) focoAnterior.focus?.();
});
</script>

<template>
  <div class="ficha-fundo" @click.self="fechar">
    <aside class="ficha" role="dialog" :aria-modal="movel ? 'true' : 'false'" :aria-label="obra ? `Ficha da obra ${obra.nome}` : 'Ficha da obra'">
      <header class="ficha__topo">
        <div class="ficha__titulo">
          <p class="ficha__tipo">{{ obra ? `${nomeTipo(obra.tipo)} · ${obra.bairro ?? 'sem bairro'}` : '' }}</p>
          <h2>{{ obra?.nome ?? (naoEncontrada ? 'Obra não encontrada' : 'Carregando…') }}</h2>
        </div>
        <button ref="botaoFechar" class="ficha__fechar" type="button" aria-label="Fechar ficha" @click="fechar">×</button>
      </header>

      <p v-if="naoEncontrada" class="ficha__corpo mudo">
        Esta obra não existe ou não está disponível para o seu usuário. Confira o endereço ou procure na Central de Obras.
      </p>

      <div v-if="obra" class="ficha__corpo">
        <RouterLink :to="`/obras/${obra.id}`" class="ficha__central">
          <span>
            <strong>Abrir na Central de Obras</strong>
            <small>Serviços, etapas, valores e documentos (declarações, atestado, ficha técnica)</small>
          </span>
          <span aria-hidden="true">→</span>
        </RouterLink>
        <ResumoObra :obra="obra" />
      </div>
    </aside>
  </div>
</template>

<style scoped>
.ficha-fundo {
  position: fixed;
  inset: var(--altura-cabecalho) 0 0 auto;
  z-index: 1500;
  pointer-events: none;
}
.ficha {
  pointer-events: auto;
  position: fixed;
  top: var(--altura-cabecalho);
  right: 0;
  bottom: 0;
  width: min(460px, 100vw);
  background: var(--superficie);
  border-left: 1px solid var(--borda);
  box-shadow: var(--sombra-alta);
  display: flex;
  flex-direction: column;
}
.ficha__topo {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--borda);
  border-top: 4px solid v-bind('obra?.situacao.hex ?? "var(--azul)"');
}
.ficha__titulo {
  flex: 1;
  min-width: 0;
}
.ficha__titulo h2 {
  margin: 0;
  font-size: 1.12rem;
}
.ficha__tipo {
  margin: 0 0 2px;
  font-size: 0.8rem;
  color: var(--texto-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ficha__fechar {
  border: none;
  background: none;
  font-size: 1.7rem;
  line-height: 1;
  width: 38px;
  height: 38px;
  border-radius: var(--raio-p);
  cursor: pointer;
  color: var(--texto-2);
}
.ficha__fechar:hover {
  background: #f0f2f6;
}
@media (pointer: coarse) {
  .ficha__fechar {
    width: 44px;
    height: 44px;
  }
}
@media print {
  .ficha-fundo {
    display: none !important;
  }
}
.ficha__corpo {
  overflow-y: auto;
  padding: 14px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ficha__central {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--raio-p);
  border: 1px solid var(--azul);
  background: var(--azul-claro);
  color: var(--azul-escuro, var(--azul));
  text-decoration: none;
}
.ficha__central:hover {
  background: #dce8f6;
}
.ficha__central > span:first-child {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ficha__central small {
  color: var(--texto-2);
  font-size: 0.8rem;
}
@media (max-width: 640px) {
  .ficha-fundo {
    inset: 0;
    pointer-events: auto;
    background: rgba(10, 20, 40, 0.4);
  }
  .ficha {
    top: auto;
    left: 0;
    width: 100%;
    height: 88dvh;
    border-left: none;
    border-radius: 14px 14px 0 0;
  }
}
</style>
