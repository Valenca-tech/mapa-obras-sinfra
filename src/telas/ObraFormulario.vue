<script setup>
// Cadastro (admin/secretário) e edição de dados cadastrais da obra.
// Percentual, paralisação, aditivo e arquivamento têm ações próprias.
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, onBeforeRouteLeave } from 'vue-router';
import { api } from '../api/index.js';
import { ehErroDeRede } from '../api/erros.js';
import { novoId } from '../api/campos.js';
import {
  estado, pode, bairros, aposGravar, abrirAcao, obrasComSituacao, nomeTipoInstalacao, registrarNaoSalvo,
  mensagemDeFalhaAoGravar, avisar,
} from '../estado.js';
import { lerNumero, lerPercentual, erroDeData, data as fmtData, reais } from '../lib/formato.js';
import { distanciaMetros, formatarExtensao } from '../lib/geo.js';
import SeletorLocal from '../componentes/SeletorLocal.vue';
import DocumentoCampos from '../componentes/DocumentoCampos.vue';

const props = defineProps({ id: { type: String, default: null } });
const roteador = useRouter();
const editando = computed(() => !!props.id);

// Sugestões iniciais (bairros do escopo); a lista cresce com os bairros já cadastrados.
const BAIRROS_CONHECIDOS = [
  'Centro', 'Bacuri', 'Nova Imperatriz', 'Vila Lobão', 'Santa Rita', 'Bom Sucesso', 'Vila Nova',
  'Parque Alvorada', 'Vila Redenção', 'Santa Inês',
];
const sugestoesBairro = computed(() => [...new Set([...bairros.value, ...BAIRROS_CONHECIDOS])].sort((a, b) => a.localeCompare(b, 'pt-BR')));

const f = ref({
  nome: '', tipo: '', bairro: '', empresa: '', numero_processo: '', numero_contrato: '', valor: '',
  data_inicio: '', data_termino_prevista: '', fiscal_responsavel: '',
  empresa_cnpj: '', fiscal_titulo: '', fiscal_registro: '', fiscal_matricula: '',
});
const local = ref(null);
const trecho = ref(null); // GeoJSON do trecho de via, ou null para obra pontual
const instalacaoId = ref('');
const percentualInicial = ref('');
const comOS = ref(false);
const os = ref({ tipo: 'ordem_servico', numero: '', numero_protocolo: '', data_protocolo: '', orgao_origem: 'SINFRA', numero_processo: '' });

const original = ref(null);
const erros = ref({});
const erroGeral = ref('');
const salvando = ref(false);
const sujo = ref(false);
const carregado = ref(!props.id);

// Cadastro: o id nasce aqui. Se a rede cair depois de gravar e a pessoa tentar
// de novo, o banco devolve a mesma obra em vez de criar outra.
const idNovo = novoId();
let talvezGravada = false;

onMounted(async () => {
  if (!props.id) return;
  let o;
  try {
    o = obrasComSituacao.value.find((x) => x.id === props.id) ?? (await api.obter(props.id));
  } catch (e) {
    erroGeral.value = e.message;
    return;
  }
  if (!o) {
    erroGeral.value = 'Obra não encontrada.';
    return;
  }
  original.value = o;
  f.value = {
    nome: o.nome, tipo: o.tipo, bairro: o.bairro ?? '', empresa: o.empresa ?? '',
    numero_processo: o.numero_processo ?? '', numero_contrato: o.numero_contrato ?? '',
    valor: o.valor_contrato != null ? String(o.valor_contrato).replace('.', ',') : '',
    data_inicio: o.data_inicio, data_termino_prevista: o.data_termino_prevista,
    fiscal_responsavel: o.fiscal_responsavel ?? '',
    empresa_cnpj: o.empresa_cnpj ?? '',
    fiscal_titulo: o.fiscal_titulo ?? '',
    fiscal_registro: o.fiscal_registro ?? '',
    fiscal_matricula: o.fiscal_matricula ?? '',
  };
  local.value = { latitude: o.latitude, longitude: o.longitude };
  trecho.value = o.trecho ?? null;
  instalacaoId.value = o.instalacao_id ?? '';
  carregado.value = true;
  setTimeout(() => (sujo.value = false));
});

function validar() {
  const e = {};
  const v = f.value;
  if (!v.nome.trim()) e.nome = 'Informe o nome da obra.';
  if (!v.tipo) e.tipo = 'Escolha o tipo.';
  if (!v.data_inicio) e.data_inicio = 'Informe a data de início.';
  else if (erroDeData(v.data_inicio)) e.data_inicio = erroDeData(v.data_inicio);
  if (!v.data_termino_prevista) e.data_termino_prevista = 'Informe o término previsto.';
  else if (erroDeData(v.data_termino_prevista)) e.data_termino_prevista = erroDeData(v.data_termino_prevista);
  if (!e.data_inicio && !e.data_termino_prevista && v.data_termino_prevista <= v.data_inicio) {
    e.data_termino_prevista = 'O término deve ser posterior ao início.';
  }
  if (local.value?.latitude == null) {
    e.local = 'Marque a obra no mapa: um ponto, ou um trecho com pelo menos 2 pontos.';
  }
  const valor = lerNumero(v.valor);
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) e.valor = 'Valor inválido. Ex.: 1.250.000,00';
  else if (valor !== null && valor >= 1e12) e.valor = 'Valor grande demais. Confira o número digitado.';
  if (!editando.value) {
    const p = lerPercentual(percentualInicial.value);
    if (p.erro) e.percentual = p.erro;
  }
  if (comOS.value && os.value.data_protocolo) {
    if (erroDeData(os.value.data_protocolo)) e.os = `Data do protocolo: ${erroDeData(os.value.data_protocolo)}`;
    else if (os.value.data_protocolo > estado.hoje) e.os = 'A data do protocolo não pode ser futura.';
  }
  erros.value = e;
  return !Object.keys(e).length;
}

function dados() {
  const v = f.value;
  return {
    nome: v.nome.trim(),
    tipo: v.tipo,
    bairro: v.bairro.trim() || null,
    empresa: v.empresa.trim() || null,
    numero_processo: v.numero_processo.trim() || null,
    numero_contrato: v.numero_contrato.trim() || null,
    valor_contrato: lerNumero(v.valor),
    data_inicio: v.data_inicio,
    data_termino_prevista: v.data_termino_prevista,
    latitude: local.value.latitude,
    longitude: local.value.longitude,
    trecho: trecho.value ?? null,
    instalacao_id: instalacaoId.value || null,
    fiscal_responsavel: v.fiscal_responsavel.trim() || null,
    empresa_cnpj: v.empresa_cnpj.trim() || null,
    fiscal_titulo: v.fiscal_titulo.trim() || null,
    fiscal_registro: v.fiscal_registro.trim() || null,
    fiscal_matricula: v.fiscal_matricula.trim() || null,
  };
}

// Instalações públicas para vincular, as mais próximas do local marcado primeiro.
const opcoesInstalacao = computed(() => {
  const p = local.value;
  const lista = estado.instalacoes.map((i) => ({
    ...i,
    distancia: p?.latitude != null ? distanciaMetros([p.latitude, p.longitude], [i.latitude, i.longitude]) : null,
  }));
  lista.sort((a, b) => (a.distancia ?? 0) - (b.distancia ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  return lista;
});
const vinculoDesativado = computed(
  () => instalacaoId.value && !estado.instalacoes.some((i) => i.id === instalacaoId.value),
);

const iguais = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function salvar() {
  if (salvando.value) return;
  erroGeral.value = '';
  if (!validar()) {
    erroGeral.value = erros.value.os ?? 'Confira os campos marcados.';
    return;
  }
  salvando.value = true;
  try {
    let id = props.id;
    if (editando.value) {
      const d = dados();
      const o = original.value;
      const mudou = Object.fromEntries(Object.entries(d).filter(([k, x]) => !iguais(x, o[k])));
      if (o.tem_aditivo) delete mudou.data_termino_prevista;
      if (Object.keys(mudou).length) await api.editarObra(id, mudou);
    } else {
      const p = lerPercentual(percentualInicial.value).valor;
      id = await api.criarObra({ id: idNovo, ...dados() }, p, comOS.value ? os.value : null);
      // A 1ª tentativa pode ter gravado antes de a rede cair: o banco devolveu
      // aquela obra; aplica o que foi mudado no formulário depois disso.
      if (talvezGravada) await api.editarObra(id, dados());
    }
    sujo.value = false;
    await aposGravar(editando.value ? 'Alterações salvas.' : 'Obra cadastrada.');
    roteador.push({ path: '/mapa', query: { obra: id } });
  } catch (e) {
    if (!editando.value && ehErroDeRede(e)) talvezGravada = true;
    erroGeral.value = mensagemDeFalhaAoGravar(e);
  } finally {
    salvando.value = false;
  }
}

// Ao marcar o ponto, some o aviso de localização pendente.
watch(local, (v) => {
  if (v?.latitude != null && erros.value.local) {
    const { local: _, ...resto } = erros.value;
    erros.value = resto;
    if (!Object.keys(resto).length) erroGeral.value = '';
  }
});

// Aditivo ou arquivamento feitos a partir desta tela: atualiza o que está na tela.
watch(
  () => estado.versao,
  async () => {
    if (!props.id) return;
    let o;
    try {
      o = await api.obter(props.id);
    } catch (e) {
      avisar(e.message, 'erro');
      return;
    }
    if (!o || o.arquivada) {
      sujo.value = false;
      roteador.push('/mapa');
      return;
    }
    original.value = o;
    f.value.data_termino_prevista = o.data_termino_prevista;
  },
);

const temNaoSalvo = () => sujo.value && !salvando.value;
registrarNaoSalvo('obra-formulario', temNaoSalvo);
onBeforeUnmount(() => registrarNaoSalvo('obra-formulario', null));
onBeforeRouteLeave(() => (temNaoSalvo() ? confirm('Há alterações não salvas. Sair mesmo assim?') : true));
const marcarSujo = () => (sujo.value = true);
</script>

<template>
  <div class="form-obra">
    <div class="barra-titulo">
      <h1>{{ editando ? 'Editar obra' : 'Nova obra' }}</h1>
      <div v-if="editando && original && !original.arquivada" class="acoes">
        <button v-if="pode('obra.aditivo')" class="btn" @click="abrirAcao('aditivo', original)">Aditivo de prazo</button>
        <button v-if="pode('obra.arquivar')" class="btn btn--perigo" @click="abrirAcao('arquivar', original)">Arquivar obra</button>
      </div>
    </div>

    <p v-if="erroGeral && !carregado" class="caixa-erro">{{ erroGeral }}</p>

    <form v-if="carregado" class="cartao form-obra__cartao" novalidate @submit.prevent="salvar" @input="marcarSujo">
      <section>
        <h2>Identificação</h2>
        <div class="grade">
          <label :class="['campo', 'largo', erros.nome && 'campo--erro']">
            <span>Nome da obra <i class="obrig">*</i></span>
            <input v-model="f.nome" type="text" maxlength="200" placeholder="Ex.: Pavimentação da Rua X" />
            <small v-if="erros.nome" class="erro-campo">{{ erros.nome }}</small>
          </label>
          <label :class="['campo', erros.tipo && 'campo--erro']">
            <span>Tipo <i class="obrig">*</i></span>
            <select v-model="f.tipo">
              <option value="" disabled>Escolha…</option>
              <option v-for="t in estado.tiposObra" :key="t.codigo" :value="t.codigo">{{ t.nome }}</option>
            </select>
            <small v-if="erros.tipo" class="erro-campo">{{ erros.tipo }}</small>
          </label>
          <label class="campo">
            <span>Bairro</span>
            <input v-model="f.bairro" type="text" list="lista-bairros" />
            <datalist id="lista-bairros">
              <option v-for="b in sugestoesBairro" :key="b" :value="b" />
            </datalist>
          </label>
        </div>
      </section>

      <section>
        <h2>Fiscal da obra</h2>
        <p class="mudo pequeno">Nome, título e registro saem na assinatura das declarações e do atestado.</p>
        <div class="grade">
          <label class="campo">
            <span>Nome do fiscal</span>
            <input v-model="f.fiscal_responsavel" type="text" maxlength="120" />
          </label>
          <label class="campo">
            <span>Título profissional</span>
            <input v-model="f.fiscal_titulo" type="text" maxlength="80" placeholder="Ex.: Engenheiro Civil" />
          </label>
          <label class="campo">
            <span>Registro profissional</span>
            <input v-model="f.fiscal_registro" type="text" maxlength="60" placeholder="Ex.: CREA-MA nº 123456" />
          </label>
          <label class="campo">
            <span>Matrícula</span>
            <input v-model="f.fiscal_matricula" type="text" maxlength="30" />
          </label>
        </div>
      </section>

      <section>
        <h2>Contrato</h2>
        <div class="grade">
          <label class="campo">
            <span>Empresa contratada</span>
            <input v-model="f.empresa" type="text" />
          </label>
          <label class="campo">
            <span>CNPJ da empresa</span>
            <input v-model="f.empresa_cnpj" type="text" maxlength="30" placeholder="00.000.000/0000-00" />
          </label>
          <label class="campo">
            <span>Nº do processo administrativo</span>
            <input v-model="f.numero_processo" type="text" />
          </label>
          <label class="campo">
            <span>Nº do contrato</span>
            <input v-model="f.numero_contrato" type="text" />
          </label>
          <label :class="['campo', erros.valor && 'campo--erro']">
            <span>Valor do contrato (R$)</span>
            <input v-model="f.valor" type="text" inputmode="decimal" placeholder="Ex.: 1.250.000,00" />
            <small v-if="erros.valor" class="erro-campo">{{ erros.valor }}</small>
            <small v-else-if="f.valor && Number.isFinite(lerNumero(f.valor))" class="ajuda">{{ reais(lerNumero(f.valor)) }}</small>
          </label>
        </div>
      </section>

      <section>
        <h2>Prazo</h2>
        <div class="grade">
          <label :class="['campo', erros.data_inicio && 'campo--erro']">
            <span>Início (ordem de serviço) <i class="obrig">*</i></span>
            <input v-model="f.data_inicio" type="date" min="2000-01-01" max="2099-12-31" />
            <small v-if="erros.data_inicio" class="erro-campo">{{ erros.data_inicio }}</small>
          </label>
          <label :class="['campo', erros.data_termino_prevista && 'campo--erro']">
            <span>Término previsto <i class="obrig">*</i></span>
            <input
              v-model="f.data_termino_prevista"
              type="date"
              :min="f.data_inicio || '2000-01-01'"
              max="2099-12-31"
              :disabled="original?.tem_aditivo"
            />
            <small v-if="erros.data_termino_prevista" class="erro-campo">{{ erros.data_termino_prevista }}</small>
            <small v-else-if="original?.tem_aditivo" class="ajuda">
              Esta obra tem aditivo de prazo (término original {{ fmtData(original.data_termino_original) }}).
              Para mudar o término, registre um novo aditivo.
            </small>
            <small v-else-if="editando" class="ajuda">Use só para corrigir erro de cadastro. Prorrogação é por aditivo.</small>
          </label>
          <label v-if="!editando" :class="['campo', erros.percentual && 'campo--erro']">
            <span>Percentual já executado (%)</span>
            <input v-model="percentualInicial" type="text" inputmode="decimal" placeholder="0" />
            <small v-if="erros.percentual" class="erro-campo">{{ erros.percentual }}</small>
            <small v-else class="ajuda">Para obra já em andamento. Vira o primeiro lançamento do histórico.</small>
          </label>
        </div>
      </section>

      <section>
        <h2>Localização <i class="obrig">*</i></h2>
        <SeletorLocal
          v-model="local"
          v-model:trecho="trecho"
          :erro="!!erros.local"
          @update:model-value="marcarSujo"
          @update:trecho="marcarSujo"
        />
        <small v-if="erros.local" class="erro-campo" style="color: var(--s-atrasada)">{{ erros.local }}</small>

        <label class="campo form-obra__instalacao">
          <span>Instalação pública atendida <small class="mudo">(opcional)</small></span>
          <select v-model="instalacaoId" @change="marcarSujo">
            <option value="">Nenhuma: a obra não é numa instalação da Prefeitura</option>
            <option v-if="vinculoDesativado" :value="instalacaoId">Instalação vinculada (desativada)</option>
            <option v-for="i in opcoesInstalacao" :key="i.id" :value="i.id">
              {{ i.nome }} · {{ nomeTipoInstalacao(i.tipo) }}{{ i.distancia != null ? ` · a ${formatarExtensao(i.distancia) || '0 m'}` : '' }}
            </option>
          </select>
          <small class="ajuda">Use quando a obra é numa escola, praça, unidade de saúde ou outra instalação. A lista começa pelas mais próximas do local marcado.</small>
        </label>
      </section>

      <section v-if="!editando">
        <label class="form-obra__check">
          <input v-model="comOS" type="checkbox" />
          Informar a ordem de serviço agora
        </label>
        <DocumentoCampos v-if="comOS" v-model="os" titulo="Ordem de serviço" />
      </section>

      <p v-if="erroGeral" class="caixa-erro" role="alert">{{ erroGeral }}</p>

      <div class="form-obra__botoes">
        <RouterLink to="/mapa" class="btn">Cancelar</RouterLink>
        <button class="btn btn--primario btn--grande" :disabled="salvando">
          {{ salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar obra' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.form-obra {
  max-width: 920px;
  margin: 0 auto;
}
.form-obra__cartao {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 20px;
}
.form-obra__cartao h2 {
  font-size: 1rem;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--borda);
  margin-bottom: 12px;
}
.form-obra__instalacao {
  margin-top: 14px;
  max-width: 640px;
}
.form-obra__check {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  margin-bottom: 10px;
}
.form-obra__check input {
  width: 20px;
  height: 20px;
}
.form-obra__botoes {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.obrig {
  color: var(--s-atrasada);
  font-style: normal;
}
</style>
