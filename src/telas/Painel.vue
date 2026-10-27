<script setup>
// Painel: primeira tela da gestão. Números da carteira de obras, o mapa numa
// janela (minimiza e maximiza) e as listas do que pede atenção: atrasadas e
// paralisadas, términos próximos, obras sem atualização e documentos pendentes.
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Maximize2, Minimize2, ChevronDown, ChevronUp, ArrowRight, TriangleAlert, CalendarClock, FileWarning, Clock } from 'lucide-vue-next';
import { estado, pode, obrasComSituacao, recarregarObras, avisar, limparFiltros } from '../estado.js';
import { LISTA_SITUACOES, diasEntre } from '../lib/situacao.js';
import { reais, reaisCompacto, pct, data, haDias } from '../lib/formato.js';
import { dataPorExtenso } from '../lib/extenso.js';
import SeloSituacao from '../componentes/SeloSituacao.vue';
import MapaObras from '../componentes/MapaObras.vue';

const roteador = useRouter();
onMounted(() => recarregarObras().catch((e) => avisar(e.message, 'erro')));

const obras = computed(() => obrasComSituacao.value);
const DIA_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const hojeTexto = computed(() => {
  const [a, m, d] = estado.hoje.split('-').map(Number);
  return `${DIA_SEMANA[new Date(a, m - 1, d).getDay()]}, ${dataPorExtenso(estado.hoje)}`;
});

// ---------------------------------------------------------------- números

const contagem = computed(() => {
  const c = {};
  for (const s of LISTA_SITUACOES) c[s.codigo] = { qtd: 0, valor: 0 };
  for (const o of obras.value) {
    c[o.situacao.codigo].qtd++;
    c[o.situacao.codigo].valor += Number(o.valor_contrato || 0);
  }
  return c;
});
const valorTotal = computed(() => obras.value.reduce((s, o) => s + Number(o.valor_contrato || 0), 0));
// execução média ponderada pelo valor do contrato (obra sem valor pesa como a média)
const execucaoMedia = computed(() => {
  const lista = obras.value;
  if (!lista.length) return 0;
  const comValor = lista.filter((o) => Number(o.valor_contrato) > 0);
  if (!comValor.length) return lista.reduce((s, o) => s + o.situacao.executado, 0) / lista.length;
  const v = comValor.reduce((s, o) => s + Number(o.valor_contrato), 0);
  return comValor.reduce((s, o) => s + o.situacao.executado * Number(o.valor_contrato), 0) / v;
});
const pendencias = computed(() => obras.value.reduce((s, o) => s + Number(o.pendencias_documentais || 0), 0));

// Leva para Obras já filtrado.
function verObras(filtro) {
  limparFiltros();
  Object.assign(estado.filtros, filtro);
  roteador.push({ path: '/obras', query: { ver: 'lista' } });
}

// ---------------------------------------------------------------- listas de atenção

const atencao = computed(() =>
  obras.value
    .filter((o) => o.situacao.codigo === 'atrasada' || o.situacao.codigo === 'paralisada')
    .sort((a, b) => a.situacao.ordem - b.situacao.ordem || b.situacao.desvio - a.situacao.desvio),
);
const terminos = computed(() =>
  obras.value
    .filter((o) => o.situacao.codigo !== 'concluida')
    .map((o) => ({ o, dias: diasEntre(estado.hoje, o.data_termino_prevista) }))
    .filter((x) => x.dias >= 0 && x.dias <= 30)
    .sort((a, b) => a.dias - b.dias),
);
const semAtualizacao = computed(() =>
  obras.value.filter((o) => o.situacao.alertaSemAtualizacao).sort((a, b) => b.situacao.diasSemAtualizacao - a.situacao.diasSemAtualizacao),
);
const comPendencia = computed(() => obras.value.filter((o) => o.pendencias_documentais > 0));

function motivo(o) {
  const s = o.situacao;
  if (s.codigo === 'paralisada') return `paralisada desde ${data(o.paralisada_desde)}`;
  if (s.motivoAtraso === 'prazo_vencido') return `prazo vencido há ${-s.diasParaTermino} dias`;
  return `${pct(s.executado)} executado, ${pct(s.prazoDecorrido)} do prazo`;
}

// ---------------------------------------------------------------- janela do mapa

const CHAVE_MAPA = 'mapa-obras-painel-mapa';
function lerJanela() {
  try {
    return localStorage.getItem(CHAVE_MAPA) === 'min' ? 'min' : 'normal';
  } catch {
    return 'normal';
  }
}
const janela = ref(lerJanela()); // 'normal' | 'min' | 'max'
watch(janela, (v) => {
  if (v === 'max') return;
  try {
    localStorage.setItem(CHAVE_MAPA, v);
  } catch {
    /* sem storage */
  }
});
const alternarMax = () => (janela.value = janela.value === 'max' ? 'normal' : 'max');
const alternarMin = () => (janela.value = janela.value === 'min' ? 'normal' : 'min');
const sairDoMax = (e) => e.key === 'Escape' && janela.value === 'max' && !estado.obraAberta && (janela.value = 'normal');
onMounted(() => document.addEventListener('keydown', sairDoMax));
onBeforeUnmount(() => document.removeEventListener('keydown', sairDoMax));
</script>

<template>
  <div class="painel-inicial">
    <div class="pagina__cabecalho">
      <div>
        <h1>Painel</h1>
        <p class="pagina__subtitulo">{{ hojeTexto }}</p>
      </div>
      <RouterLink v-if="pode('obra.cadastrar')" to="/obras/nova" class="btn btn--primario">
        <Plus class="icone" aria-hidden="true" />Nova obra
      </RouterLink>
    </div>

    <!-- números da carteira -->
    <div class="indicadores" role="group" aria-label="Números da carteira">
      <button type="button" class="indicador" @click="verObras({})">
        <span class="indicador__rotulo">Obras ativas</span>
        <strong class="indicador__valor num">{{ obras.length }}</strong>
        <small>{{ reais(valorTotal) }} contratados</small>
      </button>
      <button type="button" class="indicador" @click="verObras({ situacao: 'atrasada' })">
        <span class="indicador__rotulo"><i class="situacao__cor" style="--cor: #b91c1c" aria-hidden="true"></i>Atrasadas</span>
        <strong class="indicador__valor num">{{ contagem.atrasada.qtd }}</strong>
        <small>{{ reaisCompacto(contagem.atrasada.valor) }}</small>
      </button>
      <button type="button" class="indicador" @click="verObras({ situacao: 'paralisada' })">
        <span class="indicador__rotulo"><i class="situacao__cor" style="--cor: #d97706" aria-hidden="true"></i>Paralisadas</span>
        <strong class="indicador__valor num">{{ contagem.paralisada.qtd }}</strong>
        <small>{{ reaisCompacto(contagem.paralisada.valor) }}</small>
      </button>
      <div class="indicador indicador--fixo">
        <span class="indicador__rotulo">Execução média</span>
        <strong class="indicador__valor num">{{ pct(execucaoMedia) }}</strong>
        <small>ponderada pelo valor</small>
      </div>
      <RouterLink to="/pendencias" class="indicador">
        <span class="indicador__rotulo">Documentos pendentes</span>
        <strong class="indicador__valor num">{{ pendencias }}</strong>
        <small>atos sem número ou protocolo</small>
      </RouterLink>
    </div>

    <div class="painel-inicial__grade">
      <div class="painel-inicial__principal">
        <!-- janela do mapa -->
        <section :class="['janela-mapa', `janela-mapa--${janela}`]" aria-label="Mapa das obras">
          <header class="janela-mapa__topo">
            <h2>Mapa das obras</h2>
            <div class="janela-mapa__botoes">
              <RouterLink :to="{ path: '/obras', query: { ver: 'mapa' } }" class="btn btn--fantasma">Abrir em Obras</RouterLink>
              <button
                v-if="janela !== 'max'"
                type="button"
                class="btn btn--fantasma btn--icone"
                :aria-label="janela === 'min' ? 'Mostrar o mapa' : 'Minimizar o mapa'"
                :title="janela === 'min' ? 'Mostrar o mapa' : 'Minimizar o mapa'"
                @click="alternarMin"
              >
                <component :is="janela === 'min' ? ChevronDown : ChevronUp" class="icone" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="btn btn--fantasma btn--icone"
                :aria-label="janela === 'max' ? 'Restaurar o tamanho do mapa' : 'Maximizar o mapa'"
                :title="janela === 'max' ? 'Restaurar (Esc)' : 'Maximizar'"
                @click="alternarMax"
              >
                <component :is="janela === 'max' ? Minimize2 : Maximize2" class="icone" aria-hidden="true" />
              </button>
            </div>
          </header>
          <MapaObras v-if="janela !== 'min'" :key="janela" :obras="obras" class="janela-mapa__mapa" />
        </section>

        <!-- situação -->
        <section class="painel">
          <h2 class="painel__titulo">Obras por situação</h2>
          <table class="tabela painel-inicial__situacao">
            <thead>
              <tr>
                <th>Situação</th>
                <th class="direita">Obras</th>
                <th class="direita">Valor contratado</th>
                <th class="painel-inicial__col-barra"><span class="oculto">Proporção</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in LISTA_SITUACOES" :key="s.codigo" class="clicavel" tabindex="0" @click="verObras({ situacao: s.codigo })" @keydown.enter="verObras({ situacao: s.codigo })">
                <td><SeloSituacao :situacao="s" /></td>
                <td class="direita num">{{ contagem[s.codigo].qtd }}</td>
                <td class="direita num">{{ reais(contagem[s.codigo].valor) }}</td>
                <td class="painel-inicial__col-barra">
                  <span class="barra"><span :style="{ width: `${obras.length ? (contagem[s.codigo].qtd / obras.length) * 100 : 0}%`, background: s.hex }"></span></span>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td class="direita num">{{ obras.length }}</td>
                <td class="direita num">{{ reais(valorTotal) }}</td>
                <td class="painel-inicial__col-barra"></td>
              </tr>
            </tfoot>
          </table>
        </section>
      </div>

      <aside class="painel-inicial__lateral">
        <section class="painel lista-atencao">
          <h2 class="painel__titulo"><span><TriangleAlert class="icone" aria-hidden="true" />Atrasadas e paralisadas</span><span class="contador">{{ atencao.length }}</span></h2>
          <ul v-if="atencao.length">
            <li v-for="o in atencao.slice(0, 6)" :key="o.id">
              <RouterLink :to="`/obras/${o.id}`">
                <strong>{{ o.nome }}</strong>
                <span><SeloSituacao :situacao="o.situacao" /> · {{ motivo(o) }}</span>
              </RouterLink>
            </li>
          </ul>
          <p v-else class="mudo">Nenhuma obra atrasada ou paralisada.</p>
          <button v-if="atencao.length > 6" type="button" class="btn btn--link" @click="verObras({ situacao: 'atrasada' })">Ver todas</button>
        </section>

        <section class="painel lista-atencao">
          <h2 class="painel__titulo"><span><CalendarClock class="icone" aria-hidden="true" />Término nos próximos 30 dias</span><span class="contador">{{ terminos.length }}</span></h2>
          <ul v-if="terminos.length">
            <li v-for="x in terminos.slice(0, 6)" :key="x.o.id">
              <RouterLink :to="`/obras/${x.o.id}`">
                <strong>{{ x.o.nome }}</strong>
                <span>{{ data(x.o.data_termino_prevista) }} · {{ x.dias === 0 ? 'hoje' : `em ${x.dias} dias` }} · {{ pct(x.o.situacao.executado) }} executado</span>
              </RouterLink>
            </li>
          </ul>
          <p v-else class="mudo">Nenhum término previsto nos próximos 30 dias.</p>
        </section>

        <section class="painel lista-atencao">
          <h2 class="painel__titulo">
            <span><Clock class="icone" aria-hidden="true" />Sem atualização há mais de {{ estado.config.dias_sem_atualizacao_alerta }} dias</span>
            <span class="contador">{{ semAtualizacao.length }}</span>
          </h2>
          <ul v-if="semAtualizacao.length">
            <li v-for="o in semAtualizacao.slice(0, 6)" :key="o.id">
              <RouterLink :to="`/obras/${o.id}`">
                <strong>{{ o.nome }}</strong>
                <span>último lançamento {{ haDias(o.situacao.diasSemAtualizacao) }}<template v-if="o.fiscal_responsavel"> · {{ o.fiscal_responsavel }}</template></span>
              </RouterLink>
            </li>
          </ul>
          <p v-else class="mudo">Todas as obras em andamento estão em dia com os lançamentos.</p>
        </section>

        <section v-if="comPendencia.length" class="painel lista-atencao">
          <h2 class="painel__titulo"><span><FileWarning class="icone" aria-hidden="true" />Documentos pendentes</span><span class="contador">{{ pendencias }}</span></h2>
          <ul>
            <li v-for="o in comPendencia.slice(0, 6)" :key="o.id">
              <RouterLink :to="{ path: `/obras/${o.id}`, query: { aba: 'historico' } }">
                <strong>{{ o.nome }}</strong>
                <span>{{ o.pendencias_documentais }} ato(s) sem documento completo</span>
              </RouterLink>
            </li>
          </ul>
          <RouterLink to="/pendencias" class="btn btn--link">Abrir Pendências <ArrowRight class="icone" aria-hidden="true" /></RouterLink>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.indicadores {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin: 0 0 16px;
  background: var(--superficie);
  border: 1px solid var(--borda);
  border-radius: var(--raio);
}
.indicador {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 14px 16px;
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  color: var(--texto);
  text-decoration: none;
  cursor: pointer;
  min-width: 0;
}
.indicador + .indicador {
  border-left: 1px solid var(--borda);
}
button.indicador:hover,
a.indicador:hover {
  background: var(--superficie-2);
}
.indicador--fixo {
  cursor: default;
}
.indicador__rotulo {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.86rem;
  color: var(--texto-3);
}
.indicador__valor {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 1.2;
}
.indicador small {
  font-size: 0.84rem;
  color: var(--texto-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.painel-inicial__grade {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 16px;
  align-items: start;
}
.painel-inicial__principal,
.painel-inicial__lateral {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* janela do mapa */
.janela-mapa {
  background: var(--superficie);
  border: 1px solid var(--borda);
  border-radius: var(--raio);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.janela-mapa__topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 6px 16px;
  border-bottom: 1px solid var(--borda);
}
.janela-mapa--min .janela-mapa__topo {
  border-bottom: none;
}
.janela-mapa__topo h2 {
  margin: 0;
  font-size: 0.95rem;
}
.janela-mapa__botoes {
  display: flex;
  align-items: center;
  gap: 2px;
}
.janela-mapa__mapa {
  height: 440px;
  flex: none;
}
.janela-mapa--max {
  position: fixed;
  z-index: 1450; /* acima do menu lateral */
  inset: 12px;
  box-shadow: var(--sombra-alta);
}
.janela-mapa--max .janela-mapa__mapa {
  height: auto;
  flex: 1;
}

.painel-inicial__situacao th,
.painel-inicial__situacao td {
  padding: 7px 8px;
}
.painel-inicial__situacao th:first-child,
.painel-inicial__situacao td:first-child {
  padding-left: 0;
}
.painel-inicial__col-barra {
  width: 30%;
}
.painel-inicial__col-barra .barra {
  display: block;
}
.painel-inicial__col-barra .barra > span {
  display: block;
  height: 100%;
}

/* listas de atenção */
.lista-atencao .painel__titulo span:first-child {
  display: flex;
  align-items: center;
  gap: 7px;
}
.lista-atencao .painel__titulo .icone {
  color: var(--texto-3);
}
.lista-atencao ul {
  list-style: none;
  margin: 0 -8px;
  padding: 0;
}
.lista-atencao li a {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 7px 8px;
  border-radius: var(--raio);
  color: var(--texto);
  text-decoration: none;
}
.lista-atencao li a:hover {
  background: var(--superficie-2);
}
.lista-atencao li a:hover strong {
  color: var(--azul);
}
.lista-atencao li strong {
  font-weight: 500;
  font-size: 0.93rem;
}
.lista-atencao li span {
  font-size: 0.85rem;
  color: var(--texto-3);
}
.lista-atencao li span :deep(.situacao) {
  font-size: 0.85rem;
}
.lista-atencao li + li {
  border-top: 1px solid var(--borda);
}
.lista-atencao p {
  margin: 0;
  font-size: 0.9rem;
}
.lista-atencao > .btn--link {
  margin-top: 6px;
  padding-left: 0;
}

@media (max-width: 1200px) {
  .painel-inicial__grade {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 900px) {
  .indicadores {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .indicador + .indicador {
    border-left: none;
  }
  .indicador {
    border-top: 1px solid var(--borda);
  }
  .indicador:nth-child(-n + 2) {
    border-top: none;
  }
  .indicador:nth-child(even) {
    border-left: 1px solid var(--borda);
  }
  .indicador:last-child {
    grid-column: 1 / -1;
    border-left: none;
  }
  .janela-mapa__mapa {
    height: 340px;
  }
}
@media (max-width: 960px) {
  .janela-mapa--max {
    inset: var(--altura-topo-movel) 0 0 0;
    border-radius: 0;
  }
}
</style>
