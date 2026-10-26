<script setup>
// Linha do tempo da obra: lançamentos de percentual e atos (cadastro,
// aditivo, paralisação, retomada, arquivamento), do mais recente ao mais antigo.
import { ref, computed, watch } from 'vue';
import { FileText } from 'lucide-vue-next';
import { api } from '../api/index.js';
import { estado, pode, abrirAcao, nomeTipoDocumento, avisar } from '../estado.js';
import { rotuloEvento, exigeDocumento } from '../lib/eventos.js';
import { data, dataHora, pct } from '../lib/formato.js';

const props = defineProps({
  obra: { type: Object, required: true },
  limite: { type: Number, default: 0 }, // 0 = todos
});
const emit = defineEmits(['ver-tudo']);

const hist = ref({ atualizacoes: [], eventos: [] });
const carregando = ref(true);

let seq = 0;
async function carregar() {
  const n = ++seq;
  carregando.value = true;
  try {
    const h = await api.historico(props.obra.id);
    if (n === seq) hist.value = h;
  } catch (e) {
    if (n === seq) avisar(e.message, 'erro');
  } finally {
    if (n === seq) carregando.value = false;
  }
}
watch(() => [props.obra.id, estado.versao], carregar, { immediate: true });

const todos = computed(() => {
  const itens = [
    ...hist.value.atualizacoes.map((a) => ({ chave: `a${a.id}`, tipo: 'lancamento', em: a.criado_em, a })),
    ...hist.value.eventos.map((e) => ({
      chave: `e${e.id}`,
      tipo: 'evento',
      em: e.criado_em,
      e,
      pendente: exigeDocumento(e.tipo) && (!e.documento || e.documento.pendente),
    })),
  ];
  return itens.sort((x, y) => new Date(y.em) - new Date(x.em));
});
const itens = computed(() => (props.limite ? todos.value.slice(0, props.limite) : todos.value));

function descreverDocumento(d) {
  if (!d) return '';
  const partes = [nomeTipoDocumento(d.tipo)];
  if (d.numero) partes.push(`nº ${d.numero}`);
  if (d.numero_protocolo) partes.push(`protocolo ${d.numero_protocolo}${d.data_protocolo ? ` em ${data(d.data_protocolo)}` : ''}`);
  return partes.join(', ');
}
</script>

<template>
  <div class="historico">
    <p v-if="carregando && !todos.length" class="mudo">Carregando…</p>
    <p v-else-if="!todos.length" class="mudo">Nada registrado ainda.</p>
    <ol v-else class="tempo">
      <li v-for="i in itens" :key="i.chave" :class="['tempo__item', `tempo__item--${i.tipo === 'evento' ? i.e.tipo : 'lancamento'}`]">
        <template v-if="i.tipo === 'lancamento'">
          <p class="tempo__titulo">
            Lançamento
            <span class="num">{{ i.a.percentual_anterior !== null ? `${pct(i.a.percentual_anterior)} → ` : '' }}<strong>{{ pct(i.a.percentual_executado) }}</strong></span>
            <span
              v-if="i.a.percentual_anterior !== null && Number(i.a.percentual_executado) < Number(i.a.percentual_anterior)"
              class="etiqueta etiqueta--alerta"
            >redução</span>
          </p>
          <p v-if="i.a.observacao" class="tempo__texto">{{ i.a.observacao }}</p>
          <p class="tempo__meta">{{ i.a.autor_nome }} · {{ dataHora(i.a.criado_em) }}</p>
        </template>
        <template v-else>
          <p class="tempo__titulo">
            {{ rotuloEvento(i.e.tipo) }}
            <span v-if="i.e.data_evento" class="mudo num">em {{ data(i.e.data_evento) }}</span>
          </p>
          <p v-if="i.e.tipo === 'aditivo_prazo'" class="tempo__texto num">
            Término {{ data(i.e.dados.termino_anterior) }} → <strong>{{ data(i.e.dados.termino_novo) }}</strong>
          </p>
          <p v-if="i.e.tipo === 'retomada' && i.e.dados.dias_paralisada !== undefined" class="tempo__texto">
            Ficou {{ i.e.dados.dias_paralisada }} dias paralisada.
          </p>
          <p v-if="i.e.descricao && i.e.tipo !== 'cadastro'" class="tempo__texto">{{ i.e.descricao }}</p>
          <p v-if="i.e.documento" class="tempo__doc">
            <FileText class="icone" aria-hidden="true" />{{ descreverDocumento(i.e.documento) }}
          </p>
          <p v-if="i.pendente" class="tempo__pendente">
            <span class="etiqueta etiqueta--pendencia">Documento pendente</span>
            <button v-if="pode('documento.editar')" type="button" class="btn btn--link" @click="abrirAcao('documento', obra, i.e)">
              Completar documento
            </button>
          </p>
          <p class="tempo__meta">{{ i.e.autor_nome }} · {{ dataHora(i.e.criado_em) }}</p>
        </template>
      </li>
    </ol>
    <button v-if="limite && todos.length > limite" type="button" class="btn btn--link" @click="emit('ver-tudo')">
      Ver histórico completo ({{ todos.length }})
    </button>
  </div>
</template>

<style scoped>
.historico {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.historico p {
  margin: 0;
}
.tempo {
  list-style: none;
  margin: 0;
  padding: 0 0 0 16px;
  border-left: 1px solid var(--borda-forte);
  width: 100%;
}
.tempo__item {
  position: relative;
  padding: 0 0 16px 14px;
}
.tempo__item::before {
  content: '';
  position: absolute;
  left: -21px;
  top: 6px;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: var(--marcador, var(--texto-3));
  box-shadow: 0 0 0 3px var(--superficie);
}
.tempo__item--paralisacao { --marcador: var(--s-paralisada); }
.tempo__item--retomada { --marcador: var(--s-em-dia); }
.tempo__item--aditivo_prazo { --marcador: var(--s-concluida); }
.tempo__item--arquivamento { --marcador: var(--s-atrasada); }
.tempo__item--cadastro { --marcador: var(--azul); }
.tempo__item--lancamento { --marcador: #a3aab4; }
.tempo__titulo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}
.tempo__texto {
  margin-top: 2px !important;
}
.tempo__doc {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px !important;
  font-size: 0.88rem;
  color: var(--texto-2);
}
.tempo__doc .icone {
  width: 14px;
  height: 14px;
}
.tempo__pendente {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px !important;
}
.tempo__meta {
  margin-top: 3px !important;
  font-size: 0.84rem;
  color: var(--texto-3);
}
</style>
