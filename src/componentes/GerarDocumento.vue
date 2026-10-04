<script setup>
// Emissão de documento da obra no papel timbrado: escolhe o tipo, preenche o
// que o documento pede, confere numa prévia (sem número) e emite. A emissão
// reserva o número de controle (Nº 001/2026-SINFRA) e guarda o retrato do
// conteúdo; o arquivo é gerado aqui no navegador.
import { ref, computed, watch } from 'vue';
import { api } from '../api/index.js';
import { estado, nomeTipo, instalacaoPorId, avisar, mensagemDeFalhaAoGravar } from '../estado.js';
import { TIPOS_DOCUMENTO, FILTROS_PLANILHA, retrato, montarDocumento, numeroBr } from '../lib/documentos/conteudo.js';
import { estruturar } from '../lib/planilha.js';
import { numeroOficial } from '../lib/extenso.js';
import { comprimentoTrecho, formatarExtensao } from '../lib/geo.js';
import { lerNumero, pct } from '../lib/formato.js';
import { novoId } from '../api/campos.js';
import Modal from './Modal.vue';

const props = defineProps({
  obra: { type: Object, required: true },
  tipoInicial: { type: String, default: 'declaracao_andamento' },
});
const emit = defineEmits(['fechar', 'emitiu']);

const tipo = ref(props.tipoInicial);
const formato = ref('pdf');
const protocolo = ref('');
const historico = ref(null);
const planilha = ref(null);
const carregando = ref(true);
const trabalhando = ref('');
const erro = ref('');
const emitido = ref(null); // { numero, ano } depois de emitir
let idEmissao = novoId(); // repetir depois de falha de rede não gasta outro número

const o = props.obra;
const concluida = Number(o.percentual_executado ?? 0) >= 100;
const campos = ref({
  // declaração
  solicitante: '',
  finalidade: '',
  observacao: '',
  // atestado
  empresa_cnpj: o.empresa_cnpj ?? '',
  parcial: !concluida,
  periodo_inicio: o.data_inicio,
  periodo_fim: estado.hoje,
  rt_nome: '',
  rt_titulo: 'Engenheiro(a) Civil',
  rt_registro: '',
  art_numero: '',
  avaliacao: '',
  // planilha
  filtro_tipo: 'todos',
});
const quantidades = ref({}); // atestado: id do item -> quantidade digitada

async function carregar() {
  carregando.value = true;
  try {
    const [h, p] = await Promise.all([api.historico(o.id), api.obterOrcamento(o.id)]);
    historico.value = h;
    planilha.value = p;
    preencherQuantidades(concluida ? 'contrato' : 'vazio');
  } catch (e) {
    erro.value = e.message;
  } finally {
    carregando.value = false;
  }
}
carregar();

// tipo trocado depois de emitir: nova emissão, novo número
watch(tipo, () => {
  emitido.value = null;
  idEmissao = novoId();
  if (tipo.value !== 'planilha_servicos' && formato.value === 'excel') formato.value = 'pdf';
});

const itensPlanilha = computed(() => estruturar(planilha.value?.itens ?? []).linhas);
function preencherQuantidades(modo) {
  const q = {};
  for (const x of itensPlanilha.value) {
    if (x.nivel !== 'item' || x.quantidade === null) continue;
    if (modo === 'contrato') q[x.id] = numeroBr(x.quantidade, 4);
    else if (modo === 'proporcional') q[x.id] = numeroBr((Number(x.quantidade) * Number(o.percentual_executado ?? 0)) / 100, 2);
    else q[x.id] = '';
  }
  quantidades.value = q;
}

const formatos = computed(() => (tipo.value === 'planilha_servicos' ? ['pdf', 'word', 'excel'] : ['pdf', 'word']));
const ROTULO = { pdf: 'PDF', word: 'Word (editável)', excel: 'Excel' };

// Conferências antes de emitir: o que falta no cadastro aparece aqui.
const pendencias = computed(() => {
  const p = [];
  if (!estado.config.secretario_nome) p.push('O nome do secretário não está preenchido (Configuração).');
  if (!o.fiscal_responsavel) p.push('A obra não tem fiscal cadastrado: só o secretário assina.');
  else if (!o.fiscal_registro) p.push('Falta o registro no CREA do fiscal (editar a obra).');
  if (!o.numero_contrato) p.push('A obra não tem número de contrato.');
  if (tipo.value === 'atestado_capacidade') {
    if (!o.empresa) p.push('A obra não tem empresa contratada: o atestado precisa dela.');
    if (!campos.value.empresa_cnpj.trim()) p.push('Informe o CNPJ da empresa.');
  }
  if ((tipo.value === 'planilha_servicos' || tipo.value === 'atestado_capacidade') && !planilha.value) {
    p.push('A obra não tem planilha de serviços importada (aba "Serviços e etapas").');
  }
  return p;
});
const bloqueio = computed(() => {
  if (tipo.value === 'atestado_capacidade' && !o.empresa) return 'O atestado precisa da empresa contratada.';
  if (tipo.value === 'planilha_servicos' && !planilha.value) return 'Importe a planilha antes de exportá-la.';
  if (tipo.value === 'atestado_capacidade' && !campos.value.parcial && !campos.value.periodo_fim) return 'Informe o fim do período.';
  if (quantidadeInvalida.value) return `Quantidade inválida no item ${quantidadeInvalida.value}.`;
  return '';
});
const quantidadeInvalida = computed(() => {
  if (tipo.value !== 'atestado_capacidade') return '';
  const x = itensPlanilha.value.find((i) => {
    const t = String(quantidades.value[i.id] ?? '').trim();
    if (!t) return false;
    const n = lerNumero(t);
    return Number.isNaN(n) || n < 0;
  });
  return x ? x.numero ?? x.descricao.slice(0, 20) : '';
});

function camposDoTipo() {
  const c = campos.value;
  switch (tipo.value) {
    case 'declaracao_andamento':
      return { solicitante: c.solicitante, finalidade: c.finalidade, observacao: c.observacao };
    case 'atestado_capacidade':
      return {
        empresa_cnpj: c.empresa_cnpj,
        parcial: c.parcial,
        periodo_inicio: c.periodo_inicio,
        periodo_fim: c.parcial ? null : c.periodo_fim,
        rt_nome: c.rt_nome,
        rt_titulo: c.rt_titulo,
        rt_registro: c.rt_registro,
        art_numero: c.art_numero,
        avaliacao: c.avaliacao,
        observacao: c.observacao,
        itens: itensPlanilha.value
          .filter((x) => x.nivel === 'item' && String(quantidades.value[x.id] ?? '').trim())
          .map((x) => ({
            numero: x.numero,
            descricao: x.descricao,
            unidade: x.unidade,
            quantidade: lerNumero(quantidades.value[x.id]),
          })),
      };
    case 'ficha_tecnica':
      return { observacao: c.observacao };
    default:
      return { filtro_tipo: c.filtro_tipo };
  }
}

function montarRetrato() {
  return retrato({
    tipo: tipo.value,
    obra: o,
    config: estado.config,
    historico: historico.value,
    planilha: planilha.value,
    campos: camposDoTipo(),
    tipoObra: nomeTipo(o.tipo),
    instalacao: instalacaoPorId(o.instalacao_id)?.nome ?? null,
    extensao: o.trecho ? formatarExtensao(comprimentoTrecho(o.trecho)) : null,
    hoje: estado.hoje,
  });
}

async function gerar(doc) {
  const { gerarEBaixar } = await import('../lib/documentos/arquivos.js');
  await gerarEBaixar(doc, formato.value);
}

async function previa() {
  erro.value = '';
  trabalhando.value = 'previa';
  try {
    await gerar(montarDocumento(montarRetrato(), { numero: null, ano: null }));
  } catch (e) {
    erro.value = `Não foi possível gerar a prévia: ${e.message}`;
  } finally {
    trabalhando.value = '';
  }
}

async function emitir() {
  if (bloqueio.value) return;
  erro.value = '';
  trabalhando.value = 'emitir';
  const r = montarRetrato();
  let registro;
  try {
    registro = await api.registrarDocumentoGerado({ id: idEmissao, obraId: o.id, tipo: tipo.value, conteudo: r, protocolo: protocolo.value });
  } catch (e) {
    erro.value = mensagemDeFalhaAoGravar(e);
    trabalhando.value = '';
    return;
  }
  emitido.value = registro;
  try {
    await gerar(montarDocumento(r, registro));
    avisar(`Emitido: ${TIPOS_DOCUMENTO[tipo.value].nome} nº ${numeroOficial(registro.numero, registro.ano, r.orgao.sigla)}.`);
    emit('emitiu');
  } catch (e) {
    erro.value = `O número ${numeroOficial(registro.numero, registro.ano, r.orgao.sigla)} foi registrado, mas o arquivo não foi gerado (${e.message}). Baixe pela lista de emitidos.`;
  } finally {
    trabalhando.value = '';
  }
}

const sujo = computed(() => !emitido.value && (protocolo.value || campos.value.solicitante || campos.value.rt_nome || campos.value.observacao));
</script>

<template>
  <Modal titulo="Emitir documento" largura="860px" :sujo="!!sujo" @fechar="emit('fechar')">
    <div class="gerar">
      <div class="grade">
        <label class="campo">
          <span>Documento</span>
          <select v-model="tipo" :disabled="!!trabalhando">
            <option v-for="(t, codigo) in TIPOS_DOCUMENTO" :key="codigo" :value="codigo">{{ t.nome }}</option>
          </select>
        </label>
        <fieldset class="gerar__formato">
          <legend>Formato</legend>
          <label v-for="f in formatos" :key="f">
            <input v-model="formato" type="radio" name="formato" :value="f" />
            {{ ROTULO[f] }}
          </label>
        </fieldset>
        <label class="campo">
          <span>Processo ou protocolo de destino</span>
          <input v-model="protocolo" type="text" maxlength="80" placeholder="Opcional" />
        </label>
      </div>
      <p class="mudo pequeno gerar__explica">{{ TIPOS_DOCUMENTO[tipo].descricao }}</p>

      <p v-if="carregando" class="mudo">Carregando dados da obra…</p>

      <ul v-if="pendencias.length" class="gerar__pendencias">
        <li v-for="p in pendencias" :key="p">{{ p }}</li>
      </ul>

      <!-- Declaração de andamento -->
      <template v-if="tipo === 'declaracao_andamento'">
        <p class="pequeno">
          Situação que vai na declaração: <strong>{{ obra.situacao.rotulo }}</strong>, {{ pct(obra.percentual_executado) }} executado.
        </p>
        <div class="grade">
          <label class="campo">
            <span>A pedido de</span>
            <input v-model="campos.solicitante" type="text" maxlength="200" placeholder="Opcional. Ex.: a empresa contratada" />
          </label>
          <label class="campo">
            <span>Para fins de</span>
            <input v-model="campos.finalidade" type="text" maxlength="200" placeholder="Opcional. Ex.: comprovação junto à Caixa" />
          </label>
        </div>
        <label class="campo">
          <span>Texto adicional</span>
          <textarea v-model="campos.observacao" maxlength="2000" rows="2" placeholder="Opcional"></textarea>
        </label>
      </template>

      <!-- Atestado de capacidade técnica -->
      <template v-else-if="tipo === 'atestado_capacidade'">
        <div class="grade">
          <label class="campo">
            <span>CNPJ da empresa</span>
            <input v-model="campos.empresa_cnpj" type="text" maxlength="30" placeholder="00.000.000/0000-00" />
          </label>
          <label class="campo">
            <span>Início dos serviços</span>
            <input v-model="campos.periodo_inicio" type="date" />
          </label>
          <label class="campo gerar__check">
            <input v-model="campos.parcial" type="checkbox" />
            <span>Atestado parcial (obra em andamento)</span>
          </label>
          <label v-if="!campos.parcial" class="campo">
            <span>Fim dos serviços</span>
            <input v-model="campos.periodo_fim" type="date" />
          </label>
        </div>
        <fieldset class="gerar__grupo">
          <legend>Responsável técnico da empresa</legend>
          <div class="grade">
            <label class="campo"><span>Nome</span><input v-model="campos.rt_nome" type="text" maxlength="120" /></label>
            <label class="campo"><span>Título profissional</span><input v-model="campos.rt_titulo" type="text" maxlength="80" /></label>
            <label class="campo"><span>Registro</span><input v-model="campos.rt_registro" type="text" maxlength="60" placeholder="CREA-MA nº ..." /></label>
            <label class="campo"><span>ART nº</span><input v-model="campos.art_numero" type="text" maxlength="60" /></label>
          </div>
        </fieldset>

        <fieldset v-if="planilha" class="gerar__grupo">
          <legend>Serviços executados (só entram os itens com quantidade)</legend>
          <div class="acoes gerar__atalhos">
            <button type="button" class="btn btn--link" @click="preencherQuantidades('contrato')">Quantidades do contrato</button>
            <button type="button" class="btn btn--link" @click="preencherQuantidades('proporcional')">
              Proporcional ao executado ({{ pct(obra.percentual_executado) }})
            </button>
            <button type="button" class="btn btn--link" @click="preencherQuantidades('vazio')">Limpar</button>
          </div>
          <p class="mudo pequeno">O fiscal confere as quantidades realmente executadas antes de emitir.</p>
          <div class="tabela-rolagem gerar__itens">
            <table class="tabela">
              <thead>
                <tr><th>Item</th><th>Descrição</th><th>Unid.</th><th class="direita">Contratado</th><th class="direita">Executado</th></tr>
              </thead>
              <tbody>
                <tr v-for="x in itensPlanilha" :key="x.id" :class="x.nivel === 'etapa' && 'gerar__etapa'">
                  <td class="num">{{ x.numero }}</td>
                  <td>{{ x.descricao }}</td>
                  <td>{{ x.unidade }}</td>
                  <td class="direita num">{{ x.nivel === 'item' && x.quantidade !== null ? numeroBr(x.quantidade, 4, 2) : '' }}</td>
                  <td class="direita">
                    <input
                      v-if="x.nivel === 'item'"
                      v-model="quantidades[x.id]"
                      class="gerar__qtd"
                      type="text"
                      inputmode="decimal"
                      :aria-label="`Quantidade executada de ${x.numero ?? ''} ${x.descricao}`"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </fieldset>
        <label class="campo">
          <span>Avaliação dos serviços</span>
          <textarea v-model="campos.avaliacao" maxlength="1000" rows="2" placeholder="Em branco: de forma satisfatória, em conformidade com as especificações técnicas e o contrato, nada constando que desabone a conduta técnica da empresa"></textarea>
        </label>
      </template>

      <!-- Ficha técnica -->
      <template v-else-if="tipo === 'ficha_tecnica'">
        <p class="pequeno mudo">
          Identificação, contrato, prazos com aditivos e paralisações, execução física e resumo da planilha por etapa.
        </p>
        <label class="campo">
          <span>Observações</span>
          <textarea v-model="campos.observacao" maxlength="2000" rows="3" placeholder="Opcional"></textarea>
        </label>
      </template>

      <!-- Planilha -->
      <template v-else>
        <label class="campo gerar__filtro">
          <span>Itens</span>
          <select v-model="campos.filtro_tipo">
            <option v-for="(rotulo, codigo) in FILTROS_PLANILHA" :key="codigo" :value="codigo">{{ rotulo }}</option>
          </select>
        </label>
      </template>

      <p v-if="emitido" class="gerar__ok" role="status">
        Emitido com o número {{ numeroOficial(emitido.numero, emitido.ano, estado.config.orgao_sigla) }}. Para baixar em outro
        formato, use a lista de emitidos.
      </p>
      <p v-if="erro" class="caixa-erro" role="alert">{{ erro }}</p>
      <p v-if="bloqueio" class="gerar__bloqueio">{{ bloqueio }}</p>
    </div>

    <template #rodape>
      <button class="btn" type="button" @click="emit('fechar')">{{ emitido ? 'Fechar' : 'Cancelar' }}</button>
      <button class="btn" type="button" :disabled="carregando || !!trabalhando || !!bloqueio" @click="previa">
        {{ trabalhando === 'previa' ? 'Gerando…' : 'Prévia (sem número)' }}
      </button>
      <button v-if="!emitido" class="btn btn--primario" type="button" :disabled="carregando || !!trabalhando || !!bloqueio" @click="emitir">
        {{ trabalhando === 'emitir' ? 'Emitindo…' : 'Emitir e baixar' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.gerar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.gerar__explica {
  margin: -4px 0 0;
}
.gerar__formato {
  border: none;
  padding: 0;
  margin: 0;
}
.gerar__formato legend {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--texto-2);
  padding: 0;
  margin-bottom: 4px;
}
.gerar__formato input {
  width: 18px;
  height: 18px;
  margin: 0;
}
.gerar__formato label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 14px;
  min-height: 36px;
  cursor: pointer;
}
.gerar__pendencias {
  margin: 0;
  padding: 8px 10px 8px 28px;
  border-radius: var(--raio-p);
  background: var(--alerta-fundo);
  color: var(--alerta);
  border: 1px solid #f0d89a;
  font-size: 0.88rem;
}
.gerar__grupo {
  border: 1px solid var(--borda);
  border-radius: var(--raio-p);
  padding: 8px 12px 12px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gerar__grupo legend {
  font-weight: 600;
  font-size: 0.9rem;
  padding: 0 4px;
}
.gerar__grupo p {
  margin: 0;
}
.gerar__check {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  align-self: end;
  min-height: 40px;
}
.gerar__check input {
  width: 18px;
  height: 18px;
  min-height: 0;
}
.gerar__atalhos .btn {
  padding: 2px 6px;
  min-height: 32px;
}
.gerar__itens {
  max-height: 300px;
  overflow: auto;
}
.gerar__itens td {
  padding-top: 4px;
  padding-bottom: 4px;
  vertical-align: middle;
}
.gerar__etapa td {
  background: #eef2f8;
  font-weight: 700;
}
.gerar__qtd {
  width: 110px;
  text-align: right;
  font: inherit;
  font-size: max(16px, 0.95rem);
  padding: 4px 6px;
  border: 1px solid var(--borda-campo);
  border-radius: var(--raio-p);
}
.gerar__filtro {
  max-width: 280px;
}
.gerar__ok {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--raio-p);
  background: #e6f6ee;
  color: #0b5a3e;
  border: 1px solid #a9dcc3;
}
.gerar__bloqueio {
  margin: 0;
  color: var(--s-atrasada);
  font-size: 0.9rem;
}
</style>
