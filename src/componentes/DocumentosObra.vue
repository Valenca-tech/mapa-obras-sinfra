<script setup>
// Aba "Documentos" da Central: emitir declaração, atestado, ficha técnica e
// planilha no papel timbrado, e baixar de novo os já emitidos (saem iguais:
// cada emissão guarda o retrato do conteúdo).
import { ref, watch } from 'vue';
import { api } from '../api/index.js';
import { estado, pode, avisar } from '../estado.js';
import { TIPOS_DOCUMENTO, montarDocumento } from '../lib/documentos/conteudo.js';
import { numeroOficial } from '../lib/extenso.js';
import { dataHora } from '../lib/formato.js';
import { FileText } from 'lucide-vue-next';
import GerarDocumento from './GerarDocumento.vue';

const props = defineProps({ obra: { type: Object, required: true } });

const emitidos = ref([]);
const carregando = ref(true);
const gerando = ref(null); // tipo do diálogo aberto
const baixando = ref(''); // `${id}:${formato}`

let seq = 0;
async function carregar() {
  const n = ++seq;
  carregando.value = true;
  try {
    const lista = await api.listarDocumentosGerados(props.obra.id);
    if (n === seq) emitidos.value = lista;
  } catch (e) {
    if (n === seq) avisar(e.message, 'erro');
  } finally {
    if (n === seq) carregando.value = false;
  }
}
watch(() => [props.obra.id, estado.versao], carregar, { immediate: true });

const formatosDe = (tipo) => (tipo === 'planilha_servicos' ? ['pdf', 'word', 'excel'] : ['pdf', 'word']);
const ROTULO = { pdf: 'PDF', word: 'Word', excel: 'Excel' };

async function baixarDeNovo(d, formato) {
  baixando.value = `${d.id}:${formato}`;
  try {
    const completo = await api.obterDocumentoGerado(d.id);
    if (!completo) throw new Error('Documento não encontrado.');
    const { gerarEBaixar } = await import('../lib/documentos/arquivos.js');
    await gerarEBaixar(montarDocumento(completo.dados, { numero: completo.numero, ano: completo.ano }), formato);
  } catch (e) {
    avisar(`Não foi possível gerar o arquivo: ${e.message}`, 'erro');
  } finally {
    baixando.value = '';
  }
}

function aoEmitir() {
  gerando.value = null;
  carregar();
}
</script>

<template>
  <div class="docs">
    <section>
      <h2 class="secao__titulo">Emitir</h2>
      <ul class="docs__tipos">
        <li v-for="(t, codigo) in TIPOS_DOCUMENTO" :key="codigo" class="docs__tipo">
          <FileText class="icone docs__icone" aria-hidden="true" />
          <div class="docs__texto">
            <strong>{{ t.nome }}</strong>
            <span>{{ t.descricao }}</span>
          </div>
          <span class="docs__formatos">{{ formatosDe(codigo).map((f) => ROTULO[f]).join(' · ') }}</span>
          <button v-if="pode('documento.gerar')" type="button" class="btn" @click="gerando = codigo">Emitir</button>
        </li>
      </ul>
      <p class="docs__nota">
        Papel timbrado da Prefeitura, número de controle (Nº 001/{{ estado.hoje.slice(0, 4) }}-{{ estado.config.orgao_sigla || 'SINFRA' }}),
        data por extenso e assinatura do secretário e do fiscal. Confira antes de assinar.
        <template v-if="!pode('documento.gerar')"> Emitir é do gabinete e dos fiscais.</template>
      </p>
    </section>

    <section>
      <h2 class="secao__titulo">Emitidos para esta obra</h2>
      <p v-if="carregando && !emitidos.length" class="mudo">Carregando…</p>
      <p v-else-if="!emitidos.length" class="vazio">Nenhum documento emitido ainda.</p>
      <div v-else class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th>Documento</th>
              <th>Número</th>
              <th>Emitido</th>
              <th>Baixar de novo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in emitidos" :key="d.id">
              <td>
                {{ TIPOS_DOCUMENTO[d.tipo]?.nome ?? d.tipo }}
                <small v-if="d.numero_protocolo" class="mudo"><br />Processo/protocolo {{ d.numero_protocolo }}</small>
              </td>
              <td class="num">{{ numeroOficial(d.numero, d.ano, estado.config.orgao_sigla) }}</td>
              <td>{{ dataHora(d.gerado_em) }}<small class="mudo"><br />{{ d.gerado_por_nome }}</small></td>
              <td>
                <div class="docs__baixar">
                  <button
                    v-for="f in formatosDe(d.tipo)"
                    :key="f"
                    class="btn btn--link"
                    :disabled="!!baixando"
                    @click="baixarDeNovo(d, f)"
                  >
                    {{ baixando === `${d.id}:${f}` ? 'Gerando…' : ROTULO[f] }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <GerarDocumento v-if="gerando" :obra="obra" :tipo-inicial="gerando" @fechar="gerando = null" @emitiu="aoEmitir" />
  </div>
</template>

<style scoped>
.docs {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.docs__tipos {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--superficie);
  border: 1px solid var(--borda);
  border-radius: var(--raio);
}
.docs__tipo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}
.docs__tipo + .docs__tipo {
  border-top: 1px solid var(--borda);
}
.docs__icone {
  width: 18px;
  height: 18px;
  color: var(--texto-3);
}
.docs__texto {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.docs__texto strong {
  font-weight: 500;
}
.docs__texto span {
  font-size: 0.88rem;
  color: var(--texto-3);
}
.docs__formatos {
  font-size: 0.86rem;
  color: var(--texto-2);
  white-space: nowrap;
}
.docs__nota {
  margin: 8px 0 0;
  font-size: 0.86rem;
  color: var(--texto-3);
}
.docs__baixar {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
@media (max-width: 640px) {
  .docs__tipo {
    flex-wrap: wrap;
  }
  .docs__formatos {
    order: 3;
    flex-basis: 100%;
    padding-left: 30px;
  }
}
</style>
