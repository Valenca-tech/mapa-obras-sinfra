<script setup>
// Aba "Serviços e etapas" da Central: a planilha orçamentária do contrato
// (importada do Excel), com etapas, subtotais, serviços e materiais. Quem tem
// "orcamento.editar" importa, corrige item a item e acrescenta itens.
import { ref, computed, watch } from 'vue';
import { api } from '../api/index.js';
import { estado, pode, avisar, aposGravar } from '../estado.js';
import { estruturar } from '../lib/planilha.js';
import { dataHora, reais } from '../lib/formato.js';
import { numeroBr } from '../lib/documentos/conteudo.js';
import { semAcento } from '../lib/texto.js';
import { Plus, Upload, Download, TriangleAlert, Search } from 'lucide-vue-next';
import ImportarPlanilha from './ImportarPlanilha.vue';
import ItemPlanilha from './ItemPlanilha.vue';
import GerarDocumento from './GerarDocumento.vue';

const props = defineProps({ obra: { type: Object, required: true } });

const planilha = ref(null); // { orcamento, itens }
const versoes = ref([]);
const carregando = ref(true);
const importando = ref(false);
const editando = ref(null); // { item } ou { novo: true, depois }
const exportando = ref(false);
const filtroTipo = ref('todos');
const busca = ref('');
const verRemovidos = ref(false);

const podeEditar = computed(() => pode('orcamento.editar') && !props.obra.arquivada);

let seq = 0;
async function carregar() {
  const n = ++seq;
  carregando.value = true;
  try {
    const [p, v] = await Promise.all([api.obterOrcamento(props.obra.id), api.listarOrcamentos(props.obra.id)]);
    if (n !== seq) return;
    planilha.value = p;
    versoes.value = v;
  } catch (e) {
    if (n === seq) avisar(e.message, 'erro');
  } finally {
    if (n === seq) carregando.value = false;
  }
}
watch(() => [props.obra.id, estado.versao], carregar, { immediate: true });

const TIPOS = { servico: 'Serviço', material: 'Material', equipamento: 'Equipamento', outro: 'Outro' };
const PLURAL = { servico: 'Serviços', material: 'Materiais', equipamento: 'Equipamentos', outro: 'Outros' };

const estrutura = computed(() => estruturar(planilha.value?.itens ?? []));
const removidos = computed(() => (planilha.value?.itens ?? []).filter((x) => x.removido));

// Totais por tipo (materiais x serviços), sobre os itens vigentes.
const porTipo = computed(() => {
  const t = {};
  for (const x of estrutura.value.linhas) if (x.nivel === 'item') t[x.tipo] = (t[x.tipo] ?? 0) + Number(x.total ?? 0);
  return Object.entries(t).sort((a, b) => b[1] - a[1]);
});
const diferenca = computed(() => {
  const v = Number(props.obra.valor_contrato ?? 0);
  return v ? Math.round((estrutura.value.total - v) * 100) / 100 : 0;
});

// Filtro por tipo e busca: subtotais refeitos só com os itens que ficaram;
// etapas vazias somem.
const linhas = computed(() => {
  const itens = (planilha.value?.itens ?? []).filter((x) => !x.removido);
  const termo = semAcento(busca.value.trim());
  if (filtroTipo.value === 'todos' && !termo) return estrutura.value.linhas;
  const filtradas = itens.filter(
    (x) =>
      x.nivel === 'etapa' ||
      ((filtroTipo.value === 'todos' || x.tipo === filtroTipo.value) &&
        (!termo || semAcento(`${x.numero ?? ''} ${x.codigo ?? ''} ${x.descricao}`).includes(termo))),
  );
  const est = estruturar(filtradas);
  // etapa fica se tem item visível dentro (subtotal > 0 ou algum item depois dela antes da próxima do mesmo nível)
  return est.linhas.filter((x, i, todas) => {
    if (x.nivel === 'item') return true;
    for (let j = i + 1; j < todas.length; j++) {
      if (todas[j].nivel === 'etapa' && todas[j].profundidade <= x.profundidade) return false;
      if (todas[j].nivel === 'item') return true;
    }
    return false;
  });
});
const totalFiltrado = computed(() => linhas.value.filter((x) => x.nivel === 'item').reduce((s, x) => s + Number(x.total ?? 0), 0));
const filtrado = computed(() => filtroTipo.value !== 'todos' || busca.value.trim());

const quant = (v) => (v === null || v === undefined ? '' : numeroBr(v, 4, 2));
const dinheiro = (v) => (v === null || v === undefined ? '' : numeroBr(v, 2, 2));

async function restaurar(item) {
  try {
    await api.editarItemOrcamento(item.id, { removido: false });
    await aposGravar('Item de volta à planilha.');
  } catch (e) {
    avisar(e.message, 'erro');
  }
}

// aposGravar recarrega as obras (o título da aba mostra "sem planilha") e
// avisa as telas abertas, esta inclusive.
async function aoSalvar(mensagem) {
  editando.value = null;
  importando.value = false;
  await aposGravar(mensagem);
}
</script>

<template>
  <div class="planilha">
    <p v-if="carregando && !planilha" class="mudo">Carregando…</p>

    <div v-else-if="!planilha" class="vazio">
      <strong>Sem planilha de serviços</strong>
      <p>
        Importe a planilha orçamentária do contrato (Excel, ODS ou CSV). Colunas e etapas são reconhecidas na importação
        e cada item pode ser corrigido depois.
      </p>
      <button v-if="podeEditar" class="btn btn--primario" @click="importando = true">
        <Upload class="icone" aria-hidden="true" />Importar planilha
      </button>
      <p v-else class="pequeno">A importação é feita pelo gabinete.</p>
    </div>

    <template v-else>
      <section class="painel planilha__cabecalho">
        <div class="planilha__ident">
          <h2>{{ planilha.orcamento.descricao }}</h2>
          <p class="mudo pequeno">
            <template v-if="planilha.orcamento.data_base">Data-base: {{ planilha.orcamento.data_base }} · </template>
            <template v-if="planilha.orcamento.bdi_percentual !== null">BDI {{ numeroBr(planilha.orcamento.bdi_percentual, 2) }}% · </template>
            <template v-if="planilha.orcamento.arquivo_origem">Arquivo {{ planilha.orcamento.arquivo_origem }} · </template>
            importada em {{ dataHora(planilha.orcamento.criado_em) }}
            <template v-if="versoes.length > 1"> · {{ versoes.length - 1 }} versão(ões) anterior(es) guardada(s)</template>
          </p>
        </div>
        <dl class="planilha__totais">
          <div>
            <dt>Total da planilha</dt>
            <dd class="num">{{ reais(estrutura.total) }}</dd>
          </div>
          <div>
            <dt>Valor do contrato</dt>
            <dd class="num">{{ reais(obra.valor_contrato) || '–' }}</dd>
          </div>
          <div v-for="[tipo, valor] in porTipo" :key="tipo">
            <dt>{{ PLURAL[tipo] ?? tipo }}</dt>
            <dd class="num">{{ reais(valor) }}</dd>
          </div>
          <div>
            <dt>Itens e etapas</dt>
            <dd class="num">{{ estrutura.itens }} itens em {{ estrutura.etapas }} etapas</dd>
          </div>
        </dl>
        <p v-if="diferenca" class="caixa-alerta" role="note">
          <TriangleAlert class="icone" aria-hidden="true" />
          <span>
            A soma da planilha difere do valor do contrato em {{ reais(Math.abs(diferenca)) }}
            ({{ diferenca > 0 ? 'a mais' : 'a menos' }}). Confira se faltou alguma linha, se o BDI está fora dos preços ou se
            houve aditivo de valor.
          </span>
        </p>
      </section>

      <div class="planilha__barra">
        <label class="planilha__filtro">
          <span class="oculto">Mostrar</span>
          <select v-model="filtroTipo" class="controle">
            <option value="todos">Todos os itens</option>
            <option value="servico">Só serviços</option>
            <option value="material">Só materiais</option>
            <option value="equipamento">Só equipamentos</option>
            <option value="outro">Outros</option>
          </select>
        </label>
        <label class="planilha__busca">
          <span class="oculto">Procurar</span>
          <Search class="icone" aria-hidden="true" />
          <input v-model="busca" class="controle" type="search" placeholder="Procurar descrição, código ou item" />
        </label>
        <div class="acoes planilha__acoes">
          <button v-if="pode('documento.gerar')" class="btn" @click="exportando = true">
            <Download class="icone" aria-hidden="true" />Exportar
          </button>
          <button v-if="podeEditar" class="btn" @click="editando = { novo: true }">
            <Plus class="icone" aria-hidden="true" />Adicionar item
          </button>
          <button v-if="podeEditar" class="btn" @click="importando = true">
            <Upload class="icone" aria-hidden="true" />Importar nova versão
          </button>
        </div>
      </div>
      <p v-if="filtrado" class="mudo pequeno">
        {{ linhas.filter((x) => x.nivel === 'item').length }} itens mostrados, somando {{ reais(totalFiltrado) }}.
      </p>

      <div class="tabela-rolagem">
        <table class="tabela planilha__tabela">
          <thead>
            <tr>
              <th>Item</th>
              <th class="col-codigo">Código</th>
              <th>Descrição</th>
              <th class="col-tipo">Tipo</th>
              <th>Unid.</th>
              <th class="direita">Quant.</th>
              <th class="direita">Preço unit. (R$)</th>
              <th class="direita">Total (R$)</th>
              <th v-if="podeEditar" class="nao-imprimir"><span class="oculto">Editar</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="x in linhas" :key="x.id" :class="x.nivel === 'etapa' ? 'planilha__etapa' : ''">
              <td class="num">{{ x.numero }}</td>
              <td class="col-codigo pequeno">
                <template v-if="x.nivel === 'item'">{{ x.codigo }}<small v-if="x.fonte" class="mudo"><br />{{ x.fonte }}</small></template>
              </td>
              <td :style="{ paddingLeft: `${12 + Math.max(0, x.profundidade - 1) * 14}px` }">{{ x.descricao }}</td>
              <td class="col-tipo pequeno">{{ x.nivel === 'item' ? TIPOS[x.tipo] : '' }}</td>
              <td>{{ x.unidade }}</td>
              <td class="direita num">{{ x.nivel === 'item' ? quant(x.quantidade) : '' }}</td>
              <td class="direita num">{{ x.nivel === 'item' ? dinheiro(x.preco_unitario) : '' }}</td>
              <td class="direita num">{{ x.nivel === 'item' ? dinheiro(x.total) : dinheiro(x.subtotal) }}</td>
              <td v-if="podeEditar" class="nao-imprimir">
                <button class="btn btn--link planilha__editar" :aria-label="`Editar ${x.numero ?? ''} ${x.descricao}`" @click="editando = { item: x }">
                  Editar
                </button>
              </td>
            </tr>
            <tr v-if="!linhas.length">
              <td :colspan="podeEditar ? 9 : 8" class="mudo">Nenhum item com estes filtros.</td>
            </tr>
          </tbody>
          <tfoot v-if="!filtrado">
            <tr class="planilha__total">
              <td colspan="7">TOTAL GERAL</td>
              <td class="direita num">{{ dinheiro(estrutura.total) }}</td>
              <td v-if="podeEditar"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section v-if="removidos.length" class="planilha__removidos">
        <label class="planilha__check">
          <input v-model="verRemovidos" type="checkbox" />
          Itens tirados da planilha ({{ removidos.length }})
        </label>
        <ul v-if="verRemovidos">
          <li v-for="x in removidos" :key="x.id">
            <span>{{ x.numero }} {{ x.descricao }} <span class="mudo num">({{ reais(x.total) }})</span></span>
            <button v-if="podeEditar" class="btn btn--link" @click="restaurar(x)">Pôr de volta</button>
          </li>
        </ul>
      </section>
    </template>

    <ImportarPlanilha
      v-if="importando"
      :obra="obra"
      :tem-planilha="!!planilha"
      @fechar="importando = false"
      @importou="aoSalvar('Planilha importada.')"
    />
    <ItemPlanilha
      v-if="editando"
      :orcamento="planilha?.orcamento"
      :itens="planilha?.itens ?? []"
      :item="editando.item ?? null"
      @fechar="editando = null"
      @salvou="aoSalvar"
    />
    <GerarDocumento v-if="exportando" :obra="obra" tipo-inicial="planilha_servicos" @fechar="exportando = false" />
  </div>
</template>

<style scoped>
.planilha {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.planilha__cabecalho {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.planilha__ident h2 {
  margin: 0;
  font-size: 1rem;
}
.planilha__ident p {
  margin: 2px 0 0;
}
.planilha__totais {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 8px 16px;
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--borda);
}
.planilha__totais dt {
  font-size: 0.84rem;
  color: var(--texto-3);
}
.planilha__totais dd {
  margin: 1px 0 0;
  font-weight: 600;
}
.planilha__barra {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.planilha__filtro {
  width: 190px;
}
.planilha__busca {
  flex: 1;
  min-width: 200px;
  max-width: 360px;
  position: relative;
}
.planilha__busca .icone {
  position: absolute;
  left: 9px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--texto-3);
  pointer-events: none;
}
.planilha__busca input {
  padding-left: 32px;
}
.planilha__acoes {
  margin-left: auto;
}
.planilha__tabela td {
  vertical-align: top;
}
.planilha__etapa td {
  background: var(--superficie-2);
  font-weight: 600;
}
.planilha__total td {
  font-weight: 600;
}
.planilha__editar {
  padding: 0 4px;
  min-height: 0;
}
.planilha__removidos ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
.planilha__removidos li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.planilha__check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  min-height: 40px;
}
.planilha__check input {
  width: 18px;
  height: 18px;
}
@media (max-width: 760px) {
  .col-codigo,
  .col-tipo {
    display: none;
  }
}
</style>
