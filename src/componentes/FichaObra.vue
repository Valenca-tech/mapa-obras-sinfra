<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/index.js';
import {
  estado, pode, obrasComSituacao, abrirAcao, nomeTipo, nomeTipoDocumento, nomeTipoInstalacao, instalacaoPorId, avisar,
} from '../estado.js';
import { fecharFicha } from '../rotas.js';
import { segmentosDoTrecho, comprimentoTrecho, formatarExtensao } from '../lib/geo.js';
import { calcularSituacao, textoSemAtualizacao } from '../lib/situacao.js';
import { rotuloEvento, exigeDocumento } from '../lib/eventos.js';
import { data, dataHora, reais, pct, haDias } from '../lib/formato.js';
import SeloSituacao from './SeloSituacao.vue';
import BarrasAvanco from './BarrasAvanco.vue';

const props = defineProps({ id: { type: String, required: true } });
const roteador = useRouter();

const obraForaDaLista = ref(null);
const hist = ref({ atualizacoes: [], eventos: [] });
const carregando = ref(true);
const naoEncontrada = ref(false);
const botaoFechar = ref(null);

const obra = computed(() => {
  const daLista = obrasComSituacao.value.find((o) => o.id === props.id);
  if (daLista) return daLista;
  const o = obraForaDaLista.value;
  return o
    ? { ...o, situacao: calcularSituacao(o, { hoje: estado.hoje, tolerancia: estado.config.tolerancia_atraso_pontos, diasAlerta: estado.config.dias_sem_atualizacao_alerta }) }
    : null;
});

async function carregar() {
  carregando.value = true;
  try {
    if (!obrasComSituacao.value.some((o) => o.id === props.id)) {
      obraForaDaLista.value = await api.obter(props.id);
      naoEncontrada.value = !obraForaDaLista.value; // link antigo ou de outro ambiente
    }
    if (!naoEncontrada.value) hist.value = await api.historico(props.id);
  } catch (e) {
    avisar(e.message, 'erro');
  } finally {
    carregando.value = false;
  }
}
onMounted(carregar);
watch(() => estado.versao, carregar);

const fechar = () => fecharFicha();

// Foco: vai para o × ao abrir e volta para onde estava ao fechar (teclado e
// leitor de tela percebem que a ficha abriu). No celular a ficha cobre a tela
// e funciona como diálogo modal.
let focoAnterior = null;
const movel = ref(false);
let consulta = null;
const aoMudarTela = () => (movel.value = !!consulta?.matches);
const aoTeclar = (e) => e.key === 'Escape' && !estado.acao && fechar();
onMounted(async () => {
  focoAnterior = document.activeElement;
  document.addEventListener('keydown', aoTeclar);
  consulta = window.matchMedia?.('(max-width: 640px)') ?? null;
  aoMudarTela();
  consulta?.addEventListener?.('change', aoMudarTela);
  await nextTick();
  botaoFechar.value?.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', aoTeclar);
  consulta?.removeEventListener?.('change', aoMudarTela);
  if (focoAnterior?.isConnected && !estado.acao) focoAnterior.focus?.();
});

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
  const t = obra.value?.trecho;
  if (!t) return '';
  const n = segmentosDoTrecho(t).length;
  return `${formatarExtensao(comprimentoTrecho(t))} em ${n} ${n === 1 ? 'segmento' : 'segmentos'}`;
});
const instalacao = computed(() => instalacaoPorId(obra.value?.instalacao_id));

// Trocar de tela fecha a ficha (ela vive no ?obra= da tela atual); o "voltar"
// do navegador reabre a ficha de onde saiu.
const verInstalacao = () => roteador.push({ path: '/mapa', query: { instalacao: obra.value?.instalacao_id } });
const editar = () => roteador.push(`/obras/${props.id}/editar`);
</script>

<template>
  <div class="ficha-fundo" @click.self="fechar">
    <aside class="ficha" role="dialog" :aria-modal="movel ? 'true' : 'false'" :aria-label="obra ? `Ficha da obra ${obra.nome}` : 'Ficha da obra'">
      <header class="ficha__topo">
        <div class="ficha__titulo">
          <p class="ficha__tipo">{{ obra ? `${nomeTipo(obra.tipo)} · ${obra.bairro ?? 'sem bairro'}` : '' }}</p>
          <h2>{{ obra?.nome ?? (naoEncontrada ? 'Obra não encontrada' : 'Carregando…') }}</h2>
        </div>
        <button ref="botaoFechar" class="ficha__fechar" type="button" aria-label="Fechar ficha" @click="fechar">×</button>
      </header>

      <p v-if="naoEncontrada" class="ficha__corpo mudo">
        Esta obra não existe ou não está disponível para o seu usuário. Confira o endereço ou procure pela Lista.
      </p>

      <div v-if="obra" class="ficha__corpo">
        <div class="ficha__selos">
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

        <p v-if="obra.situacao.alertaSemAtualizacao" class="ficha__alerta">⚠ {{ textoSemAtualizacao(obra.situacao) }}.</p>
        <p v-if="obra.paralisada" class="ficha__paralisada">
          <strong>Paralisada desde {{ data(obra.paralisada_desde) }}.</strong> {{ obra.motivo_paralisacao }}
        </p>

        <BarrasAvanco :situacao="obra.situacao" />

        <div v-if="!obra.arquivada" class="ficha__acoes">
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
        <div v-else-if="pode('obra.arquivar')" class="ficha__acoes">
          <button class="btn" @click="abrirAcao('desarquivar', obra)">Desarquivar</button>
        </div>

        <dl class="ficha__dados">
          <div><dt>Empresa contratada</dt><dd>{{ obra.empresa || '—' }}</dd></div>
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
          <div><dt>Fiscal responsável</dt><dd>{{ obra.fiscal_responsavel || '—' }}</dd></div>
          <div v-if="trechoInfo"><dt>Trecho de via</dt><dd>{{ trechoInfo }}</dd></div>
          <div v-if="obra.instalacao_id" class="ficha__largo">
            <dt>Instalação atendida</dt>
            <dd>
              <template v-if="instalacao">
                <button class="btn btn--link ficha__vinculo" @click="verInstalacao">{{ instalacao.nome }}</button>
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

        <section class="ficha__historico">
          <h3>Histórico</h3>
          <p v-if="carregando" class="mudo pequeno">Carregando…</p>
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
    </aside>
  </div>
</template>

<style scoped>
.ficha-fundo {
  position: fixed;
  inset: var(--altura-cabecalho) 0 0 auto;
  z-index: 1500;
  pointer-events: none;
}
.ficha {
  pointer-events: auto;
  position: fixed;
  top: var(--altura-cabecalho);
  right: 0;
  bottom: 0;
  width: min(460px, 100vw);
  background: var(--superficie);
  border-left: 1px solid var(--borda);
  box-shadow: var(--sombra-alta);
  display: flex;
  flex-direction: column;
}
.ficha__topo {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--borda);
  border-top: 4px solid v-bind('obra?.situacao.hex ?? "var(--azul)"');
}
.ficha__titulo {
  flex: 1;
  min-width: 0;
}
.ficha__titulo h2 {
  margin: 0;
  font-size: 1.12rem;
}
.ficha__tipo {
  margin: 0 0 2px;
  font-size: 0.8rem;
  color: var(--texto-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ficha__fechar {
  border: none;
  background: none;
  font-size: 1.7rem;
  line-height: 1;
  width: 38px;
  height: 38px;
  border-radius: var(--raio-p);
  cursor: pointer;
  color: var(--texto-2);
}
.ficha__fechar:hover {
  background: #f0f2f6;
}
@media (pointer: coarse) {
  .ficha__fechar {
    width: 44px;
    height: 44px;
  }
}
@media print {
  .ficha-fundo {
    display: none !important;
  }
}
.ficha__corpo {
  overflow-y: auto;
  padding: 14px 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ficha__selos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.ficha__alerta,
.ficha__paralisada {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--raio-p);
  font-size: 0.9rem;
}
.ficha__alerta {
  background: var(--alerta-fundo);
  color: var(--alerta);
  border: 1px solid #f0d89a;
}
.ficha__paralisada {
  background: #fff3e8;
  color: #8a3a00;
  border: 1px solid #f0c39c;
}
.ficha__acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ficha__dados {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
  margin: 0;
  padding: 12px;
  background: #f7f9fb;
  border-radius: var(--raio-p);
  border: 1px solid var(--borda);
}
.ficha__dados dt {
  font-size: 0.75rem;
  color: var(--texto-3);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.ficha__largo {
  grid-column: 1 / -1;
}
.ficha__vinculo {
  padding: 0;
  min-height: 0;
  text-align: left;
  white-space: normal;
}
.ficha__dados dd {
  margin: 1px 0 0;
  font-size: 0.92rem;
  overflow-wrap: anywhere;
}
.ficha__historico h3 {
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
  .ficha-fundo {
    inset: 0;
    pointer-events: auto;
    background: rgba(10, 20, 40, 0.4);
  }
  .ficha {
    top: auto;
    left: 0;
    width: 100%;
    height: 88dvh;
    border-left: none;
    border-radius: 14px 14px 0 0;
  }
  .ficha__dados {
    grid-template-columns: 1fr;
  }
}
</style>
