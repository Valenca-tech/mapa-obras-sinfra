<script setup>
// Diálogo único para as ações sobre uma obra:
// lancar, paralisar, retomar, aditivo, arquivar, desarquivar, documento.
import { ref, reactive, computed } from 'vue';
import { api } from '../api/index.js';
import { novoId } from '../api/campos.js';
import { estado, aposGravar, mensagemDeFalhaAoGravar } from '../estado.js';
import { data as fmtData, pct, lerPercentual, erroDeData } from '../lib/formato.js';
import { tipoDocumentoDoEvento, EVENTO_DA_ACAO } from '../lib/eventos.js';
import Modal from './Modal.vue';
import DocumentoCampos from './DocumentoCampos.vue';

// O App remonta este componente a cada abertura (key = estado.acao.id).
const { tipo, obra, evento } = estado.acao;

const TITULO = {
  lancar: 'Lançar percentual executado',
  paralisar: 'Paralisar obra',
  retomar: 'Retomar obra',
  aditivo: 'Registrar aditivo de prazo',
  arquivar: 'Arquivar obra',
  desarquivar: 'Desarquivar obra',
  documento: 'Completar documento',
};

const f = reactive({
  data: estado.hoje, // abrirAcao atualiza o "hoje" (aba aberta desde ontem)
  texto: '',
  percentual: '',
  novoTermino: '',
  comDocumento: ['aditivo', 'arquivar', 'documento'].includes(tipo),
});

// Documento: no "Completar documento", os campos já registrados vêm preenchidos
// e travados (o banco recusa trocar um valor já gravado).
const docExistente = evento?.documento ?? {};
const CAMPOS_DOC = ['tipo', 'numero', 'numero_protocolo', 'data_protocolo', 'orgao_origem', 'numero_processo'];
const travados = tipo === 'documento' ? CAMPOS_DOC.filter((c) => docExistente[c]) : [];
const doc = ref({
  tipo: docExistente.tipo ?? tipoDocumentoDoEvento(tipo === 'documento' ? evento?.tipo : EVENTO_DA_ACAO[tipo]),
  numero: docExistente.numero ?? '',
  numero_protocolo: docExistente.numero_protocolo ?? '',
  data_protocolo: docExistente.data_protocolo ?? '',
  orgao_origem: docExistente.orgao_origem ?? 'SINFRA',
  numero_processo: docExistente.numero_processo ?? obra.numero_processo ?? '',
});
const docInicial = JSON.stringify(doc.value);

const erro = ref('');
const salvando = ref(false);
const avisos = ref([]); // confirmações pendentes (redução de percentual, prazo menor...)
const percentualAtual = ref(Number(obra.percentual_executado ?? 0));

const fechar = () => (estado.acao = null);
const documento = () => (f.comDocumento ? doc.value : null);

const sujo = computed(
  () => !!(f.texto.trim() || f.percentual.trim() || f.novoTermino || f.data !== estado.hoje || JSON.stringify(doc.value) !== docInicial),
);

const percentualLido = computed(() => lerPercentual(f.percentual));

// Limites das datas (o banco confere de novo).
const minParalisacao = computed(() => [obra.data_inicio, obra.ultima_retomada].filter(Boolean).sort().pop());
const naoIniciada = estado.hoje < obra.data_inicio;

const rotuloBotao = computed(() => {
  if (avisos.value.length) return 'Confirmar';
  return {
    lancar: 'Salvar lançamento', paralisar: 'Paralisar', retomar: 'Retomar', aditivo: 'Registrar aditivo',
    arquivar: 'Arquivar obra', desarquivar: 'Desarquivar', documento: 'Salvar documento',
  }[tipo];
});

function validar() {
  if (tipo === 'lancar') {
    const p = percentualLido.value;
    if (p.erro) return p.erro;
    if (p.valor === null) return 'Informe o novo percentual executado.';
  }
  if (['paralisar', 'arquivar', 'desarquivar'].includes(tipo) && !f.texto.trim()) return 'Informe o motivo.';
  if (['paralisar', 'retomar', 'aditivo'].includes(tipo)) {
    if (!f.data) return 'Informe a data.';
    if (erroDeData(f.data)) return erroDeData(f.data);
    if (f.data > estado.hoje) return 'A data não pode ser futura.';
  }
  if (tipo === 'paralisar') {
    if (naoIniciada) return `A obra ainda não começou (início em ${fmtData(obra.data_inicio)}). Se o início mudou, registre um aditivo.`;
    if (f.data < obra.data_inicio) return `A paralisação não pode ser antes do início da obra (${fmtData(obra.data_inicio)}).`;
    if (obra.ultima_retomada && f.data < obra.ultima_retomada) {
      return `A paralisação não pode ser antes da última retomada (${fmtData(obra.ultima_retomada)}).`;
    }
  }
  if (tipo === 'retomar' && f.data < obra.paralisada_desde) {
    return `A retomada não pode ser antes da paralisação (${fmtData(obra.paralisada_desde)}).`;
  }
  if (tipo === 'aditivo') {
    if (!f.novoTermino) return 'Informe o novo término.';
    if (erroDeData(f.novoTermino)) return `Novo término: ${erroDeData(f.novoTermino)}`;
    if (f.novoTermino <= obra.data_inicio) return 'O novo término deve ser posterior ao início da obra.';
    if (f.novoTermino === obra.data_termino_prevista) return 'O novo término é igual ao atual.';
  }
  if (tipo === 'documento' && !doc.value.numero?.trim() && !doc.value.numero_protocolo?.trim()) {
    return 'Informe pelo menos o número do documento ou o protocolo.';
  }
  if (f.comDocumento && doc.value.data_protocolo) {
    if (erroDeData(doc.value.data_protocolo)) return `Data do protocolo: ${erroDeData(doc.value.data_protocolo)}`;
    if (doc.value.data_protocolo > estado.hoje) return 'A data do protocolo não pode ser futura.';
  }
  return '';
}

// Situações que pedem um segundo clique (não são erro, mas costumam ser engano).
function avisosParaConfirmar() {
  const lista = [];
  if (tipo === 'lancar' && percentualLido.value.valor < percentualAtual.value) {
    lista.push(
      `O novo valor (${pct(percentualLido.value.valor)}) é menor que o atual (${pct(percentualAtual.value)}). ` +
        'Se for correção de lançamento errado, confirme. O histórico guarda os dois valores.',
    );
  }
  if (tipo === 'aditivo') {
    if (f.novoTermino < obra.data_termino_prevista) {
      lista.push(
        `O novo término (${fmtData(f.novoTermino)}) é anterior ao término vigente (${fmtData(obra.data_termino_prevista)}): ` +
          'o prazo da obra será reduzido.',
      );
    }
    if (f.novoTermino < estado.hoje) {
      lista.push(`O novo término (${fmtData(f.novoTermino)}) já passou: a obra ficará como atrasada por prazo vencido.`);
    }
    if (f.data < obra.data_inicio) {
      lista.push(`A data do aditivo (${fmtData(f.data)}) é anterior ao início da obra (${fmtData(obra.data_inicio)}).`);
    }
  }
  return lista;
}

// Lançamento repetido depois de falha de rede: mesmo id = não duplica.
let idLancamento = null;
let assinaturaLancamento = null;
function idDoLancamento(valor, obs) {
  const assinatura = `${valor}|${obs ?? ''}`;
  if (assinatura !== assinaturaLancamento) {
    assinaturaLancamento = assinatura;
    idLancamento = novoId();
  }
  return idLancamento;
}

async function confirmar() {
  if (salvando.value) return; // Enter repetido enquanto grava
  erro.value = validar();
  if (erro.value) return;
  salvando.value = true;
  try {
    if (tipo === 'lancar') {
      // Compara com o percentual de agora (outro fiscal pode ter lançado).
      const atual = await api.obter(obra.id).catch(() => null);
      if (atual) percentualAtual.value = Number(atual.percentual_executado ?? 0);
    }
    if (!avisos.value.length) {
      const lista = avisosParaConfirmar();
      if (lista.length) {
        avisos.value = lista;
        return;
      }
    }

    let msg;
    switch (tipo) {
      case 'lancar': {
        const valor = percentualLido.value.valor;
        const obs = f.texto.trim() || null;
        await api.lancar([{ id: idDoLancamento(valor, obs), obra_id: obra.id, percentual_executado: valor, observacao: obs }]);
        msg = 'Lançamento salvo.';
        break;
      }
      case 'paralisar':
        await api.paralisar(obra.id, f.texto.trim(), documento(), f.data);
        msg = 'Obra marcada como paralisada.';
        break;
      case 'retomar':
        await api.retomar(obra.id, f.texto.trim(), documento(), f.data);
        msg = 'Obra retomada.';
        break;
      case 'aditivo':
        await api.registrarAditivo(obra.id, f.novoTermino, f.texto.trim(), documento(), f.data);
        msg = 'Aditivo registrado.';
        break;
      case 'arquivar':
        await api.arquivar(obra.id, f.texto.trim(), documento());
        estado.obraAberta = null;
        msg = 'Obra arquivada. Ela não aparece mais no mapa nem no relatório (veja em Lista > Mostrar arquivadas).';
        break;
      case 'desarquivar':
        await api.desarquivar(obra.id, f.texto.trim(), documento());
        msg = 'Obra desarquivada.';
        break;
      case 'documento':
        await api.completarDocumento(evento.id, doc.value);
        msg = 'Documento salvo.';
        break;
    }
    fechar();
    await aposGravar(msg); // não lança erro
  } catch (e) {
    erro.value = mensagemDeFalhaAoGravar(e);
  } finally {
    salvando.value = false;
  }
}

// Mudou algo depois do aviso: confere de novo antes de gravar.
const limparAvisos = () => (avisos.value = []);
</script>

<template>
  <Modal :titulo="TITULO[tipo]" :largura="f.comDocumento ? '640px' : '500px'" :sujo="sujo" @fechar="fechar">
    <form class="acao" @submit.prevent="confirmar" @input="limparAvisos" @change="limparAvisos">
      <p class="acao__obra">
        <strong>{{ obra.nome }}</strong>
        <span class="mudo"> · {{ obra.bairro }}</span>
      </p>

      <!-- Lançamento -->
      <template v-if="tipo === 'lancar'">
        <p class="mudo pequeno">Percentual atual: <strong class="num">{{ pct(percentualAtual) }}</strong></p>
        <label class="campo">
          <span>Novo percentual executado (%) <i class="obrig">*</i></span>
          <input v-model="f.percentual" type="text" inputmode="decimal" class="acao__grande" placeholder="Ex.: 42,5" autocomplete="off" />
          <small class="ajuda">Sem avanço desde o último lançamento? Repita o valor atual e explique na observação.</small>
        </label>
        <label class="campo">
          <span>Observação</span>
          <textarea v-model="f.texto" rows="2" placeholder="Opcional"></textarea>
        </label>
      </template>

      <!-- Paralisar / retomar -->
      <template v-if="tipo === 'paralisar' || tipo === 'retomar'">
        <p v-if="tipo === 'paralisar' && naoIniciada" class="caixa-erro">
          A obra ainda não começou (início em {{ fmtData(obra.data_inicio) }}). Paralisação vale para obra em execução;
          se o início mudou, registre um aditivo.
        </p>
        <label class="campo">
          <span>Data da {{ tipo === 'paralisar' ? 'paralisação' : 'retomada' }}</span>
          <input
            v-model="f.data"
            type="date"
            :max="estado.hoje"
            :min="tipo === 'retomar' ? obra.paralisada_desde : minParalisacao"
          />
        </label>
        <label class="campo">
          <span>{{ tipo === 'paralisar' ? 'Motivo' : 'Observação' }} <i v-if="tipo === 'paralisar'" class="obrig">*</i></span>
          <textarea v-model="f.texto" rows="3" :placeholder="tipo === 'paralisar' ? 'Ex.: chuvas, falta de material, interferência com rede…' : 'Opcional'"></textarea>
        </label>
        <p v-if="tipo === 'retomar'" class="caixa-info">
          Paralisada desde {{ fmtData(obra.paralisada_desde) }}. Se a paralisação mudou o prazo, registre também o aditivo.
        </p>
        <label class="acao__check">
          <input v-model="f.comDocumento" type="checkbox" />
          Já tenho o documento ({{ tipo === 'paralisar' ? 'ordem de paralisação' : 'ordem de reinício' }})
        </label>
      </template>

      <!-- Aditivo -->
      <template v-if="tipo === 'aditivo'">
        <p class="mudo pequeno">
          Término vigente: <strong class="num">{{ fmtData(obra.data_termino_prevista) }}</strong>
          <template v-if="obra.data_termino_original !== obra.data_termino_prevista">
            · original: {{ fmtData(obra.data_termino_original) }}
          </template>
        </p>
        <div class="grade">
          <label class="campo">
            <span>Novo término <i class="obrig">*</i></span>
            <input v-model="f.novoTermino" type="date" :min="obra.data_inicio" max="2099-12-31" />
          </label>
          <label class="campo">
            <span>Data do aditivo</span>
            <input v-model="f.data" type="date" min="2000-01-01" :max="estado.hoje" />
          </label>
        </div>
        <label class="campo">
          <span>Justificativa</span>
          <textarea v-model="f.texto" rows="2" placeholder="Ex.: chuvas acima da média, acréscimo de serviços…"></textarea>
        </label>
      </template>

      <!-- Arquivar / desarquivar -->
      <template v-if="tipo === 'arquivar' || tipo === 'desarquivar'">
        <p v-if="tipo === 'arquivar'" class="caixa-erro">
          A obra sai do mapa e do relatório. <strong>Não é exclusão:</strong> o histórico continua guardado, ela aparece
          na Lista com "Mostrar arquivadas" e pode ser desarquivada.
        </p>
        <label class="campo">
          <span>Motivo <i class="obrig">*</i></span>
          <textarea v-model="f.texto" rows="2" :placeholder="tipo === 'arquivar' ? 'Ex.: contrato encerrado, rescisão, cadastro em duplicidade…' : 'Ex.: arquivada por engano'"></textarea>
        </label>
        <label class="acao__check">
          <input v-model="f.comDocumento" type="checkbox" />
          Informar documento
        </label>
      </template>

      <DocumentoCampos v-if="f.comDocumento" v-model="doc" :travados="travados" />

      <div v-if="avisos.length" class="caixa-erro" role="alert">
        <p v-for="(a, i) in avisos" :key="i">{{ a }}</p>
        <p><strong>Confira e clique em "Confirmar" para gravar assim mesmo.</strong></p>
      </div>
      <p v-if="erro" class="caixa-erro" role="alert">{{ erro }}</p>
      <button type="submit" class="oculto" aria-hidden="true" tabindex="-1" :disabled="salvando"></button>
    </form>

    <template #rodape>
      <button class="btn" type="button" @click="fechar">Cancelar</button>
      <button
        :class="['btn', tipo === 'arquivar' ? 'btn--perigo' : tipo === 'paralisar' ? 'btn--alerta' : 'btn--primario']"
        type="button"
        :disabled="salvando"
        @click="confirmar"
      >
        {{ salvando ? 'Salvando…' : rotuloBotao }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.acao {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.acao p {
  margin: 0;
}
.acao .caixa-erro p + p {
  margin-top: 6px;
}
.acao__obra {
  font-size: 0.95rem;
}
.acao__grande {
  font-size: 1.4rem !important;
  min-height: 52px !important;
  font-variant-numeric: tabular-nums;
}
.acao__check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.92rem;
  cursor: pointer;
  min-height: 40px;
}
.acao__check input {
  width: 20px;
  height: 20px;
}
</style>
