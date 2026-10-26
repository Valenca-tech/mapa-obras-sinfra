<script setup>
// Atos formais sem documento completo (número e protocolo).
import { ref, onMounted, watch } from 'vue';
import { api } from '../api/index.js';
import { estado, pode, abrirAcao, obrasComSituacao, avisar } from '../estado.js';
import { data } from '../lib/formato.js';
import { diasEntre } from '../lib/situacao.js';
import { rotuloEvento } from '../lib/eventos.js';

const itens = ref([]);
const carregando = ref(true);
const abrindo = ref(null); // evento sendo aberto em "Completar" (trava os botões)

async function carregar() {
  carregando.value = true;
  try {
    itens.value = await api.pendencias();
  } catch (e) {
    avisar(e.message, 'erro');
  } finally {
    carregando.value = false;
  }
}
onMounted(carregar);
watch(() => estado.versao, carregar);

async function completar(p) {
  if (abrindo.value) return;
  abrindo.value = p.evento_id;
  try {
    const { eventos } = await api.historico(p.obra_id);
    const evento = eventos.find((e) => e.id === p.evento_id);
    const obra = obrasComSituacao.value.find((o) => o.id === p.obra_id) ?? (await api.obter(p.obra_id));
    if (!evento || !obra) {
      avisar('Este ato não foi encontrado. A lista será atualizada.', 'erro');
      await carregar();
      return;
    }
    abrirAcao('documento', obra, evento);
  } catch (e) {
    avisar(e.message, 'erro');
  } finally {
    abrindo.value = null;
  }
}
</script>

<template>
  <div>
    <div class="pagina__cabecalho">
      <div>
        <h1>Pendências</h1>
        <p class="pagina__subtitulo">Atos registrados sem o documento completo (número e protocolo).</p>
      </div>
    </div>

    <p v-if="carregando" class="mudo">Carregando…</p>
    <div v-else-if="!itens.length" class="vazio">
      <strong>Nenhuma pendência</strong>
      Todos os atos têm número e protocolo do documento.
    </div>
    <div v-else class="tabela-rolagem">
      <table class="tabela pendencias">
        <thead>
          <tr>
            <th>Obra</th>
            <th>Ato</th>
            <th>Data</th>
            <th>Pendente há</th>
            <th>O que falta</th>
            <th><span class="oculto">Ação</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in itens" :key="p.evento_id">
            <td>
              <RouterLink :to="{ path: `/obras/${p.obra_id}`, query: { aba: 'historico' } }" class="pendencias__obra">{{ p.obra_nome }}</RouterLink>
            </td>
            <td>{{ rotuloEvento(p.tipo) }}</td>
            <td class="num">{{ data(p.data_evento) }}</td>
            <td class="num">{{ diasEntre(p.data_evento, estado.hoje) }} {{ diasEntre(p.data_evento, estado.hoje) === 1 ? 'dia' : 'dias' }}</td>
            <td>
              <template v-if="!p.documento_id">Documento inteiro</template>
              <template v-else>
                {{ [!p.numero && 'número', !p.numero_protocolo && 'protocolo'].filter(Boolean).join(' e ') }}
              </template>
            </td>
            <td>
              <button
                v-if="pode('documento.editar')"
                class="btn"
                :disabled="!!abrindo"
                @click="completar(p)"
              >
                {{ abrindo === p.evento_id ? 'Abrindo…' : 'Completar' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.pendencias__obra {
  color: var(--texto);
  font-weight: 500;
  text-decoration: none;
}
.pendencias__obra:hover {
  color: var(--azul);
  text-decoration: underline;
}
/* Celular: cada pendência vira um bloco, com "Completar" logo abaixo do nome. */
@media (max-width: 640px) {
  .pendencias thead {
    display: none;
  }
  .pendencias tr {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 10px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--borda);
  }
  .pendencias td {
    display: block;
    padding: 0;
    border: none;
  }
  .pendencias td:first-child {
    grid-column: 1 / -1;
    font-weight: 600;
  }
  .pendencias td:last-child {
    grid-column: 1 / -1;
    margin-top: 6px;
  }
}
</style>
