<script setup>
// Central de Obras: todas as obras ativas em tabela. Cada linha abre a página
// da obra (resumo, serviços e etapas, documentos); o mapa continua sendo a
// tela de entrada e a ficha lateral leva para cá.
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/index.js';
import { pode, obrasFiltradas, recarregarObras, nomeTipo, avisar, estado } from '../estado.js';
import { data, dataHora, pct, reais, haDias } from '../lib/formato.js';
import { diaEmImperatriz } from '../lib/situacao.js';
import Totais from '../componentes/Totais.vue';
import Filtros from '../componentes/Filtros.vue';
import SeloSituacao from '../componentes/SeloSituacao.vue';

const roteador = useRouter();
onMounted(() => recarregarObras().catch((e) => avisar(e.message, 'erro')));

const COLUNAS = [
  { chave: 'nome', rotulo: 'Obra', valor: (o) => o.nome },
  { chave: 'tipo', rotulo: 'Tipo', valor: (o) => nomeTipo(o.tipo), classe: 'col-secundaria' },
  { chave: 'situacao', rotulo: 'Situação', valor: (o) => o.situacao.ordem * 1000 - o.situacao.desvio, classe: 'col-situacao' },
  { chave: 'executado', rotulo: 'Executado', valor: (o) => o.situacao.executado, direita: true },
  { chave: 'prazo', rotulo: 'Prazo decorrido', valor: (o) => o.situacao.prazoDecorrido, direita: true, classe: 'col-secundaria' },
  { chave: 'termino', rotulo: 'Término', valor: (o) => o.data_termino_prevista },
  { chave: 'atualizacao', rotulo: 'Última atualização', valor: (o) => o.situacao.diasSemAtualizacao ?? 99999 },
  { chave: 'valor', rotulo: 'Valor', valor: (o) => Number(o.valor_contrato ?? -1), direita: true },
  { chave: 'planilha', rotulo: 'Planilha', valor: (o) => (o.tem_planilha ? 1 : 0), classe: 'col-secundaria' },
];

const ordem = ref({ chave: 'situacao', asc: true });
const ordenar = (chave) =>
  (ordem.value = { chave, asc: ordem.value.chave === chave ? !ordem.value.asc : true });

const linhas = computed(() => {
  const col = COLUNAS.find((c) => c.chave === ordem.value.chave);
  const fator = ordem.value.asc ? 1 : -1;
  return [...obrasFiltradas.value].sort((a, b) => {
    const x = col.valor(a);
    const y = col.valor(b);
    const r = typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x - y;
    return r * fator || a.nome.localeCompare(b.nome, 'pt-BR');
  });
});

const seta = (chave) => (ordem.value.chave !== chave ? '' : ordem.value.asc ? '▲' : '▼');
const abrir = (o) => roteador.push(`/obras/${o.id}`);

// ---------------------------------------------------------------- arquivadas

// Arquivada some do mapa, da lista e do relatório; aqui ela pode ser achada
// para consulta e desarquivada (pela ficha).
const verArquivadas = ref(false);
const arquivadas = ref([]);
const carregandoArquivadas = ref(false);

async function carregarArquivadas() {
  if (!verArquivadas.value) {
    arquivadas.value = [];
    return;
  }
  carregandoArquivadas.value = true;
  try {
    arquivadas.value = await api.listarObras({ arquivadas: true });
  } catch (e) {
    avisar(e.message, 'erro');
  } finally {
    carregandoArquivadas.value = false;
  }
}
watch(verArquivadas, carregarArquivadas);
watch(() => estado.versao, carregarArquivadas); // desarquivou pela ficha
</script>

<template>
  <div>
    <div class="barra-titulo">
      <div>
        <h1>Central de Obras</h1>
        <p class="mudo pequeno lista__sub">Obras ativas. Abra uma obra para ver serviços, etapas e valores e emitir documentos.</p>
      </div>
      <div class="acoes">
        <RouterLink to="/mapa" class="btn">Ver no mapa</RouterLink>
        <RouterLink to="/relatorio" class="btn">Imprimir relatório</RouterLink>
        <RouterLink v-if="pode('obra.cadastrar')" to="/obras/nova" class="btn btn--primario">+ Nova obra</RouterLink>
      </div>
    </div>

    <div class="lista__topo">
      <Totais />
      <Filtros />
    </div>

    <div class="tabela-rolagem">
      <table class="tabela lista__tabela">
        <thead>
          <tr>
            <th
              v-for="c in COLUNAS"
              :key="c.chave"
              :class="[c.direita && 'direita', c.classe]"
              :aria-sort="ordem.chave === c.chave ? (ordem.asc ? 'ascending' : 'descending') : 'none'"
            >
              <button class="lista__ordenar" @click="ordenar(c.chave)">{{ c.rotulo }} <span aria-hidden="true">{{ seta(c.chave) }}</span></button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in linhas" :key="o.id" class="clicavel" tabindex="0" @click="abrir(o)" @keydown.enter="abrir(o)">
            <td class="lista__obra">
              <strong>{{ o.nome }}</strong>
              <span class="mudo pequeno">{{ o.bairro }}<template v-if="o.empresa"> · {{ o.empresa }}</template></span>
              <span class="lista__selo-movel"><SeloSituacao :situacao="o.situacao" /></span>
              <span class="lista__etiquetas">
                <span v-if="o.prorrogada" class="etiqueta etiqueta--info">Prorrogada</span>
                <span v-if="o.pendencias_documentais > 0" class="etiqueta etiqueta--pendencia">Documento pendente</span>
                <span v-if="o.demo" class="etiqueta etiqueta--demo">Fictícia</span>
              </span>
            </td>
            <td class="col-secundaria">{{ nomeTipo(o.tipo) }}</td>
            <td class="col-situacao"><SeloSituacao :situacao="o.situacao" /></td>
            <td class="direita num">{{ pct(o.situacao.executado) }}</td>
            <td class="direita num col-secundaria">{{ pct(o.situacao.prazoDecorrido) }}</td>
            <td class="num">
              {{ data(o.data_termino_prevista) }}
            </td>
            <td>
              <span v-if="o.situacao.alertaSemAtualizacao" class="etiqueta etiqueta--alerta">⚠ {{ haDias(o.situacao.diasSemAtualizacao) }}</span>
              <span v-else-if="o.ultima_atualizacao_em" class="num">{{ data(diaEmImperatriz(o.ultima_atualizacao_em)) }}</span>
              <span v-else class="mudo">nunca</span>
            </td>
            <td class="direita num">{{ reais(o.valor_contrato) || '—' }}</td>
            <td class="col-secundaria">
              <span v-if="o.tem_planilha" class="pequeno">✓ importada</span>
              <span v-else class="mudo pequeno">—</span>
            </td>
          </tr>
          <tr v-if="!linhas.length">
            <td :colspan="COLUNAS.length" class="mudo">Nenhuma obra com estes filtros.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <section v-if="pode('obra.arquivar')" class="lista__arquivadas nao-imprimir">
      <label class="lista__check">
        <input v-model="verArquivadas" type="checkbox" />
        Mostrar obras arquivadas
      </label>
      <template v-if="verArquivadas">
        <p v-if="carregandoArquivadas" class="mudo pequeno">Carregando…</p>
        <p v-else-if="!arquivadas.length" class="mudo pequeno">Nenhuma obra arquivada.</p>
        <div v-else class="tabela-rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th>Obra arquivada</th>
                <th class="col-secundaria">Tipo</th>
                <th>Arquivada em</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in arquivadas" :key="o.id" class="clicavel" tabindex="0" @click="abrir(o)" @keydown.enter="abrir(o)">
                <td class="lista__obra">
                  <strong>{{ o.nome }}</strong>
                  <span class="mudo pequeno">{{ o.bairro }}</span>
                </td>
                <td class="col-secundaria">{{ nomeTipo(o.tipo) }}</td>
                <td class="num">{{ dataHora(o.arquivada_em) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="mudo pequeno">Abra a obra para ver o histórico ou desarquivar.</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.lista__sub {
  margin: 2px 0 0;
}
.lista__topo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}
.lista__ordenar {
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
}
.lista__obra {
  min-width: 260px;
}
.lista__obra strong,
.lista__obra span {
  display: block;
}
.lista__etiquetas {
  display: flex !important;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}
.lista__etiquetas:empty {
  display: none !important;
}
.lista__selo-movel {
  display: none !important;
}
.lista__arquivadas {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lista__check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.92rem;
  cursor: pointer;
  min-height: 40px;
}
.lista__check input {
  width: 18px;
  height: 18px;
}
/* Celular: situação embaixo do nome; tipo e prazo saem (estão na ficha). */
@media (max-width: 640px) {
  .lista__obra {
    min-width: 0;
  }
  .lista__selo-movel {
    display: block !important;
    margin-top: 4px;
  }
  .col-secundaria,
  .col-situacao {
    display: none;
  }
}
</style>
