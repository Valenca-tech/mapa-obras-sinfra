<script setup>
// Cadastro e edição de instalação pública (gabinete e secretário).
import { ref, computed } from 'vue';
import { api } from '../api/index.js';
import { novoId } from '../api/campos.js';
import { ehErroDeRede } from '../api/erros.js';
import { estado, avisar, recarregarInstalacoes, mensagemDeFalhaAoGravar } from '../estado.js';
import Modal from './Modal.vue';
import SeletorLocal from './SeletorLocal.vue';

const props = defineProps({ instalacao: { type: Object, default: null } });
const emit = defineEmits(['fechar', 'salvou']);
const editando = computed(() => !!props.instalacao);

const i = props.instalacao;
const f = ref({
  nome: i?.nome ?? '',
  tipo: i?.tipo ?? '',
  bairro: i?.bairro ?? '',
  endereco: i?.endereco ?? '',
  observacao: i?.observacao ?? '',
  ativa: i?.ativa ?? true,
});
const local = ref(i ? { latitude: i.latitude, longitude: i.longitude } : null);
const erros = ref({});
const erroGeral = ref('');
const salvando = ref(false);

// Nova instalação: o id nasce aqui; repetir depois de falha de rede não duplica.
const idNovo = novoId();
let talvezGravada = false;

const inicial = JSON.stringify([f.value, local.value]);
const sujo = computed(() => JSON.stringify([f.value, local.value]) !== inicial);

function validar() {
  const e = {};
  if (!f.value.nome.trim()) e.nome = 'Informe o nome.';
  if (!f.value.tipo) e.tipo = 'Escolha o tipo.';
  if (local.value?.latitude == null) e.local = 'Marque o local no mapa.';
  erros.value = e;
  return !Object.keys(e).length;
}

async function salvar() {
  if (salvando.value) return; // Enter repetido enquanto grava
  erroGeral.value = '';
  if (!validar()) return;
  const dados = {
    nome: f.value.nome.trim(),
    tipo: f.value.tipo,
    bairro: f.value.bairro.trim() || null,
    endereco: f.value.endereco.trim() || null,
    observacao: f.value.observacao.trim() || null,
    latitude: local.value.latitude,
    longitude: local.value.longitude,
  };
  salvando.value = true;
  try {
    if (editando.value) {
      const campos = { ...dados, ativa: f.value.ativa };
      const mudou = Object.fromEntries(Object.entries(campos).filter(([k, v]) => (v ?? null) !== (i[k] ?? null)));
      if (Object.keys(mudou).length) await api.editarInstalacao(i.id, mudou);
    } else {
      await api.criarInstalacao({ id: idNovo, ...dados });
      // A 1ª tentativa pode ter gravado antes de a rede cair: aplica o que
      // estiver no formulário agora.
      if (talvezGravada) await api.editarInstalacao(idNovo, dados);
    }
  } catch (e) {
    if (!editando.value && ehErroDeRede(e)) talvezGravada = true;
    erroGeral.value = mensagemDeFalhaAoGravar(e);
    salvando.value = false;
    return;
  }
  // Gravou. Falha só na recarga da lista não pode parecer que não salvou.
  try {
    await recarregarInstalacoes();
    avisar(editando.value ? 'Instalação atualizada.' : 'Instalação cadastrada.');
  } catch {
    avisar('Instalação salva, mas a lista não atualizou. Recarregue a página.', 'erro');
  } finally {
    salvando.value = false;
  }
  emit('salvou');
  emit('fechar');
}
</script>

<template>
  <Modal :titulo="editando ? 'Editar instalação' : 'Nova instalação pública'" largura="760px" :sujo="sujo" @fechar="emit('fechar')">
    <form class="inst-form" novalidate @submit.prevent="salvar">
      <div class="grade">
        <label :class="['campo', 'largo', erros.nome && 'campo--erro']">
          <span>Nome <i class="obrig">*</i></span>
          <input v-model="f.nome" type="text" maxlength="200" placeholder="Ex.: Pátio de máquinas da SINFRA" />
          <small v-if="erros.nome" class="erro-campo">{{ erros.nome }}</small>
        </label>
        <label :class="['campo', erros.tipo && 'campo--erro']">
          <span>Tipo <i class="obrig">*</i></span>
          <select v-model="f.tipo">
            <option value="" disabled>Escolha…</option>
            <option v-for="t in estado.tiposInstalacao" :key="t.codigo" :value="t.codigo">{{ t.nome }}</option>
          </select>
          <small v-if="erros.tipo" class="erro-campo">{{ erros.tipo }}</small>
        </label>
        <label class="campo">
          <span>Bairro</span>
          <input v-model="f.bairro" type="text" />
        </label>
        <label class="campo largo">
          <span>Endereço</span>
          <input v-model="f.endereco" type="text" placeholder="Rua, número" />
        </label>
        <label class="campo largo">
          <span>Observação</span>
          <textarea v-model="f.observacao" rows="2"></textarea>
        </label>
      </div>

      <div class="inst-form__local">
        <span class="inst-form__rotulo">Local no mapa <i class="obrig">*</i></span>
        <SeletorLocal v-model="local" :permitir-trecho="false" :erro="!!erros.local" cor="#0b2a5b" />
        <small v-if="erros.local" class="erro-campo" style="color: var(--s-atrasada)">{{ erros.local }}</small>
      </div>

      <label v-if="editando" class="inst-form__check">
        <input v-model="f.ativa" type="checkbox" />
        Ativa (aparece no mapa). Desmarque em vez de excluir: o histórico e os vínculos com obras ficam guardados.
      </label>

      <p v-if="erroGeral" class="caixa-erro" role="alert">{{ erroGeral }}</p>
      <button type="submit" class="oculto" aria-hidden="true" tabindex="-1" :disabled="salvando"></button>
    </form>
    <template #rodape>
      <button class="btn" type="button" @click="emit('fechar')">Cancelar</button>
      <button class="btn btn--primario" type="button" :disabled="salvando" @click="salvar">
        {{ salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar instalação' }}
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.inst-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.inst-form__local {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.inst-form__rotulo {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--texto-2);
}
.inst-form__check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 0.9rem;
  cursor: pointer;
}
.inst-form__check input {
  width: 18px;
  height: 18px;
  margin-top: 2px;
  flex-shrink: 0;
}
.obrig {
  color: var(--s-atrasada);
  font-style: normal;
}
</style>
