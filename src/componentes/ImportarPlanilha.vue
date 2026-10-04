<script setup>
// Importação da planilha orçamentária do contrato: escolher o arquivo e a aba,
// conferir a linha de cabeçalho e as colunas, ver a prévia com os avisos e
// importar. A planilha anterior (se houver) fica guardada como versão antiga.
import { ref, computed } from 'vue';
import { api } from '../api/index.js';
import { mensagemDeFalhaAoGravar } from '../estado.js';
import { CAMPOS, acharCabecalho, lerPlanilha } from '../lib/planilha.js';
import { reais, lerNumero } from '../lib/formato.js';
import { numeroBr } from '../lib/documentos/conteudo.js';
import { novoId } from '../api/campos.js';
import Modal from './Modal.vue';

const props = defineProps({
  obra: { type: Object, required: true },
  temPlanilha: { type: Boolean, default: false },
});
const emit = defineEmits(['fechar', 'importou']);

const arquivo = ref(null);
const livro = ref(null);
const abas = ref([]);
const aba = ref('');
const linhas = ref([]);
const cabecalho = ref(-1); // índice (0 = primeira linha)
const mapa = ref({});
const lendo = ref(false);
const erro = ref('');
const salvando = ref(false);
const descricao = ref('Planilha orçamentária do contrato');
const dataBase = ref('');
const bdi = ref('');
const idImportacao = novoId(); // repetir depois de falha de rede não duplica

let XLSX;

async function escolherArquivo(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  erro.value = '';
  lendo.value = true;
  try {
    XLSX ??= await import('xlsx');
    const buffer = await f.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: false, dense: true });
    arquivo.value = f;
    livro.value = wb;
    abas.value = wb.SheetNames;
    // a primeira aba em que o cabeçalho aparece (orçamento costuma vir depois da capa)
    const comCabecalho = wb.SheetNames.find((n) => acharCabecalho(linhasDaAba(wb, n)) >= 0);
    selecionarAba(comCabecalho ?? wb.SheetNames[0]);
  } catch (ex) {
    erro.value = `Não foi possível ler o arquivo (${ex.message}). Salve como .xlsx ou .csv e tente de novo.`;
    livro.value = null;
  } finally {
    lendo.value = false;
  }
}

function linhasDaAba(wb, nome) {
  // blankrows: as linhas vazias ficam, para o número da linha nos avisos bater com o Excel
  return XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null, blankrows: true });
}

function selecionarAba(nome) {
  aba.value = nome;
  linhas.value = linhasDaAba(livro.value, nome);
  const lido = lerPlanilha(linhas.value);
  cabecalho.value = lido.cabecalho;
  mapa.value = { ...lido.mapa };
}

const resultado = computed(() => {
  if (!livro.value) return null;
  if (cabecalho.value < 0) return lerPlanilha(linhas.value, {}, -1);
  return lerPlanilha(linhas.value, mapa.value, cabecalho.value);
});

// Colunas para escolher: letra + o que está escrito no cabeçalho.
const letra = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const colunas = computed(() => {
  const cab = linhas.value[cabecalho.value] ?? [];
  const largura = Math.max(cab.length, ...linhas.value.slice(0, 60).map((l) => l?.length ?? 0));
  return Array.from({ length: largura }, (_, i) => ({ i, rotulo: `${letra(i)}${cab[i] ? `: ${String(cab[i]).slice(0, 40)}` : ''}` }));
});

const linhaCabecalho = computed({
  get: () => (cabecalho.value >= 0 ? cabecalho.value + 1 : ''),
  set: (v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > linhas.value.length) return;
    cabecalho.value = n - 1;
    mapa.value = { ...lerPlanilha(linhas.value, null, n - 1).mapa };
  },
});

function mudarColuna(campo, valor) {
  const m = { ...mapa.value };
  if (valor === '') delete m[campo];
  else m[campo] = Number(valor);
  mapa.value = m;
}

const itens = computed(() => resultado.value?.itens ?? []);
const resumo = computed(() => resultado.value?.resumo);
const avisos = computed(() => resultado.value?.avisos ?? []);
const diferenca = computed(() => {
  const v = Number(props.obra.valor_contrato ?? 0);
  return v && resumo.value ? Math.round((resumo.value.total - v) * 100) / 100 : 0;
});

const bdiErro = computed(() => {
  if (!String(bdi.value).trim()) return '';
  const n = Number(lerNumero(bdi.value));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? '' : 'BDI entre 0 e 100.';
});
const pronto = computed(() => itens.value.some((x) => x.nivel === 'item') && !bdiErro.value && !salvando.value);

async function importar() {
  if (!pronto.value) return;
  if (props.temPlanilha && !confirm('Importar esta planilha no lugar da atual? A atual fica guardada como versão anterior.')) return;
  salvando.value = true;
  erro.value = '';
  try {
    await api.importarOrcamento(
      props.obra.id,
      {
        id: idImportacao,
        descricao: descricao.value.trim(),
        data_base: dataBase.value.trim(),
        bdi_percentual: String(bdi.value).trim() ? Number(lerNumero(bdi.value)) : null,
        arquivo_origem: arquivo.value?.name ?? null,
      },
      itens.value.map(({ linha, ...x }) => x),
    );
    emit('importou');
  } catch (e) {
    erro.value = mensagemDeFalhaAoGravar(e);
  } finally {
    salvando.value = false;
  }
}

const dinheiro = (v) => (v === null || v === undefined ? '' : numeroBr(v, 2, 2));
const quant = (v) => (v === null || v === undefined ? '' : numeroBr(v, 4, 2));
const TIPOS = { servico: 'Serviço', material: 'Material', equipamento: 'Equipamento', outro: 'Outro' };
</script>

<template>
  <Modal :titulo="temPlanilha ? 'Importar nova versão da planilha' : 'Importar planilha de serviços'" largura="1040px" :sujo="!!livro" @fechar="emit('fechar')">
    <div class="importar">
      <label class="campo">
        <span>Arquivo da planilha orçamentária</span>
        <input type="file" accept=".xlsx,.xls,.xlsm,.ods,.csv" :disabled="lendo || salvando" @change="escolherArquivo" />
        <span class="ajuda">Excel (.xlsx, .xls), LibreOffice (.ods) ou CSV. O arquivo é lido aqui no navegador.</span>
      </label>
      <p v-if="lendo" class="mudo">Lendo o arquivo…</p>
      <p v-if="erro" class="caixa-erro" role="alert">{{ erro }}</p>

      <template v-if="livro">
        <div class="grade">
          <label v-if="abas.length > 1" class="campo">
            <span>Aba</span>
            <select :value="aba" @change="selecionarAba($event.target.value)">
              <option v-for="n in abas" :key="n" :value="n">{{ n }}</option>
            </select>
          </label>
          <label class="campo">
            <span>Linha do cabeçalho</span>
            <input v-model.lazy="linhaCabecalho" type="number" min="1" :max="linhas.length" inputmode="numeric" />
            <span class="ajuda">A linha com "Item", "Descrição", "Unid."...</span>
          </label>
        </div>

        <details class="importar__colunas" :open="cabecalho < 0 || !resumo?.itens">
          <summary>Colunas reconhecidas (confira e corrija se preciso)</summary>
          <div class="grade">
            <label v-for="c in CAMPOS" :key="c.campo" class="campo">
              <span>{{ c.rotulo }}</span>
              <select :value="mapa[c.campo] ?? ''" @change="mudarColuna(c.campo, $event.target.value)">
                <option value="">— não tem —</option>
                <option v-for="col in colunas" :key="col.i" :value="col.i">{{ col.rotulo }}</option>
              </select>
            </label>
          </div>
          <p class="mudo pequeno">
            Com dois preços unitários (sem e com BDI), use o "com BDI": é o que multiplicado pela quantidade dá o total.
            Linhas sem unidade, sem quantidade e sem preço viram etapas; linhas de subtotal e total servem só para conferir a soma.
          </p>
        </details>

        <section v-if="resumo" class="importar__resumo" aria-live="polite">
          <dl>
            <div><dt>Etapas</dt><dd class="num">{{ resumo.etapas }}</dd></div>
            <div><dt>Itens</dt><dd class="num">{{ resumo.itens }}</dd></div>
            <div><dt>Soma dos itens</dt><dd class="num">{{ reais(resumo.total) }}</dd></div>
            <div v-if="resumo.totalDeclarado !== null"><dt>Total escrito na planilha</dt><dd class="num">{{ reais(resumo.totalDeclarado) }}</dd></div>
            <div><dt>Valor do contrato</dt><dd class="num">{{ reais(obra.valor_contrato) || '—' }}</dd></div>
          </dl>
          <p v-if="diferenca" class="importar__aviso">
            A soma difere do valor do contrato em {{ reais(Math.abs(diferenca)) }} ({{ diferenca > 0 ? 'a mais' : 'a menos' }}).
          </p>
          <ul v-if="avisos.length" class="importar__avisos">
            <li v-for="a in avisos.slice(0, 12)" :key="a">{{ a }}</li>
            <li v-if="avisos.length > 12" class="mudo">e mais {{ avisos.length - 12 }} aviso(s).</li>
          </ul>
        </section>

        <div v-if="itens.length" class="tabela-rolagem importar__previa">
          <table class="tabela">
            <caption class="oculto">Prévia das primeiras linhas importadas</caption>
            <thead>
              <tr>
                <th>Linha</th>
                <th>Item</th>
                <th>Descrição</th>
                <th>Unid.</th>
                <th class="direita">Quant.</th>
                <th class="direita">Preço unit.</th>
                <th class="direita">Total</th>
                <th>Tipo</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="x in itens.slice(0, 60)" :key="x.linha" :class="x.nivel === 'etapa' && 'importar__etapa'">
                <td class="num mudo">{{ x.linha }}</td>
                <td class="num">{{ x.numero }}</td>
                <td>{{ x.descricao }}</td>
                <td>{{ x.unidade }}</td>
                <td class="direita num">{{ quant(x.quantidade) }}</td>
                <td class="direita num">{{ dinheiro(x.preco_unitario) }}</td>
                <td class="direita num">{{ dinheiro(x.total) }}</td>
                <td class="pequeno">{{ x.nivel === 'item' ? TIPOS[x.tipo] : 'etapa' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="itens.length > 60" class="mudo pequeno importar__mais">Mostrando 60 de {{ itens.length }} linhas.</p>
        </div>

        <div class="grade">
          <label class="campo">
            <span>Nome da planilha</span>
            <input v-model="descricao" type="text" maxlength="200" />
          </label>
          <label class="campo">
            <span>Data-base dos preços</span>
            <input v-model="dataBase" type="text" maxlength="120" placeholder="Ex.: SINAPI 03/2026 desonerado" />
          </label>
          <label class="campo" :class="bdiErro && 'campo--erro'">
            <span>BDI (%)</span>
            <input v-model="bdi" type="text" inputmode="decimal" placeholder="Ex.: 25,00" />
            <span v-if="bdiErro" class="erro-campo">{{ bdiErro }}</span>
          </label>
        </div>
        <p class="mudo pequeno">
          Materiais e serviços: se a planilha não tiver coluna de tipo, os itens entram como serviço; corrija os materiais
          depois, item a item, na aba "Serviços e etapas".
        </p>
      </template>
    </div>

    <template #rodape>
      <button class="btn" type="button" @click="emit('fechar')">Cancelar</button>
      <button class="btn btn--primario" type="button" :disabled="!pronto" @click="importar">
        {{ salvando ? 'Importando…' : `Importar ${resumo?.itens ?? 0} itens` }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.importar {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.importar__colunas summary {
  cursor: pointer;
  font-weight: 600;
  min-height: 32px;
}
.importar__colunas .grade {
  margin-top: 8px;
}
.importar__resumo dl {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px 14px;
  margin: 0;
  padding: 10px 12px;
  background: #f7f9fb;
  border: 1px solid var(--borda);
  border-radius: var(--raio-p);
}
.importar__resumo dt {
  font-size: 0.75rem;
  color: var(--texto-3);
  text-transform: uppercase;
}
.importar__resumo dd {
  margin: 0;
  font-weight: 600;
}
.importar__aviso,
.importar__avisos {
  margin: 8px 0 0;
  font-size: 0.88rem;
  color: var(--alerta);
}
.importar__avisos {
  padding-left: 18px;
}
.importar__previa {
  max-height: 340px;
  overflow: auto;
}
.importar__previa td {
  vertical-align: top;
  padding-top: 6px;
  padding-bottom: 6px;
}
.importar__etapa td {
  background: #eef2f8;
  font-weight: 700;
}
.importar__mais {
  padding: 6px 12px;
  margin: 0;
}
</style>
