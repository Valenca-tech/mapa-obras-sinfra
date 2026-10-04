<script setup>
// Resumo da obra: situação, avanço, ações, dados do contrato e histórico.
// Usado na ficha lateral do mapa e na aba "Resumo" da Central de Obras.
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/index.js';
import { estado, pode, abrirAcao, nomeTipoDocumento, nomeTipoInstalacao, instalacaoPorId, avisar } from '../estado.js';
import { segmentosDoTrecho, comprimentoTrecho, formatarExtensao } from '../lib/geo.js';
import { textoSemAtualizacao } from '../lib/situacao.js';
import { rotuloEvento, exigeDocumento } from '../lib/eventos.js';
import { data, dataHora, reais, pct, haDias } from '../lib/formato.js';
import SeloSituacao from './SeloSituacao.vue';
import BarrasAvanco from './BarrasAvanco.vue';

const props = defineProps({
  obra: { type: Object, required: true },
  largo: { type: Boolean, default: false }, // página da Central: dados em mais colunas
});
const roteador = useRouter();

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

const linhaDoTempo = computed(() => {
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

function descreverDocumento(d) {
  if (!d) return '';
  const partes = [nomeTipoDocumento(d.tipo)];
  if (d.numero) partes.push(`nº ${d.numero}`);
  if (d.numero_protocolo) partes.push(`protocolo ${d.numero_protocolo}${d.data_protocolo ? ` em ${data(d.data_protocolo)}` : ''}`);
  return partes.join(' · ');
}

const trechoInfo = computed(() => {
  const t = props.obra.trecho;
  if (!t) return '';
  const n = segmentosDoTrecho(t).length;
  return `${formatarExtensao(comprimentoTrecho(t))} em ${n} ${n === 1 ? 'segmento' : 'segmentos'}`;
});
const instalacao = computed(() => instalacaoPorId(props.obra.instalacao_id));
const fiscal = computed(() =>
  [props.obra.fiscal_responsavel, props.obra.fiscal_titulo, props.obra.fiscal_registro].filter(Boolean).join(' · '),
);

// Trocar de tela fecha a ficha (ela vive no ?obra= da tela atual); o "voltar"
// do navegador reabre a ficha de onde saiu.
const verInstalacao = () => roteador.push({ path: '/mapa', query: { instalacao: props.obra.instalacao_id } });
const editar = () => roteador.push(`/obras/${props.obra.id}/editar`);
</script>

<template>
  <div class="resumo" :class="largo && 'resumo--largo'">
    <div class="resumo__selos">
      <SeloSituacao :situacao="obra.situacao" />
      <span v-if="obra.situacao.motivoAtraso === 'prazo_vencido'" class="etiqueta etiqueta--pendencia">
        Prazo vencido há {{ -obra.situacao.diasParaTermino }} dias
      </span>
      <span v-if="obra.prorrogada" class="etiqueta etiqueta--info">Prorrogada</span>
      <span v-if="obra.pendencias_documentais > 0" class="etiqueta etiqueta--pendencia">
        {{ obra.pendencias_documentais }} documento(s) pendente(s)
      </span>
      <span v-if="obra.arquivada" class="etiqueta etiqueta--alerta">Arquivada</span>
      <span v-if="obra.demo" class="etiqueta etiqueta--demo">Fictícia</span>
    </div>

    <p v-if="obra.situacao.alertaSemAtualizacao" class="resumo__alerta">⚠ {{ textoSemAtualizacao(obra.situacao) }}.</p>
    <p v-if="obra.paralisada" class="resumo__paralisada">
      <strong>Paralisada desde {{ data(obra.paralisada_desde) }}.</strong> {{ obra.motivo_paralisacao }}
    </p>

    <BarrasAvanco :situacao="obra.situacao" />

    <div v-if="!obra.arquivada" class="resumo__acoes">
      <button v-if="pode('percentual.lancar')" class="btn btn--primario" @click="abrirAcao('lancar', obra)">
        Lançar percentual
      </button>
      <!-- paralisação vale para obra em execução (não iniciada não paralisa) -->
      <template v-if="pode('obra.paralisar')">
        <button v-if="obra.paralisada" class="btn" @click="abrirAcao('retomar', obra)">Retomar</button>
        <button v-else-if="estado.hoje >= obra.data_inicio" class="btn btn--alerta" @click="abrirAcao('paralisar', obra)">
          Paralisar
        </button>
      </template>
      <button v-if="pode('obra.editar')" class="btn" @click="editar">Editar</button>
      <button v-if="pode('obra.aditivo')" class="btn" @click="abrirAcao('aditivo', obra)">Aditivo de prazo</button>
      <button v-if="pode('obra.arquivar')" class="btn btn--perigo" @click="abrirAcao('arquivar', obra)">Arquivar</button>
    </div>
    <div v-else-if="pode('obra.arquivar')" class="resumo__acoes">
      <button class="btn" @click="abrirAcao('desarquivar', obra)">Desarquivar</button>
    </div>

    <dl class="resumo__dados">
      <div><dt>Empresa contratada</dt><dd>{{ obra.empresa || '—' }}<small v-if="obra.empresa_cnpj" class="mudo"><br />CNPJ {{ obra.empresa_cnpj }}</small></dd></div>
      <div><dt>Contrato</dt><dd>{{ obra.numero_contrato || '—' }}</dd></div>
      <div><dt>Processo administrativo</dt><dd>{{ obra.numero_processo || '—' }}</dd></div>
      <div><dt>Valor do contrato</dt><dd class="num">{{ reais(obra.valor_contrato) || '—' }}</dd></div>
      <div><dt>Início</dt><dd class="num">{{ data(obra.data_inicio) }}</dd></div>
      <div>
        <dt>Término previsto</dt>
        <dd class="num">
          {{ data(obra.data_termino_prevista) }}
          <small v-if="obra.data_termino_original !== obra.data_termino_prevista" class="mudo">
            <br />original: {{ data(obra.data_termino_original) }}
          </small>
        </dd>
      </div>
      <div><dt>Fiscal responsável</dt><dd>{{ fiscal || '—' }}</dd></div>
      <div v-if="trechoInfo"><dt>Trecho de via</dt><dd>{{ trechoInfo }}</dd></div>
      <div v-if="obra.instalacao_id" class="resumo__largo">
        <dt>Instalação atendida</dt>
        <dd>
          <template v-if="instalacao">
            <button class="btn btn--link resumo__vinculo" @click="verInstalacao">{{ instalacao.nome }}</button>
            <small class="mudo"> · {{ nomeTipoInstalacao(instalacao.tipo) }}</small>
          </template>
          <template v-else>Instalação desativada</template>
        </dd>
      </div>
      <div>
        <dt>Última atualização</dt>
        <dd>
          <template v-if="obra.ultima_atualizacao_em">
            {{ dataHora(obra.ultima_atualizacao_em) }}
            <small class="mudo">({{ haDias(obra.situacao.diasDesdeLancamento) }})</small>
          </template>
          <template v-else>Nunca atualizada</template>
        </dd>
      </div>
    </dl>

    <section class="resumo__historico">
      <h3>Histórico</h3>
      <p v-if="carregando && !linhaDoTempo.length" class="mudo pequeno">Carregando…</p>
      <ol v-else class="tempo">
        <li v-for="i in linhaDoTempo" :key="i.chave" :class="['tempo__item', `tempo__item--${i.tipo === 'evento' ? i.e.tipo : 'lancamento'}`]">
          <template v-if="i.tipo === 'lancamento'">
            <p class="tempo__titulo">
              Lançamento: <span class="num">{{ i.a.percentual_anterior !== null ? `${pct(i.a.percentual_anterior)} → ` : '' }}<strong>{{ pct(i.a.percentual_executado) }}</strong></span>
              <span v-if="i.a.percentual_anterior !== null && Number(i.a.percentual_executado) < Number(i.a.percentual_anterior)" class="etiqueta etiqueta--alerta">redução</span>
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
            <p v-if="i.e.documento" class="tempo__doc">📄 {{ descreverDocumento(i.e.documento) }}</p>
            <p v-if="i.pendente" class="tempo__pendente">
              <span class="etiqueta etiqueta--pendencia">Documento pendente</span>
              <button v-if="pode('documento.editar')" class="btn btn--link" @click="abrirAcao('documento', obra, i.e)">
                Completar documento
              </button>
            </p>
            <p class="tempo__meta">{{ i.e.autor_nome }} · {{ dataHora(i.e.criado_em) }}</p>
          </template>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.resumo {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.resumo__selos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.resumo__alerta,
.resumo__paralisada {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--raio-p);
  font-size: 0.9rem;
}
.resumo__alerta {
  background: var(--alerta-fundo);
  color: var(--alerta);
  border: 1px solid #f0d89a;
}
.resumo__paralisada {
  background: #fff3e8;
  color: #8a3a00;
  border: 1px solid #f0c39c;
}
.resumo__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.resumo__dados {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
  margin: 0;
  padding: 12px;
  background: #f7f9fb;
  border-radius: var(--raio-p);
  border: 1px solid var(--borda);
}
.resumo--largo .resumo__dados {
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
}
.resumo__dados dt {
  font-size: 0.75rem;
  color: var(--texto-3);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.resumo__largo {
  grid-column: 1 / -1;
}
.resumo__vinculo {
  padding: 0;
  min-height: 0;
  text-align: left;
  white-space: normal;
}
.resumo__dados dd {
  margin: 1px 0 0;
  font-size: 0.92rem;
  overflow-wrap: anywhere;
}
.resumo__historico h3 {
  margin-bottom: 8px;
}
.tempo {
  list-style: none;
  margin: 0;
  padding: 0 0 0 14px;
  border-left: 2px solid var(--borda);
}
.tempo__item {
  position: relative;
  padding: 0 0 14px 12px;
}
.tempo__item::before {
  content: '';
  position: absolute;
  left: -21px;
  top: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--marcador, var(--azul));
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px var(--borda);
}
.tempo__item--paralisacao { --marcador: var(--s-paralisada); }
.tempo__item--retomada { --marcador: var(--s-em-dia); }
.tempo__item--aditivo_prazo { --marcador: var(--s-concluida); }
.tempo__item--arquivamento { --marcador: var(--s-atrasada); }
.tempo__item--cadastro { --marcador: var(--dourado); }
.tempo__item--lancamento { --marcador: #8a94a6; }
.tempo p {
  margin: 0;
}
.tempo__titulo {
  font-weight: 600;
  font-size: 0.92rem;
}
.tempo__texto {
  font-size: 0.88rem;
  color: var(--texto);
  margin-top: 2px !important;
}
.tempo__doc {
  font-size: 0.82rem;
  color: var(--texto-2);
  margin-top: 3px !important;
}
.tempo__pendente {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px !important;
}
.tempo__meta {
  font-size: 0.78rem;
  color: var(--texto-3);
  margin-top: 3px !important;
}
@media (max-width: 640px) {
  .resumo__dados {
    grid-template-columns: 1fr;
  }
}
</style>
