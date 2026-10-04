<script setup>
// Somente o secretário: últimas 300 alterações no banco, com antes e depois.
import { ref, computed, onMounted } from 'vue';
import { api } from '../api/index.js';
import { dataHora, pct } from '../lib/formato.js';
import { nomeTipoDocumento, nomeTipoInstalacao } from '../estado.js';
import { rotuloEvento } from '../lib/eventos.js';

const linhas = ref([]);
const nomes = ref({});
const tabela = ref('');
const aberta = ref(null);
const carregando = ref(true);
const erro = ref('');

// Auditoria vazia por falha de rede pareceria "ninguém alterou nada": a falha aparece.
onMounted(async () => {
  try {
    const [a, perfis] = await Promise.all([api.auditoria(), api.perfis()]);
    linhas.value = a;
    nomes.value = Object.fromEntries(perfis.map((p) => [p.id, p.nome]));
  } catch (e) {
    erro.value = e.message;
  } finally {
    carregando.value = false;
  }
});

const ROTULO_TABELA = {
  obras: 'Obra', atualizacoes: 'Lançamento', eventos_obra: 'Evento', documentos: 'Documento',
  perfis: 'Usuário', configuracao: 'Configuração', papel_permissoes: 'Permissão', instalacoes: 'Instalação',
};
const ROTULO_OP = { INSERT: 'Inclusão', UPDATE: 'Alteração', DELETE: 'Exclusão', LIMPEZA_DEMO: 'Limpeza da demonstração' };
const IGNORAR = ['atualizado_em', 'ultima_atualizacao_em'];

const filtradas = computed(() => linhas.value.filter((l) => !tabela.value || l.tabela === tabela.value));

function mudancas(l) {
  if (l.operacao !== 'UPDATE' || !l.antes || !l.depois) return [];
  return Object.keys(l.depois)
    .filter((k) => !IGNORAR.includes(k) && JSON.stringify(l.antes[k]) !== JSON.stringify(l.depois[k]))
    .map((k) => ({ campo: k, de: l.antes[k], para: l.depois[k] }));
}

function resumo(l) {
  const d = l.depois ?? l.antes ?? {};
  if (l.tabela === 'obras') return d.nome ?? '';
  if (l.tabela === 'atualizacoes') return pct(d.percentual_executado);
  if (l.tabela === 'eventos_obra') return rotuloEvento(d.tipo);
  if (l.tabela === 'instalacoes') return `${d.nome ?? ''} (${nomeTipoInstalacao(d.tipo)})`;
  if (l.tabela === 'documentos') {
    return [nomeTipoDocumento(d.tipo), d.numero && `nº ${d.numero}`, d.numero_protocolo && `protocolo ${d.numero_protocolo}`]
      .filter(Boolean).join(' · ');
  }
  if (l.tabela === 'perfis') return `${d.nome} (${d.papel})`;
  return '';
}
const mostrar = (v) => (v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));
</script>

<template>
  <div>
    <div class="barra-titulo">
      <h1>Auditoria</h1>
      <label class="campo" style="min-width: 200px">
        <span class="oculto">Filtrar por tipo de registro</span>
        <select v-model="tabela">
          <option value="">Todos os registros</option>
          <option v-for="(r, k) in ROTULO_TABELA" :key="k" :value="k">{{ r }}</option>
        </select>
      </label>
    </div>
    <p class="mudo pequeno">Toda inclusão e alteração fica registrada aqui, com quem fez e quando. Nada é excluído pelos usuários.</p>

    <p v-if="carregando" class="mudo">Carregando…</p>
    <p v-else-if="erro" class="caixa-erro" role="alert">
      Não foi possível carregar a auditoria ({{ erro }}). Recarregue a página para tentar de novo.
    </p>
    <div v-else class="tabela-rolagem">
      <table class="tabela">
        <thead>
          <tr><th>Quando</th><th>Quem</th><th>Registro</th><th>Operação</th><th>Detalhe</th></tr>
        </thead>
        <tbody>
          <template v-for="l in filtradas" :key="l.id">
            <tr class="clicavel" @click="aberta = aberta === l.id ? null : l.id">
              <td class="num" style="white-space: nowrap">{{ dataHora(l.em) }}</td>
              <td>{{ l.usuario_id ? nomes[l.usuario_id] ?? 'Usuário' : 'Sistema' }}</td>
              <td>{{ ROTULO_TABELA[l.tabela] ?? l.tabela }}</td>
              <td>{{ ROTULO_OP[l.operacao] ?? l.operacao }}</td>
              <td class="pequeno">
                {{ resumo(l) }}
                <span v-if="mudancas(l).length" class="mudo"> · {{ mudancas(l).map((m) => m.campo).join(', ') }}</span>
              </td>
            </tr>
            <tr v-if="aberta === l.id">
              <td colspan="5" class="pequeno" style="background: #f7f9fb">
                <template v-if="mudancas(l).length">
                  <div v-for="m in mudancas(l)" :key="m.campo">
                    <strong>{{ m.campo }}</strong>: {{ mostrar(m.de) }} → {{ mostrar(m.para) }}
                  </div>
                </template>
                <pre v-else style="white-space: pre-wrap; margin: 0">{{ JSON.stringify(l.depois ?? l.antes, null, 2) }}</pre>
              </td>
            </tr>
          </template>
          <tr v-if="!filtradas.length">
            <td colspan="5" class="mudo">Nenhum registro.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
