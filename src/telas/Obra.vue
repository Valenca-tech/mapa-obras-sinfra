<script setup>
// Página da obra. Cabeçalho com os números que importam e as ações sempre à
// vista; abas Visão geral, Serviços e etapas, Documentos e Histórico. A aba
// fica no endereço (?aba=servicos), para o "voltar" e o link abrirem no lugar.
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ChevronRight, Ellipsis, MapPin, Pencil, CalendarClock, Pause, Play, Archive, ArchiveRestore, FilePlus2,
  TriangleAlert, FileWarning,
} from 'lucide-vue-next';
import { estado, pode, abrirAcao, nomeTipo, nomeTipoInstalacao, instalacaoPorId } from '../estado.js';
import { modoDemo } from '../api/index.js';
import { usarObra } from '../lib/usarObra.js';
import { textoSemAtualizacao } from '../lib/situacao.js';
import { segmentosDoTrecho, comprimentoTrecho, formatarExtensao } from '../lib/geo.js';
import { data, dataHora, reais, pct, haDias, pontos } from '../lib/formato.js';
import SeloSituacao from '../componentes/SeloSituacao.vue';
import MenuSuspenso from '../componentes/MenuSuspenso.vue';
import HistoricoObra from '../componentes/HistoricoObra.vue';
import PlanilhaObra from '../componentes/PlanilhaObra.vue';
import DocumentosObra from '../componentes/DocumentosObra.vue';
import GerarDocumento from '../componentes/GerarDocumento.vue';

const props = defineProps({ id: { type: String, required: true } });
const rota = useRoute();
const roteador = useRouter();

const { obra, carregando, naoEncontrada } = usarObra(() => props.id);
const emitindo = ref(false);

const ABAS = [
  { codigo: 'geral', rotulo: 'Visão geral' },
  { codigo: 'servicos', rotulo: 'Serviços e etapas' },
  { codigo: 'documentos', rotulo: 'Documentos' },
  { codigo: 'historico', rotulo: 'Histórico' },
];
const aba = computed(() => (ABAS.some((a) => a.codigo === rota.query.aba) ? rota.query.aba : 'geral'));
const irPara = (codigo) => roteador.replace({ query: { ...rota.query, aba: codigo === 'geral' ? undefined : codigo } });

// Setas do teclado entre as abas (padrão WAI-ARIA de abas).
function teclaNaAba(e, i) {
  const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!passo) return;
  e.preventDefault();
  const proxima = ABAS[(i + passo + ABAS.length) % ABAS.length];
  irPara(proxima.codigo);
  document.getElementById(`aba-${proxima.codigo}`)?.focus();
}

const ativa = computed(() => obra.value && !obra.value.arquivada);
const podeParalisar = computed(() => ativa.value && pode('obra.paralisar'));
const trecho = computed(() => {
  const t = obra.value?.trecho;
  if (!t) return '';
  const n = segmentosDoTrecho(t).length;
  return `${formatarExtensao(comprimentoTrecho(t))} em ${n} ${n === 1 ? 'segmento' : 'segmentos'}`;
});
// Execução em relação ao prazo, em pontos (só em obra andando).
const desvio = computed(() => {
  const s = obra.value?.situacao;
  if (!s || s.codigo === 'concluida' || s.codigo === 'nao_iniciada' || !s.desvio) return '';
  return s.desvio > 0 ? `execução ${pontos(s.desvio)} pontos abaixo` : `execução ${pontos(-s.desvio)} pontos à frente`;
});
const instalacao = computed(() => instalacaoPorId(obra.value?.instalacao_id));
const fiscal = computed(() =>
  obra.value ? [obra.value.fiscal_responsavel, obra.value.fiscal_titulo, obra.value.fiscal_registro].filter(Boolean).join(', ') : '',
);
</script>

<template>
  <div class="obra">
    <nav class="migalhas" aria-label="Você está em">
      <RouterLink to="/obras">Obras</RouterLink>
      <ChevronRight class="icone" aria-hidden="true" />
      <span aria-current="page">{{ obra?.nome ?? '…' }}</span>
    </nav>

    <div v-if="naoEncontrada" class="vazio">
      <strong>Obra não encontrada</strong>
      <p>Esta obra não existe ou não está disponível para o seu usuário.</p>
      <RouterLink to="/obras" class="btn">Voltar para Obras</RouterLink>
    </div>
    <p v-else-if="!obra && carregando" class="mudo">Carregando…</p>

    <template v-if="obra">
      <header class="obra__cabecalho">
        <div class="obra__titulo">
          <h1>{{ obra.nome }}</h1>
          <p class="obra__meta">
            <SeloSituacao :situacao="obra.situacao" />
            <span>{{ nomeTipo(obra.tipo) }}</span>
            <span v-if="obra.bairro">{{ obra.bairro }}</span>
            <span v-if="obra.numero_contrato">Contrato {{ obra.numero_contrato }}</span>
            <span v-if="obra.prorrogada" class="etiqueta etiqueta--info">Prorrogada</span>
            <span v-if="obra.arquivada" class="etiqueta etiqueta--alerta">Arquivada</span>
            <span v-if="obra.demo && !modoDemo" class="etiqueta etiqueta--demo">Fictícia</span>
          </p>
        </div>
        <div class="acoes obra__acoes">
          <button v-if="ativa && pode('percentual.lancar')" type="button" class="btn btn--primario" @click="abrirAcao('lancar', obra)">
            Lançar percentual
          </button>
          <button v-if="pode('documento.gerar')" type="button" class="btn" @click="emitindo = true">
            <FilePlus2 class="icone" aria-hidden="true" />Emitir documento
          </button>
          <MenuSuspenso rotulo="Mais ações">
            <template #botao><Ellipsis class="icone" aria-hidden="true" /><span>Mais</span></template>
            <RouterLink :to="{ path: '/obras', query: { ver: 'mapa', obra: obra.id } }" class="suspenso__item" role="menuitem">
              <MapPin class="icone" aria-hidden="true" />Ver no mapa
            </RouterLink>
            <RouterLink v-if="ativa && pode('obra.editar')" :to="`/obras/${obra.id}/editar`" class="suspenso__item" role="menuitem">
              <Pencil class="icone" aria-hidden="true" />Editar dados da obra
            </RouterLink>
            <button v-if="ativa && pode('obra.aditivo')" type="button" class="suspenso__item" role="menuitem" @click="abrirAcao('aditivo', obra)">
              <CalendarClock class="icone" aria-hidden="true" />Aditivo de prazo
            </button>
            <template v-if="podeParalisar">
              <button v-if="obra.paralisada" type="button" class="suspenso__item" role="menuitem" @click="abrirAcao('retomar', obra)">
                <Play class="icone" aria-hidden="true" />Retomar obra
              </button>
              <button
                v-else-if="estado.hoje >= obra.data_inicio"
                type="button"
                class="suspenso__item"
                role="menuitem"
                @click="abrirAcao('paralisar', obra)"
              >
                <Pause class="icone" aria-hidden="true" />Paralisar obra
              </button>
            </template>
            <template v-if="pode('obra.arquivar')">
              <div class="suspenso__sep" role="separator"></div>
              <button v-if="obra.arquivada" type="button" class="suspenso__item" role="menuitem" @click="abrirAcao('desarquivar', obra)">
                <ArchiveRestore class="icone" aria-hidden="true" />Desarquivar
              </button>
              <button v-else type="button" class="suspenso__item suspenso__item--perigo" role="menuitem" @click="abrirAcao('arquivar', obra)">
                <Archive class="icone" aria-hidden="true" />Arquivar obra
              </button>
            </template>
          </MenuSuspenso>
        </div>
      </header>

      <dl class="obra__numeros">
        <div>
          <dt>Executado</dt>
          <dd>
            <span class="obra__numero num">{{ pct(obra.situacao.executado) }}</span>
            <span class="barra"><span :style="{ width: `${obra.situacao.executado}%`, '--cor': obra.situacao.hex }"></span></span>
          </dd>
        </div>
        <div>
          <dt>Prazo decorrido</dt>
          <dd>
            <span class="obra__numero num">{{ pct(obra.situacao.prazoDecorrido) }}</span>
            <span class="barra"><span :style="{ width: `${obra.situacao.prazoDecorrido}%`, '--cor': '#8a929e' }"></span></span>
            <small v-if="desvio" class="mudo">{{ desvio }}</small>
          </dd>
        </div>
        <div>
          <dt>Valor do contrato</dt>
          <dd class="obra__numero num">{{ reais(obra.valor_contrato) || '–' }}</dd>
        </div>
        <div>
          <dt>Término previsto</dt>
          <dd>
            <span class="obra__numero num">{{ data(obra.data_termino_prevista) }}</span>
            <small v-if="obra.data_termino_original !== obra.data_termino_prevista" class="mudo">
              original {{ data(obra.data_termino_original) }}
            </small>
          </dd>
        </div>
        <div>
          <dt>Último lançamento</dt>
          <dd>
            <span class="obra__numero">{{ obra.ultima_atualizacao_em ? haDias(obra.situacao.diasDesdeLancamento) : 'nunca' }}</span>
            <small v-if="obra.ultima_atualizacao_em" class="mudo">{{ dataHora(obra.ultima_atualizacao_em) }}</small>
          </dd>
        </div>
      </dl>

      <div class="obra__abas" role="tablist" aria-label="Seções da obra">
        <button
          v-for="(a, i) in ABAS"
          :id="`aba-${a.codigo}`"
          :key="a.codigo"
          type="button"
          role="tab"
          class="obra__aba"
          :aria-selected="aba === a.codigo"
          :aria-controls="`painel-${a.codigo}`"
          :tabindex="aba === a.codigo ? 0 : -1"
          @click="irPara(a.codigo)"
          @keydown="teclaNaAba($event, i)"
        >
          {{ a.rotulo }}
          <span v-if="a.codigo === 'servicos' && !obra.tem_planilha" class="obra__aba-nota">sem planilha</span>
          <span v-if="a.codigo === 'historico' && obra.pendencias_documentais > 0" class="contador contador--alerta">{{ obra.pendencias_documentais }}</span>
        </button>
      </div>

      <section :id="`painel-${aba}`" role="tabpanel" :aria-labelledby="`aba-${aba}`" class="obra__painel">
        <!-- Visão geral -->
        <template v-if="aba === 'geral'">
          <div v-if="obra.situacao.alertaSemAtualizacao || obra.paralisada || obra.situacao.motivoAtraso === 'prazo_vencido' || obra.pendencias_documentais > 0" class="obra__alertas">
            <p v-if="obra.paralisada" class="caixa-alerta">
              <Pause class="icone" aria-hidden="true" />
              <span><strong>Paralisada desde {{ data(obra.paralisada_desde) }}.</strong> {{ obra.motivo_paralisacao }}</span>
            </p>
            <p v-if="obra.situacao.motivoAtraso === 'prazo_vencido'" class="caixa-erro">
              <TriangleAlert class="icone" aria-hidden="true" />
              <span>Prazo vencido há {{ -obra.situacao.diasParaTermino }} dias.</span>
            </p>
            <p v-if="obra.situacao.alertaSemAtualizacao" class="caixa-alerta">
              <TriangleAlert class="icone" aria-hidden="true" />
              <span>{{ textoSemAtualizacao(obra.situacao) }}.</span>
            </p>
            <p v-if="obra.pendencias_documentais > 0" class="caixa-alerta">
              <FileWarning class="icone" aria-hidden="true" />
              <span>
                {{ obra.pendencias_documentais }} ato(s) sem número ou protocolo do documento.
                <button type="button" class="btn btn--link" @click="irPara('historico')">Ver no histórico</button>
              </span>
            </p>
          </div>

          <div class="obra__colunas">
            <section class="painel">
              <h2 class="painel__titulo">Contrato e execução</h2>
              <dl class="dados">
                <div class="largo"><dt>Empresa contratada</dt><dd>{{ obra.empresa || '–' }}<span v-if="obra.empresa_cnpj" class="mudo"> · CNPJ {{ obra.empresa_cnpj }}</span></dd></div>
                <div><dt>Contrato</dt><dd>{{ obra.numero_contrato || '–' }}</dd></div>
                <div><dt>Processo administrativo</dt><dd>{{ obra.numero_processo || '–' }}</dd></div>
                <div><dt>Início</dt><dd class="num">{{ data(obra.data_inicio) }}</dd></div>
                <div><dt>Término previsto</dt><dd class="num">{{ data(obra.data_termino_prevista) }}</dd></div>
                <div class="largo"><dt>Fiscal</dt><dd>{{ fiscal || '–' }}</dd></div>
                <div v-if="trecho"><dt>Trecho de via</dt><dd>{{ trecho }}</dd></div>
                <div v-if="obra.instalacao_id" class="largo">
                  <dt>Instalação atendida</dt>
                  <dd>
                    <RouterLink v-if="instalacao" :to="{ path: '/obras', query: { ver: 'mapa', instalacao: obra.instalacao_id } }">
                      {{ instalacao.nome }}
                    </RouterLink>
                    <template v-else>Instalação desativada</template>
                    <span v-if="instalacao" class="mudo"> · {{ nomeTipoInstalacao(instalacao.tipo) }}</span>
                  </dd>
                </div>
              </dl>
            </section>

            <section class="painel">
              <h2 class="painel__titulo">Últimos registros</h2>
              <HistoricoObra :obra="obra" :limite="5" @ver-tudo="irPara('historico')" />
            </section>
          </div>
        </template>

        <PlanilhaObra v-else-if="aba === 'servicos'" :obra="obra" />
        <DocumentosObra v-else-if="aba === 'documentos'" :obra="obra" />
        <section v-else class="painel">
          <HistoricoObra :obra="obra" />
        </section>
      </section>

      <GerarDocumento v-if="emitindo" :obra="obra" @fechar="emitindo = false" @emitiu="emitindo = false" />
    </template>
  </div>
</template>

<style scoped>
.obra__cabecalho {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px 24px;
  margin-bottom: 16px;
}
.obra__titulo {
  min-width: 0;
  flex: 1 1 420px;
}
.obra__titulo h1 {
  margin: 0 0 6px;
}
.obra__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  margin: 0;
  color: var(--texto-2);
}
.obra__acoes {
  flex-shrink: 0;
}
.obra__numeros {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin: 0 0 20px;
  background: var(--superficie);
  border: 1px solid var(--borda);
  border-radius: var(--raio);
}
.obra__numeros > div {
  padding: 12px 16px;
  min-width: 0;
}
.obra__numeros > div + div {
  border-left: 1px solid var(--borda);
}
.obra__numeros dt {
  font-size: 0.84rem;
  color: var(--texto-3);
  margin-bottom: 4px;
}
.obra__numeros dd {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.obra__numero {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--texto);
}
.obra__numeros .barra {
  display: block;
}
.obra__numeros .barra > span {
  display: block;
  height: 100%;
  background: var(--cor);
}
.obra__abas {
  display: flex;
  gap: 4px;
  box-shadow: inset 0 -1px 0 var(--borda);
  overflow-x: auto;
  overflow-y: hidden;
  margin-bottom: 20px;
}
.obra__aba {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-size: 0.95rem;
  color: var(--texto-2);
  background: none;
  border: none;
  padding: 9px 12px 10px;
  cursor: pointer;
  white-space: nowrap;
}
.obra__aba:hover {
  color: var(--texto);
}
.obra__aba[aria-selected='true'] {
  color: var(--azul);
  font-weight: 500;
  box-shadow: inset 0 -2px 0 var(--azul);
}
.obra__aba-nota {
  font-size: 0.82rem;
  color: var(--texto-3);
  font-weight: 400;
}
.obra__alertas {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.obra__alertas .btn--link {
  padding: 0 4px;
}
.obra__colunas {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 16px;
  align-items: start;
}
@media (pointer: coarse) {
  .obra__aba {
    min-height: 44px;
  }
}
@media (max-width: 1100px) {
  .obra__numeros {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .obra__numeros > div:nth-child(4) {
    border-left: none;
  }
  .obra__numeros > div:nth-child(n + 4) {
    border-top: 1px solid var(--borda);
  }
  .obra__colunas {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .obra__acoes {
    flex-shrink: 1;
    width: 100%;
  }
  .obra__numeros {
    grid-template-columns: 1fr 1fr;
  }
  .obra__numeros > div {
    padding: 10px 12px;
  }
  .obra__numeros > div:nth-child(n) {
    border-left: none;
    border-top: 1px solid var(--borda);
  }
  .obra__numeros > div:nth-child(-n + 2) {
    border-top: none;
  }
  .obra__numeros > div:nth-child(even) {
    border-left: 1px solid var(--borda);
  }
  .obra__numeros > div:last-child {
    grid-column: 1 / -1;
    border-left: none;
  }
}
</style>
