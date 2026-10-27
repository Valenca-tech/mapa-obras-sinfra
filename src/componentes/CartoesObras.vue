<script setup>
// Vista em cartões da tela Obras: um cartão por obra, com situação, avanço,
// prazo e valor; clicar abre a página da obra. Embaixo, as arquivadas.
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { TriangleAlert, FileWarning, CalendarDays, Clock } from 'lucide-vue-next';
import { api, modoDemo } from '../api/index.js';
import { estado, pode, obrasFiltradas, nomeTipo, avisar } from '../estado.js';
import { data, dataHora, pct, reais, haDias } from '../lib/formato.js';
import SeloSituacao from './SeloSituacao.vue';

const roteador = useRouter();

const ORDENS = {
  situacao: { rotulo: 'Situação (atrasadas primeiro)', valor: (o) => o.situacao.ordem * 1000 - o.situacao.desvio },
  termino: { rotulo: 'Término mais próximo', valor: (o) => o.data_termino_prevista },
  atualizacao: { rotulo: 'Mais tempo sem atualizar', valor: (o) => -(o.situacao.diasSemAtualizacao ?? 99999) },
  executado: { rotulo: 'Menos executado', valor: (o) => o.situacao.executado },
  valor: { rotulo: 'Maior valor', valor: (o) => -Number(o.valor_contrato ?? 0) },
  nome: { rotulo: 'Nome', valor: (o) => o.nome },
};
const ordem = ref('situacao');

const obras = computed(() => {
  const f = ORDENS[ordem.value].valor;
  return [...obrasFiltradas.value].sort((a, b) => {
    const x = f(a);
    const y = f(b);
    const r = typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x - y;
    return r || a.nome.localeCompare(b.nome, 'pt-BR');
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
  <div class="cartoes-obras">
    <div class="cartoes-obras__barra">
      <label class="cartoes-obras__ordem">
        <span>Ordenar por</span>
        <select v-model="ordem" class="controle">
          <option v-for="(o, chave) in ORDENS" :key="chave" :value="chave">{{ o.rotulo }}</option>
        </select>
      </label>
    </div>

    <ul v-if="obras.length" class="cartoes-obras__grade">
      <li v-for="o in obras" :key="o.id">
        <RouterLink :to="`/obras/${o.id}`" class="cartao-obra" :style="{ '--cor': o.situacao.hex }">
          <div class="cartao-obra__topo">
            <SeloSituacao :situacao="o.situacao" />
            <span v-if="o.prorrogada" class="etiqueta etiqueta--info">Prorrogada</span>
            <span v-if="o.pendencias_documentais > 0" class="etiqueta etiqueta--pendencia">
              <FileWarning class="icone" aria-hidden="true" />Documento pendente
            </span>
            <span v-if="o.demo && !modoDemo" class="etiqueta etiqueta--demo">Fictícia</span>
          </div>
          <h3 class="cartao-obra__nome">{{ o.nome }}</h3>
          <p class="cartao-obra__meta">
            {{ nomeTipo(o.tipo) }}<template v-if="o.bairro"> · {{ o.bairro }}</template>
            <template v-if="o.empresa"><br />{{ o.empresa }}</template>
          </p>

          <div class="cartao-obra__barras">
            <div>
              <span>Executado</span>
              <span class="barra"><span :style="{ width: `${o.situacao.executado}%` }" class="cartao-obra__exec"></span></span>
              <strong class="num">{{ pct(o.situacao.executado) }}</strong>
            </div>
            <div>
              <span>Prazo</span>
              <span class="barra"><span :style="{ width: `${o.situacao.prazoDecorrido}%` }" class="cartao-obra__prazo"></span></span>
              <strong class="num">{{ pct(o.situacao.prazoDecorrido) }}</strong>
            </div>
          </div>

          <dl class="cartao-obra__rodape">
            <div>
              <dt>Valor</dt>
              <dd class="num">{{ reais(o.valor_contrato) || '–' }}</dd>
            </div>
            <div>
              <dt><CalendarDays class="icone" aria-hidden="true" />Término</dt>
              <dd class="num">{{ data(o.data_termino_prevista) }}</dd>
            </div>
            <div>
              <dt><Clock class="icone" aria-hidden="true" />Lançamento</dt>
              <dd v-if="o.situacao.alertaSemAtualizacao" class="cartao-obra__alerta">
                <TriangleAlert class="icone" aria-hidden="true" />{{ haDias(o.situacao.diasSemAtualizacao) }}
              </dd>
              <dd v-else>{{ o.ultima_atualizacao_em ? haDias(o.situacao.diasDesdeLancamento) : 'nunca' }}</dd>
            </div>
          </dl>
        </RouterLink>
      </li>
    </ul>
    <div v-else class="vazio">
      <strong>Nenhuma obra com estes filtros</strong>
      Mude a busca, o tipo, o bairro ou a situação.
    </div>

    <section v-if="pode('obra.arquivar')" class="cartoes-obras__arquivadas nao-imprimir">
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
                <th>Tipo</th>
                <th>Arquivada em</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in arquivadas" :key="o.id" class="clicavel" tabindex="0" @click="abrir(o)" @keydown.enter="abrir(o)">
                <td>{{ o.nome }}<span v-if="o.bairro" class="mudo"> · {{ o.bairro }}</span></td>
                <td>{{ nomeTipo(o.tipo) }}</td>
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
.cartoes-obras {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cartoes-obras__barra {
  display: flex;
  justify-content: flex-end;
}
.cartoes-obras__ordem {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: var(--texto-2);
}
.cartoes-obras__ordem select {
  width: auto;
}
.cartoes-obras__grade {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
  gap: 14px;
}
.cartao-obra {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px 14px;
  background: var(--superficie);
  border: 1px solid var(--borda);
  border-top: 3px solid var(--cor);
  border-radius: var(--raio-g);
  color: var(--texto);
  text-decoration: none;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.cartao-obra:hover {
  border-color: var(--borda-forte);
  border-top-color: var(--cor);
  box-shadow: 0 4px 14px rgba(16, 24, 40, 0.08);
}
.cartao-obra:focus-visible {
  outline: 2px solid var(--azul);
  outline-offset: 2px;
}
.cartao-obra__topo {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: center;
}
.cartao-obra__nome {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 600;
  line-height: 1.3;
}
.cartao-obra:hover .cartao-obra__nome {
  color: var(--azul);
}
.cartao-obra__meta {
  margin: -4px 0 0;
  font-size: 0.88rem;
  color: var(--texto-3);
}
.cartao-obra__barras {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
}
.cartao-obra__barras > div {
  display: grid;
  grid-template-columns: 70px 1fr 48px;
  align-items: center;
  gap: 8px;
  font-size: 0.86rem;
  color: var(--texto-2);
}
.cartao-obra__barras strong {
  text-align: right;
  color: var(--texto);
  font-weight: 600;
}
.cartao-obra__barras .barra {
  display: block;
}
.cartao-obra__barras .barra > span {
  display: block;
  height: 100%;
}
.cartao-obra__exec {
  background: var(--cor);
}
.cartao-obra__prazo {
  background: #8a929e;
}
.cartao-obra__rodape {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr;
  gap: 8px;
  margin: 2px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--borda);
}
.cartao-obra__rodape dt {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
  color: var(--texto-3);
}
.cartao-obra__rodape dt .icone {
  width: 13px;
  height: 13px;
}
.cartao-obra__rodape dd {
  margin: 1px 0 0;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cartao-obra__alerta {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--alerta);
}
.cartao-obra__alerta .icone {
  width: 14px;
  height: 14px;
}
.cartoes-obras__arquivadas {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
@media (max-width: 640px) {
  .cartoes-obras__grade {
    grid-template-columns: 1fr;
  }
  .cartoes-obras__barra {
    justify-content: stretch;
  }
  .cartoes-obras__ordem {
    width: 100%;
  }
  .cartoes-obras__ordem select {
    flex: 1;
  }
}
</style>
