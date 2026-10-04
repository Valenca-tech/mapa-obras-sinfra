<script setup>
// Correção de um item da planilha (ou item/etapa novo). Mudou quantidade ou
// preço: o total é recalculado. "Tirar da planilha" não apaga: o item fica
// na lista de removidos e pode voltar.
import { ref, computed } from 'vue';
import { api } from '../api/index.js';
import { mensagemDeFalhaAoGravar } from '../estado.js';
import { lerNumero, reais } from '../lib/formato.js';
import { numeroBr } from '../lib/documentos/conteudo.js';
import { novoId } from '../api/campos.js';
import Modal from './Modal.vue';

const props = defineProps({
  orcamento: { type: Object, required: true },
  itens: { type: Array, required: true }, // todos, inclusive removidos (para a ordem)
  item: { type: Object, default: null }, // null = novo
});
const emit = defineEmits(['fechar', 'salvou']);

const novo = !props.item;
const idNovo = novoId();
const ordenados = computed(() => [...props.itens].sort((a, b) => a.ordem - b.ordem));
const vigentes = computed(() => ordenados.value.filter((x) => !x.removido));

const textoNum = (v, casas) => (v === null || v === undefined ? '' : numeroBr(v, casas));
const inicial = {
  nivel: props.item?.nivel ?? 'item',
  numero: props.item?.numero ?? '',
  codigo: props.item?.codigo ?? '',
  fonte: props.item?.fonte ?? '',
  descricao: props.item?.descricao ?? '',
  unidade: props.item?.unidade ?? '',
  quantidade: textoNum(props.item?.quantidade, 4),
  preco_unitario: textoNum(props.item?.preco_unitario, 2),
  tipo: props.item?.tipo ?? 'servico',
  depois: vigentes.value.at(-1)?.id ?? '',
};
const f = ref({ ...inicial });
const sujo = computed(() => JSON.stringify(f.value) !== JSON.stringify(inicial));
const salvando = ref(false);
const erro = ref('');

const ehItem = computed(() => f.value.nivel === 'item');
const qtd = computed(() => lerNumero(f.value.quantidade));
const preco = computed(() => lerNumero(f.value.preco_unitario));
const erros = computed(() => {
  const e = {};
  if (!f.value.descricao.trim()) e.descricao = 'Informe a descrição.';
  if (ehItem.value) {
    if (Number.isNaN(qtd.value)) e.quantidade = 'Número inválido.';
    else if (qtd.value !== null && qtd.value < 0) e.quantidade = 'Não pode ser negativa.';
    if (Number.isNaN(preco.value)) e.preco_unitario = 'Número inválido.';
    else if (preco.value !== null && preco.value < 0) e.preco_unitario = 'Não pode ser negativo.';
  }
  return e;
});
const total = computed(() =>
  ehItem.value && qtd.value !== null && preco.value !== null && !Number.isNaN(qtd.value) && !Number.isNaN(preco.value)
    ? Math.round(qtd.value * preco.value * 100) / 100
    : null,
);

function campos() {
  const v = f.value;
  const c = {
    numero: v.numero.trim() || null,
    descricao: v.descricao.trim(),
  };
  if (ehItem.value) {
    Object.assign(c, {
      codigo: v.codigo.trim() || null,
      fonte: v.fonte.trim() || null,
      unidade: v.unidade.trim() || null,
      quantidade: qtd.value,
      preco_unitario: preco.value,
      total: total.value,
      tipo: v.tipo,
    });
  }
  return c;
}

// Ordem para o item novo: entre o escolhido e o seguinte. Sem espaço (ordem
// seguida), empurra os de baixo 10 posições.
async function ordemNova() {
  const lista = ordenados.value;
  const i = lista.findIndex((x) => x.id === f.value.depois);
  const anterior = i >= 0 ? lista[i].ordem : 0;
  const seguinte = lista[i + 1]?.ordem;
  if (seguinte === undefined) return anterior + 10;
  if (seguinte - anterior >= 2) return Math.floor((anterior + seguinte) / 2);
  for (const x of lista.slice(i + 1).reverse()) await api.editarItemOrcamento(x.id, { ordem: x.ordem + 10 });
  return anterior + 5;
}

async function salvar() {
  if (Object.keys(erros.value).length || salvando.value) return;
  salvando.value = true;
  erro.value = '';
  try {
    if (novo) {
      const ordem = await ordemNova();
      await api.adicionarItemOrcamento(props.orcamento.id, { id: idNovo, ordem, nivel: f.value.nivel, ...campos() });
      emit('salvou', f.value.nivel === 'etapa' ? 'Etapa acrescentada.' : 'Item acrescentado.');
    } else {
      await api.editarItemOrcamento(props.item.id, campos());
      emit('salvou', 'Item corrigido.');
    }
  } catch (e) {
    erro.value = mensagemDeFalhaAoGravar(e);
  } finally {
    salvando.value = false;
  }
}

async function remover() {
  if (!confirm(`Tirar "${props.item.descricao}" da planilha? Ele fica na lista de itens removidos e pode voltar.`)) return;
  salvando.value = true;
  erro.value = '';
  try {
    await api.editarItemOrcamento(props.item.id, { removido: true });
    emit('salvou', 'Item tirado da planilha.');
  } catch (e) {
    erro.value = mensagemDeFalhaAoGravar(e);
  } finally {
    salvando.value = false;
  }
}

const rotuloLinha = (x) => `${x.numero ? `${x.numero} ` : ''}${x.descricao}`.slice(0, 80);
</script>

<template>
  <Modal :titulo="novo ? 'Acrescentar à planilha' : `Corrigir ${item.nivel === 'etapa' ? 'etapa' : 'item'} ${item.numero ?? ''}`" largura="640px" :sujo="sujo" @fechar="emit('fechar')">
    <form class="item" @submit.prevent="salvar">
      <div v-if="novo" class="grade">
        <label class="campo">
          <span>O que acrescentar</span>
          <select v-model="f.nivel">
            <option value="item">Item (serviço ou material)</option>
            <option value="etapa">Etapa (título)</option>
          </select>
        </label>
        <label class="campo">
          <span>Logo depois de</span>
          <select v-model="f.depois">
            <option v-for="x in vigentes" :key="x.id" :value="x.id">{{ rotuloLinha(x) }}</option>
          </select>
        </label>
      </div>

      <div class="grade">
        <label class="campo">
          <span>Item (numeração)</span>
          <input v-model="f.numero" type="text" maxlength="20" placeholder="Ex.: 3.4" />
        </label>
        <template v-if="ehItem">
          <label class="campo">
            <span>Código</span>
            <input v-model="f.codigo" type="text" maxlength="40" />
          </label>
          <label class="campo">
            <span>Fonte</span>
            <input v-model="f.fonte" type="text" maxlength="40" placeholder="SINAPI, SICRO, ORSE, própria" />
          </label>
        </template>
      </div>

      <label class="campo" :class="erros.descricao && 'campo--erro'">
        <span>Descrição <span class="obrig">*</span></span>
        <textarea v-model="f.descricao" maxlength="2000" rows="3"></textarea>
        <span v-if="erros.descricao" class="erro-campo">{{ erros.descricao }}</span>
      </label>

      <div v-if="ehItem" class="grade">
        <label class="campo">
          <span>Tipo</span>
          <select v-model="f.tipo">
            <option value="servico">Serviço</option>
            <option value="material">Material</option>
            <option value="equipamento">Equipamento</option>
            <option value="outro">Outro</option>
          </select>
        </label>
        <label class="campo">
          <span>Unidade</span>
          <input v-model="f.unidade" type="text" maxlength="20" placeholder="m², m³, un, vb" />
        </label>
        <label class="campo" :class="erros.quantidade && 'campo--erro'">
          <span>Quantidade</span>
          <input v-model="f.quantidade" type="text" inputmode="decimal" />
          <span v-if="erros.quantidade" class="erro-campo">{{ erros.quantidade }}</span>
        </label>
        <label class="campo" :class="erros.preco_unitario && 'campo--erro'">
          <span>Preço unitário (R$)</span>
          <input v-model="f.preco_unitario" type="text" inputmode="decimal" />
          <span v-if="erros.preco_unitario" class="erro-campo">{{ erros.preco_unitario }}</span>
        </label>
      </div>
      <p v-if="ehItem" class="item__total">
        Total: <strong class="num">{{ total === null ? '—' : reais(total) }}</strong>
        <span v-if="!novo && item.total !== null && total !== null && Number(item.total) !== total" class="mudo pequeno">
          (antes: {{ reais(item.total) }})
        </span>
      </p>
      <p v-if="erro" class="caixa-erro" role="alert">{{ erro }}</p>
      <button type="submit" class="oculto" tabindex="-1">Salvar</button>
    </form>

    <template #rodape>
      <button v-if="!novo" class="btn btn--perigo item__remover" type="button" :disabled="salvando" @click="remover">
        Tirar da planilha
      </button>
      <button class="btn" type="button" @click="emit('fechar')">Cancelar</button>
      <button class="btn btn--primario" type="button" :disabled="salvando || !!Object.keys(erros).length" @click="salvar">
        {{ salvando ? 'Salvando…' : 'Salvar' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.item {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.item__total {
  margin: 0;
}
.item__remover {
  margin-right: auto;
}
</style>
