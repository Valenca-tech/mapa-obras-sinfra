<script setup>
// Prévia da obra selecionada no mapa: o essencial e o caminho para a página
// completa. Esc ou × fecham (e o "voltar" do celular também).
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { X, ArrowRight, TriangleAlert } from 'lucide-vue-next';
import { estado, pode, abrirAcao, nomeTipo } from '../estado.js';
import { modoDemo } from '../api/index.js';
import { fecharPrevia } from '../rotas.js';
import { usarObra } from '../lib/usarObra.js';
import { textoSemAtualizacao } from '../lib/situacao.js';
import { data, reais, haDias, dataHora } from '../lib/formato.js';
import SeloSituacao from './SeloSituacao.vue';
import BarrasAvanco from './BarrasAvanco.vue';

const props = defineProps({ id: { type: String, required: true } });
const { obra, naoEncontrada } = usarObra(() => props.id);
const botaoFechar = ref(null);

const aoTeclar = (e) => e.key === 'Escape' && !estado.acao && fecharPrevia();
onMounted(async () => {
  document.addEventListener('keydown', aoTeclar);
  await nextTick();
  botaoFechar.value?.focus();
});
onBeforeUnmount(() => document.removeEventListener('keydown', aoTeclar));
</script>

<template>
  <aside class="previa" :aria-label="obra ? `Obra ${obra.nome}` : 'Obra selecionada'">
    <header class="previa__topo">
      <div class="previa__titulo">
        <p v-if="obra" class="previa__tipo">{{ nomeTipo(obra.tipo) }}<template v-if="obra.bairro"> · {{ obra.bairro }}</template></p>
        <h2>
          <RouterLink v-if="obra" :to="`/obras/${obra.id}`">{{ obra.nome }}</RouterLink>
          <template v-else>{{ naoEncontrada ? 'Obra não encontrada' : 'Carregando…' }}</template>
        </h2>
      </div>
      <button ref="botaoFechar" type="button" class="btn btn--fantasma btn--icone" aria-label="Fechar" @click="fecharPrevia">
        <X class="icone" aria-hidden="true" />
      </button>
    </header>

    <div v-if="obra" class="previa__corpo">
      <div class="previa__selos">
        <SeloSituacao :situacao="obra.situacao" />
        <span v-if="obra.prorrogada" class="etiqueta etiqueta--info">Prorrogada</span>
        <span v-if="obra.pendencias_documentais > 0" class="etiqueta etiqueta--pendencia">Documento pendente</span>
        <span v-if="obra.demo && !modoDemo" class="etiqueta etiqueta--demo">Fictícia</span>
      </div>
      <p v-if="obra.situacao.alertaSemAtualizacao" class="caixa-alerta">
        <TriangleAlert class="icone" aria-hidden="true" />{{ textoSemAtualizacao(obra.situacao) }}.
      </p>
      <p v-if="obra.paralisada" class="caixa-alerta">
        <span><strong>Paralisada desde {{ data(obra.paralisada_desde) }}.</strong> {{ obra.motivo_paralisacao }}</span>
      </p>

      <BarrasAvanco :situacao="obra.situacao" />

      <dl class="previa__dados">
        <div><dt>Contrato</dt><dd>{{ obra.numero_contrato || '–' }}</dd></div>
        <div><dt>Valor</dt><dd class="num">{{ reais(obra.valor_contrato) || '–' }}</dd></div>
        <div class="previa__largo"><dt>Empresa</dt><dd>{{ obra.empresa || '–' }}</dd></div>
        <div><dt>Término previsto</dt><dd class="num">{{ data(obra.data_termino_prevista) }}</dd></div>
        <div>
          <dt>Último lançamento</dt>
          <dd>
            <template v-if="obra.ultima_atualizacao_em">
              <span :title="dataHora(obra.ultima_atualizacao_em)">{{ haDias(obra.situacao.diasDesdeLancamento) }}</span>
            </template>
            <template v-else>nunca</template>
          </dd>
        </div>
      </dl>

      <div class="previa__acoes">
        <RouterLink :to="`/obras/${obra.id}`" class="btn btn--primario">
          Abrir obra <ArrowRight class="icone" aria-hidden="true" />
        </RouterLink>
        <button v-if="pode('percentual.lancar') && !obra.arquivada" type="button" class="btn" @click="abrirAcao('lancar', obra)">
          Lançar percentual
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.previa {
  display: flex;
  flex-direction: column;
  background: var(--superficie);
  border-radius: var(--raio-g);
  box-shadow: var(--sombra-alta);
  overflow: hidden;
}
.previa__topo {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 8px 10px 16px;
  border-bottom: 1px solid var(--borda);
}
.previa__titulo {
  flex: 1;
  min-width: 0;
}
.previa__tipo {
  margin: 0 0 2px;
  font-size: 0.84rem;
  color: var(--texto-3);
}
.previa__titulo h2 {
  margin: 0;
  font-size: 1.02rem;
}
.previa__titulo h2 a {
  color: var(--texto);
  text-decoration: none;
}
.previa__titulo h2 a:hover {
  color: var(--azul);
  text-decoration: underline;
}
.previa__corpo {
  overflow-y: auto;
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.previa__selos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: center;
}
.previa__dados {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--borda);
}
.previa__dados dt {
  font-size: 0.82rem;
  color: var(--texto-3);
}
.previa__dados dd {
  margin: 1px 0 0;
  overflow-wrap: anywhere;
}
.previa__largo {
  grid-column: 1 / -1;
}
.previa__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
@media (max-width: 760px) {
  .previa {
    border-radius: var(--raio-g) var(--raio-g) 0 0;
  }
}
</style>
