<script setup>
// Vista em lista da tela Obras: tabela ordenável; a linha abre a página da
// obra. Embaixo, as arquivadas (para consulta e desarquivar).
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowDown, ArrowUp, TriangleAlert, FileWarning } from 'lucide-vue-next';
import { api, modoDemo } from '../api/index.js';
import { estado, pode, obrasFiltradas, nomeTipo, avisar } from '../estado.js';
import { data, dataHora, pct, reais, haDias } from '../lib/formato.js';
import { diaEmImperatriz } from '../lib/situacao.js';
import SeloSituacao from './SeloSituacao.vue';

const roteador = useRouter();

const COLUNAS = [
  { chave: 'nome', rotulo: 'Obra', valor: (o) => o.nome },
  { chave: 'situacao', rotulo: 'Situação', valor: (o) => o.situacao.ordem * 1000 - o.situacao.desvio, classe: 'col-estreita' },
  { chave: 'executado', rotulo: 'Executado', valor: (o) => o.situacao.executado, direita: true, classe: 'col-estreita' },
  { chave: 'prazo', rotulo: 'Prazo', valor: (o) => o.situacao.prazoDecorrido, direita: true, classe: 'col-media' },
  { chave: 'termino', rotulo: 'Término', valor: (o) => o.data_termino_prevista, classe: 'col-media' },
  { chave: 'atualizacao', rotulo: 'Última atualização', valor: (o) => o.situacao.diasSemAtualizacao ?? 99999, classe: 'col-larga' },
  { chave: 'valor', rotulo: 'Valor', valor: (o) => Number(o.valor_contrato ?? -1), direita: true, classe: 'col-media' },
];

const ordem = ref({ chave: 'situacao', asc: true });
const ordenar = (chave) => (ordem.value = { chave, asc: ordem.value.chave === chave ? !ordem.value.asc : true });

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

const abrir = (o) => roteador.push(`/obras/${o.id}`);

// ---------------------------------------------------------------- arquivadas

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
watch(() => estado.versao, carregarArquivadas);
</script>

<template>
  <div class="tabela-obras">
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead>
          <tr>
            <th
              v-for="c in COLUNAS"
              :key="c.chave"
              :class="[c.direita && 'direita', c.classe]"
              :aria-sort="ordem.chave === c.chave ? (ordem.asc ? 'ascending' : 'descending') : 'none'"
            >
              <button type="button" class="tabela-obras__ordenar" @click="ordenar(c.chave)">
                {{ c.rotulo }}
                <component :is="ordem.asc ? ArrowUp : ArrowDown" v-if="ordem.chave === c.chave" class="icone" aria-hidden="true" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in linhas" :key="o.id" class="clicavel" tabindex="0" @click="abrir(o)" @keydown.enter="abrir(o)">
            <td class="tabela-obras__obra">
              <RouterLink :to="`/obras/${o.id}`" class="tabela-obras__nome" tabindex="-1" @click.stop>{{ o.nome }}</RouterLink>
              <span class="tabela-obras__movel">
                <SeloSituacao :situacao="o.situacao" /><span class="num">{{ pct(o.situacao.executado) }} executado</span>
              </span>
              <span class="tabela-obras__meta">
                {{ nomeTipo(o.tipo) }}<template v-if="o.bairro"> · {{ o.bairro }}</template><template v-if="o.empresa"> · {{ o.empresa }}</template>
              </span>
              <span v-if="o.prorrogada || o.pendencias_documentais > 0 || (o.demo && !modoDemo)" class="tabela-obras__etiquetas">
                <span v-if="o.prorrogada" class="etiqueta etiqueta--info">Prorrogada</span>
                <span v-if="o.pendencias_documentais > 0" class="etiqueta etiqueta--pendencia">
                  <FileWarning class="icone" aria-hidden="true" />Documento pendente
                </span>
                <span v-if="o.demo && !modoDemo" class="etiqueta etiqueta--demo">Fictícia</span>
              </span>
            </td>
            <td class="col-estreita"><SeloSituacao :situacao="o.situacao" /></td>
            <td class="direita num col-estreita">{{ pct(o.situacao.executado) }}</td>
            <td class="direita num col-media">{{ pct(o.situacao.prazoDecorrido) }}</td>
            <td class="num col-media">{{ data(o.data_termino_prevista) }}</td>
            <td class="col-larga">
              <span v-if="o.situacao.alertaSemAtualizacao" class="tabela-obras__alerta">
                <TriangleAlert class="icone" aria-hidden="true" />{{ haDias(o.situacao.diasSemAtualizacao) }}
              </span>
              <span v-else-if="o.ultima_atualizacao_em" class="num">{{ data(diaEmImperatriz(o.ultima_atualizacao_em)) }}</span>
              <span v-else class="mudo">nunca</span>
            </td>
            <td class="direita num col-media">{{ reais(o.valor_contrato) || '–' }}</td>
          </tr>
          <tr v-if="!linhas.length">
            <td :colspan="COLUNAS.length" class="mudo">Nenhuma obra com estes filtros.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <section v-if="pode('obra.arquivar')" class="tabela-obras__arquivadas nao-imprimir">
      <label class="marcar">
        <input v-model="verArquivadas" type="checkbox" />
        Mostrar obras arquivadas
      </label>
      <template v-if="verArquivadas">
        <p v-if="carregandoArquivadas" class="mudo">Carregando…</p>
        <p v-else-if="!arquivadas.length" class="mudo">Nenhuma obra arquivada.</p>
        <div v-else class="tabela-rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th>Obra arquivada</th>
                <th class="col-media">Tipo</th>
                <th>Arquivada em</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in arquivadas" :key="o.id" class="clicavel" tabindex="0" @click="abrir(o)" @keydown.enter="abrir(o)">
                <td class="tabela-obras__obra">
                  <span class="tabela-obras__nome">{{ o.nome }}</span>
                  <span class="tabela-obras__meta">{{ o.bairro }}</span>
                </td>
                <td class="col-media">{{ nomeTipo(o.tipo) }}</td>
                <td class="num">{{ dataHora(o.arquivada_em) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.tabela-obras {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.tabela-obras__ordenar {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
}
.tabela-obras__ordenar .icone {
  width: 13px;
  height: 13px;
}
.tabela-obras__obra {
  min-width: 280px;
}
.tabela-obras__nome {
  display: block;
  color: var(--texto);
  font-weight: 500;
  text-decoration: none;
}
tr:hover .tabela-obras__nome {
  color: var(--azul);
}
.tabela-obras__meta {
  display: block;
  font-size: 0.86rem;
  color: var(--texto-3);
}
.tabela-obras__movel {
  display: none;
}
.tabela-obras__etiquetas {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.tabela-obras__alerta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--alerta);
  white-space: nowrap;
}
.tabela-obras__alerta .icone {
  width: 14px;
  height: 14px;
}
.tabela-obras__arquivadas {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
@media (max-width: 1100px) {
  .col-larga {
    display: none;
  }
}
@media (max-width: 760px) {
  .col-media {
    display: none;
  }
  .tabela-obras__obra {
    min-width: 0;
  }
}
@media (max-width: 560px) {
  .col-estreita {
    display: none;
  }
  .tabela-obras__movel {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin: 3px 0 2px;
    font-size: 0.9rem;
  }
}
</style>
