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
      <h2 class="docs__titulo">Emitir documento</h2>
      <p class="mudo pequeno docs__explica">
        Saem no papel timbrado da Prefeitura (brasão, Secretaria, endereço e CNPJ), com número de controle
        (ex.: Nº 001/{{ estado.hoje.slice(0, 4) }}-SINFRA), data por extenso e assinatura do secretário e do fiscal da obra.
        Conferir os dados antes de assinar.
      </p>
      <div class="docs__tipos">
        <article v-for="(t, codigo) in TIPOS_DOCUMENTO" :key="codigo" class="cartao docs__tipo">
          <h3>{{ t.nome }}</h3>
          <p class="mudo pequeno">{{ t.descricao }}</p>
          <p class="pequeno docs__formatos">{{ formatosDe(codigo).map((f) => ROTULO[f]).join(', ') }}</p>
          <button v-if="pode('documento.gerar')" class="btn btn--primario" @click="gerando = codigo">Emitir</button>
        </article>
      </div>
      <p v-if="!pode('documento.gerar')" class="mudo pequeno">Emitir documentos é do gabinete e dos fiscais.</p>
    </section>

    <section>
      <h2 class="docs__titulo">Emitidos para esta obra</h2>
      <p v-if="carregando && !emitidos.length" class="mudo">Carregando…</p>
      <p v-else-if="!emitidos.length" class="mudo">Nenhum documento emitido ainda.</p>
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
  gap: 22px;
}
.docs__titulo {
  margin: 0 0 6px;
}
.docs__explica {
  margin: 0 0 12px;
  max-width: 80ch;
}
.docs__tipos {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}
.docs__tipo {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.docs__tipo h3 {
  margin: 0;
}
.docs__tipo p {
  margin: 0;
  flex: 1;
}
.docs__formatos {
  flex: 0 !important;
  color: var(--texto-2);
}
.docs__tipo .btn {
  align-self: flex-start;
}
.docs__baixar {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.docs__baixar .btn {
  min-height: 32px;
  padding: 2px 8px;
}
</style>
