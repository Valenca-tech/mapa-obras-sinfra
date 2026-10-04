<script setup>
// Instalações públicas da Prefeitura que se relacionam com a SINFRA: sede,
// pátio de máquinas, usina, almoxarifado, escolas, unidades de saúde, praças.
// Todos consultam; gabinete e secretário cadastram, editam e desativam.
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/index.js';
import { estado, pode, obrasComSituacao, nomeTipoInstalacao, recarregarInstalacoes, recarregarObras, avisar } from '../estado.js';
import { svgInstalacao } from '../lib/mapa.js';
import { distanciaAteObra, RAIO_PROXIMIDADE_M } from '../lib/geo.js';
import { semAcento } from '../lib/texto.js';
import InstalacaoFormulario from '../componentes/InstalacaoFormulario.vue';

const roteador = useRouter();
const busca = ref('');
const tipo = ref('');
const verInativas = ref(false);
const inativas = ref([]);
const editando = ref(undefined); // undefined = fechado; null = nova; objeto = editar

async function carregar() {
  try {
    await Promise.all([recarregarInstalacoes(), recarregarObras()]);
    inativas.value = verInativas.value
      ? (await api.listarInstalacoes({ inativas: true })).filter((i) => !i.ativa)
      : [];
  } catch (e) {
    avisar(e.message, 'erro');
  }
}
onMounted(carregar);
watch(verInativas, carregar);

const linhas = computed(() => {
  const b = semAcento(busca.value.trim());
  return [...estado.instalacoes, ...inativas.value]
    .filter((i) => (!tipo.value || i.tipo === tipo.value) && (!b || semAcento(`${i.nome} ${i.bairro} ${i.endereco}`).includes(b)))
    .map((i) => ({
      ...i,
      vinculadas: obrasComSituacao.value.filter((o) => o.instalacao_id === i.id).length,
      proximas: obrasComSituacao.value.filter(
        (o) => o.instalacao_id !== i.id && distanciaAteObra([i.latitude, i.longitude], o) <= RAIO_PROXIMIDADE_M,
      ).length,
    }))
    .sort((a, b) => Number(b.ativa) - Number(a.ativa) || a.nome.localeCompare(b.nome, 'pt-BR'));
});

const verNoMapa = (i) => roteador.push({ path: '/mapa', query: { instalacao: i.id } });
const aoSalvar = () => carregar();
</script>

<template>
  <div>
    <div class="barra-titulo">
      <h1>Instalações públicas</h1>
      <button v-if="pode('instalacao.editar')" class="btn btn--primario" @click="editando = null">+ Nova instalação</button>
    </div>
    <p class="mudo inst__intro">
      Prédios e espaços da Prefeitura que costumam ter relação com a SINFRA. Aparecem no mapa como quadrados azuis; no
      balão de cada um, as obras vinculadas e as que estão a até {{ RAIO_PROXIMIDADE_M }} m.
    </p>

    <div class="inst__filtros">
      <label class="campo">
        <span class="oculto">Buscar</span>
        <input v-model="busca" type="search" placeholder="Buscar por nome, bairro ou endereço" />
      </label>
      <label class="campo">
        <span class="oculto">Tipo</span>
        <select v-model="tipo" aria-label="Tipo">
          <option value="">Todos os tipos</option>
          <option v-for="t in estado.tiposInstalacao" :key="t.codigo" :value="t.codigo">{{ t.nome }}</option>
        </select>
      </label>
      <label v-if="pode('instalacao.editar')" class="inst__check">
        <input v-model="verInativas" type="checkbox" />
        Mostrar desativadas
      </label>
    </div>

    <div class="tabela-rolagem">
      <table class="tabela">
        <thead>
          <tr>
            <th>Instalação</th>
            <th>Tipo</th>
            <th class="direita">Obras vinculadas</th>
            <th class="direita">Obras a até {{ RAIO_PROXIMIDADE_M }} m</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="i in linhas" :key="i.id" :class="!i.ativa && 'inst__inativa'">
            <td>
              <strong>{{ i.nome }}</strong>
              <span v-if="!i.ativa" class="etiqueta etiqueta--alerta" style="margin-left: 6px">Desativada</span>
              <span class="mudo pequeno inst__end">{{ [i.endereco, i.bairro].filter(Boolean).join(' · ') || 'Sem endereço' }}</span>
            </td>
            <td>
              <span class="inst__tipo">
                <span class="instalacao instalacao--mini" v-html="svgInstalacao(i.tipo)"></span>
                {{ nomeTipoInstalacao(i.tipo) }}
              </span>
            </td>
            <td class="direita num">{{ i.vinculadas || '—' }}</td>
            <td class="direita num">{{ i.proximas || '—' }}</td>
            <td class="inst__acoes">
              <button v-if="i.ativa" class="btn btn--link" @click="verNoMapa(i)">Ver no mapa</button>
              <button v-if="pode('instalacao.editar')" class="btn btn--link" @click="editando = i">Editar</button>
            </td>
          </tr>
          <tr v-if="!linhas.length">
            <td colspan="5" class="mudo">
              Nenhuma instalação encontrada.
              <template v-if="pode('instalacao.editar') && !busca && !tipo">Cadastre a sede da SINFRA, o pátio de máquinas, a usina e o almoxarifado.</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="pequeno mudo inst__fonte">
      A carga inicial veio do OpenStreetMap (© colaboradores do OpenStreetMap, licença ODbL), com localização aproximada.
      Confira cada ponto e corrija pela edição.
    </p>

    <InstalacaoFormulario
      v-if="editando !== undefined"
      :instalacao="editando"
      @fechar="editando = undefined"
      @salvou="aoSalvar"
    />
  </div>
</template>

<style scoped>
.inst__intro {
  margin: -6px 0 14px;
  max-width: 820px;
}
.inst__filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.inst__filtros .campo {
  flex: 1 1 220px;
  max-width: 340px;
}
.inst__check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.88rem;
  color: var(--texto-2);
  cursor: pointer;
}
.inst__check input {
  width: 18px;
  height: 18px;
}
.inst__end {
  display: block;
}
.inst__tipo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.inst__acoes {
  white-space: nowrap;
  text-align: right;
}
.inst__inativa td {
  color: var(--texto-3);
}
.inst__fonte {
  margin-top: 10px;
}
</style>
