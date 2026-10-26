<script setup>
// Tela do fiscal: pensada primeiro para celular. Lança o percentual de várias
// obras e salva tudo de uma vez (um único INSERT: tudo ou nada).
//
// O que foi digitado e ainda não salvo fica guardado neste aparelho (rascunho
// por usuário): sobrevive a "puxar para atualizar", ao voltar do Android e a
// uma queda da sessão. Só entra no sistema ao tocar em Salvar.
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { api } from '../api/index.js';
import { novoId } from '../api/campos.js';
import {
  estado, pode, obrasComSituacao, recarregarObras, aposGravar, abrirAcao, avisar, registrarNaoSalvo,
  mensagemDeFalhaAoGravar,
} from '../estado.js';
import { pct, haDias, lerPercentual, pontos, data } from '../lib/formato.js';
import { semAcento } from '../lib/texto.js';
import { TriangleAlert, Search } from 'lucide-vue-next';
import SeloSituacao from '../componentes/SeloSituacao.vue';
import Modal from '../componentes/Modal.vue';

const novos = reactive({}); // id -> { valor, obs, comObs }
const vazio = () => ({ valor: '', obs: '', comObs: false });
// Cria a entrada de cada obra fora da renderização (mutar estado no template gera laço).
watch(obrasComSituacao, (lista) => lista.forEach((o) => (novos[o.id] ??= vazio())), { immediate: true });
const entrada = (id) => novos[id] ?? vazio();
const busca = ref('');
const ordenacao = ref('atualizacao');
const salvando = ref(false);
const erro = ref('');
const reducoes = ref(null); // lista para confirmação

// ---------------------------------------------------------------- rascunho neste aparelho

const chaveRascunho = () => `mapa-obras-rascunho-atualizar-${estado.sessao?.id ?? 'anonimo'}`;

function lerRascunho() {
  try {
    return JSON.parse(localStorage.getItem(chaveRascunho()) || '{}');
  } catch {
    return {};
  }
}

// Só grava depois de restaurar: antes disso, a lista ainda vazia apagaria o
// rascunho guardado.
let restaurado = false;

function gravarRascunho() {
  if (!restaurado) return;
  const preenchidos = Object.fromEntries(
    Object.entries(novos)
      .filter(([, e]) => e.valor.toString().trim() || e.obs.trim())
      .map(([id, e]) => [id, { valor: e.valor, obs: e.obs }]),
  );
  try {
    if (Object.keys(preenchidos).length) localStorage.setItem(chaveRascunho(), JSON.stringify(preenchidos));
    else localStorage.removeItem(chaveRascunho());
  } catch {
    /* sem storage: segue sem rascunho */
  }
}

function restaurarRascunho() {
  const rascunho = lerRascunho();
  let n = 0;
  for (const [id, e] of Object.entries(rascunho)) {
    if (!obrasComSituacao.value.some((o) => o.id === id)) continue; // obra arquivada ou de outro usuário
    const atual = (novos[id] ??= vazio());
    if (atual.valor || atual.obs) continue;
    atual.valor = e.valor ?? '';
    atual.obs = e.obs ?? '';
    atual.comObs = !!atual.obs;
    n++;
  }
  if (n) avisar(`Rascunho recuperado: ${n} ${n === 1 ? 'obra digitada' : 'obras digitadas'} e ainda não ${n === 1 ? 'salva' : 'salvas'}.`, 'info');
}

watch(novos, gravarRascunho, { deep: true });

onMounted(async () => {
  try {
    await recarregarObras();
  } catch (e) {
    avisar(e.message, 'erro');
  }
  restaurarRascunho();
  restaurado = true;
  gravarRascunho();
});

// ---------------------------------------------------------------- listas

const obras = computed(() => {
  const b = semAcento(busca.value.trim());
  const lista = obrasComSituacao.value.filter((o) => !b || semAcento(`${o.nome} ${o.bairro}`).includes(b));
  const concluida = (o) => (o.situacao.codigo === 'concluida' ? 1 : 0);
  const criterio = {
    atualizacao: (a, b2) => (b2.situacao.diasSemAtualizacao ?? 0) - (a.situacao.diasSemAtualizacao ?? 0),
    nome: (a, b2) => a.nome.localeCompare(b2.nome, 'pt-BR'),
    bairro: (a, b2) => (a.bairro ?? '').localeCompare(b2.bairro ?? '', 'pt-BR') || a.nome.localeCompare(b2.nome, 'pt-BR'),
  }[ordenacao.value];
  return [...lista].sort((a, b2) => concluida(a) - concluida(b2) || criterio(a, b2));
});

const leitura = (o) => lerPercentual(novos[o.id]?.valor);

const pendentes = computed(() =>
  obrasComSituacao.value
    .filter((o) => novos[o.id]?.valor?.toString().trim())
    .map((o) => ({ obra: o, valor: leitura(o).valor, obs: novos[o.id].obs.trim() || null })),
);

// Observação escrita sem percentual: não tem como salvar sozinha (avisa no item).
const obsSoltas = computed(() =>
  obrasComSituacao.value.filter((o) => novos[o.id]?.obs?.trim() && !novos[o.id]?.valor?.toString().trim()),
);

const erroDoItem = (o) => (novos[o.id]?.valor?.toString().trim() ? leitura(o).erro ?? '' : '');

const repetirAtual = (o) => (entrada(o.id).valor = pontos(o.percentual_executado));

const temNaoSalvo = () => pendentes.value.length > 0 || obsSoltas.value.length > 0;
registrarNaoSalvo('atualizar', temNaoSalvo);
onBeforeUnmount(() => registrarNaoSalvo('atualizar', null));

onBeforeRouteLeave(() => {
  if (!temNaoSalvo()) return true;
  return confirm(
    'Há percentuais ou observações digitados e não salvos. Eles ficam guardados neste aparelho, ' +
      'mas só entram no sistema quando você tocar em Salvar. Sair mesmo assim?',
  );
});

// ---------------------------------------------------------------- gravação

// Lançamento repetido depois de falha de rede: mesmo id = não duplica.
const ids = new Map(); // obra -> { assinatura, id }
function idDoItem(obraId, valor, obs) {
  const assinatura = `${valor}|${obs ?? ''}`;
  const atual = ids.get(obraId);
  if (atual?.assinatura === assinatura) return atual.id;
  const id = novoId();
  ids.set(obraId, { assinatura, id });
  return id;
}

async function salvar() {
  if (salvando.value) return;
  erro.value = '';
  if (!pendentes.value.length) return;
  if (pendentes.value.some((p) => erroDoItem(p.obra))) {
    erro.value = 'Corrija os percentuais marcados em vermelho.';
    return;
  }
  // Compara com o percentual de agora: outro fiscal pode ter lançado.
  salvando.value = true;
  try {
    await recarregarObras();
  } catch {
    /* sem rede: compara com o que já estava na tela */
  } finally {
    salvando.value = false;
  }
  const r = pendentes.value.filter((p) => p.valor < Number(p.obra.percentual_executado));
  if (r.length) {
    reducoes.value = r;
    return;
  }
  gravar();
}

async function gravar() {
  if (salvando.value) return;
  reducoes.value = null;
  salvando.value = true;
  const lote = pendentes.value.map((p) => ({ ...p, id: idDoItem(p.obra.id, p.valor, p.obs) }));
  try {
    await api.lancar(lote.map((p) => ({ id: p.id, obra_id: p.obra.id, percentual_executado: p.valor, observacao: p.obs })));
    // Limpa só o que foi gravado (e não mudou durante a gravação).
    for (const p of lote) {
      const e = novos[p.obra.id];
      if (e && leitura(p.obra).valor === p.valor && (e.obs.trim() || null) === p.obs) novos[p.obra.id] = vazio();
      ids.delete(p.obra.id);
    }
    await aposGravar(lote.length === 1 ? 'Lançamento salvo.' : `${lote.length} lançamentos salvos.`);
  } catch (e) {
    erro.value = mensagemDeFalhaAoGravar(e);
  } finally {
    salvando.value = false;
  }
}
</script>

<template>
  <div class="atualizar">
    <div class="pagina__cabecalho">
      <div>
        <h1>Lançamentos</h1>
        <p class="pagina__subtitulo">Informe o novo percentual das obras visitadas e salve. As outras ficam como estão.</p>
      </div>
    </div>

    <div class="atualizar__ferramentas">
      <label class="atualizar__busca">
        <span class="oculto">Buscar</span>
        <Search class="icone" aria-hidden="true" />
        <input v-model="busca" class="controle" type="search" placeholder="Buscar obra ou bairro" />
      </label>
      <label>
        <span class="oculto">Ordenar</span>
        <select v-model="ordenacao" class="controle">
          <option value="atualizacao">Mais tempo sem atualizar</option>
          <option value="nome">Nome</option>
          <option value="bairro">Bairro</option>
        </select>
      </label>
    </div>

    <ul class="atualizar__lista">
      <li v-for="o in obras" :key="o.id" :class="['item', (novos[o.id]?.valor || novos[o.id]?.obs) && 'item--alterado']">
        <div class="item__topo">
          <RouterLink :to="`/obras/${o.id}`" class="item__nome">
            <strong>{{ o.nome }}</strong>
            <span>{{ o.bairro }}</span>
          </RouterLink>
          <SeloSituacao :situacao="o.situacao" />
        </div>

        <div class="item__info pequeno">
          <span>Atual: <strong class="num">{{ pct(o.percentual_executado) }}</strong></span>
          <span>Prazo: <span class="num">{{ pct(o.situacao.prazoDecorrido) }}</span></span>
          <span v-if="o.situacao.alertaSemAtualizacao" class="item__alerta">
            <TriangleAlert class="icone" aria-hidden="true" />sem atualização {{ haDias(o.situacao.diasSemAtualizacao) }}
          </span>
          <span v-else class="mudo">{{ o.ultima_atualizacao_em ? `Atualizada ${haDias(o.situacao.diasDesdeLancamento)}` : 'Nunca atualizada' }}</span>
        </div>
        <p v-if="o.paralisada" class="item__paralisada pequeno">Paralisada desde {{ data(o.paralisada_desde) }}</p>

        <div class="item__entrada">
          <label :class="['campo', erroDoItem(o) && 'campo--erro']">
            <span>Novo %</span>
            <input
              v-model="entrada(o.id).valor"
              type="text"
              inputmode="decimal"
              enterkeyhint="next"
              autocomplete="off"
              placeholder="—"
              :aria-label="`Novo percentual de ${o.nome}`"
              :aria-invalid="!!erroDoItem(o)"
            />
          </label>
          <button
            v-if="!entrada(o.id).comObs"
            type="button"
            class="btn btn--link item__obs-botao"
            @click="entrada(o.id).comObs = true"
          >
            Adicionar observação
          </button>
          <template v-if="pode('obra.paralisar')">
            <button v-if="o.paralisada" type="button" class="btn item__paralisar" @click="abrirAcao('retomar', o)">Retomar</button>
            <button
              v-else-if="estado.hoje >= o.data_inicio"
              type="button"
              class="btn btn--alerta item__paralisar"
              @click="abrirAcao('paralisar', o)"
            >
              Paralisar
            </button>
          </template>
        </div>
        <p v-if="erroDoItem(o)" class="pequeno item__erro" role="alert">{{ erroDoItem(o) }}</p>
        <p
          v-else-if="novos[o.id]?.valor && leitura(o).valor < Number(o.percentual_executado)"
          class="pequeno item__aviso"
        >
          Menor que o atual: será pedida confirmação.
        </p>
        <label v-if="entrada(o.id).comObs" class="campo item__obs">
          <span>Observação</span>
          <textarea v-model="entrada(o.id).obs" rows="2" placeholder="Ex.: chuva atrasou a concretagem"></textarea>
        </label>
        <p v-if="novos[o.id]?.obs?.trim() && !novos[o.id]?.valor?.toString().trim()" class="pequeno item__aviso">
          Para salvar a observação, informe também o percentual (pode repetir o atual).
          <button type="button" class="btn btn--link" @click="repetirAtual(o)">Repetir {{ pct(o.percentual_executado) }}</button>
        </p>
      </li>
      <li v-if="!obras.length" class="item mudo">Nenhuma obra encontrada.</li>
    </ul>

    <div class="atualizar__salvar">
      <p v-if="erro" class="caixa-erro" role="alert">{{ erro }}</p>
      <button class="btn btn--primario btn--grande btn--bloco" :disabled="!pendentes.length || salvando" @click="salvar">
        <template v-if="salvando">Salvando…</template>
        <template v-else-if="pendentes.length">Salvar {{ pendentes.length }} {{ pendentes.length === 1 ? 'lançamento' : 'lançamentos' }}</template>
        <template v-else-if="obsSoltas.length">Informe o percentual para salvar a observação</template>
        <template v-else>Nenhum percentual alterado</template>
      </button>
    </div>

    <Modal v-if="reducoes" titulo="Confirmar redução de percentual" @fechar="reducoes = null">
      <p>Os percentuais abaixo são <strong>menores</strong> que o último lançamento. Se for correção de valor digitado errado, confirme. O histórico guarda os dois valores.</p>
      <ul class="reducoes">
        <li v-for="r in reducoes" :key="r.obra.id">
          <strong>{{ r.obra.nome }}</strong>: <span class="num">{{ pct(r.obra.percentual_executado) }} → {{ pct(r.valor) }}</span>
        </li>
      </ul>
      <template #rodape>
        <button class="btn" type="button" @click="reducoes = null">Revisar</button>
        <button class="btn btn--primario" type="button" :disabled="salvando" @click="gravar">Confirmar e salvar</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.atualizar {
  max-width: 760px;
  margin: 0 auto;
}
.atualizar__ferramentas {
  display: grid;
  grid-template-columns: 1fr 220px;
  gap: 8px;
  margin-bottom: 12px;
}
.atualizar__busca {
  position: relative;
}
.atualizar__busca .icone {
  position: absolute;
  left: 9px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--texto-3);
  pointer-events: none;
}
.atualizar__busca input {
  padding-left: 32px;
}
.atualizar__lista {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--superficie);
  border: 1px solid var(--borda);
  border-radius: var(--raio);
}
.item {
  padding: 14px 16px;
  box-shadow: inset 3px 0 0 transparent;
}
.item + .item {
  border-top: 1px solid var(--borda);
}
.item--alterado {
  box-shadow: inset 3px 0 0 var(--azul);
  background: #fafbfe;
}
.item__topo {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.item__nome {
  display: flex;
  flex-direction: column;
  color: var(--texto);
  text-decoration: none;
  min-width: 0;
}
.item__nome strong {
  font-weight: 500;
}
.item__nome span {
  font-size: 0.86rem;
  color: var(--texto-3);
}
.item__nome:hover strong {
  color: var(--azul);
  text-decoration: underline;
}
.item__info {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  align-items: center;
  margin-top: 6px;
  color: var(--texto-2);
}
.item__alerta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--alerta);
}
.item__alerta .icone {
  width: 14px;
  height: 14px;
}
.item__paralisada {
  margin: 6px 0 0;
  color: var(--s-paralisada);
}
.item__entrada {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.item__entrada .campo {
  width: 120px;
  flex-shrink: 0;
}
.item__entrada input {
  font-size: 1.2rem;
  min-height: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.item__obs-botao {
  min-height: 44px;
}
.item__paralisar {
  margin-left: auto;
}
.item__erro {
  margin: 4px 0 0;
  color: var(--erro);
}
.item__aviso {
  margin: 4px 0 0;
  color: var(--alerta);
}
.item__aviso .btn--link {
  padding: 2px 4px;
}
.item__obs {
  margin-top: 8px;
}
/* Barra de salvar presa ao pé da tela, dentro da área de conteúdo. */
.atualizar__salvar {
  position: sticky;
  bottom: 0;
  z-index: 900;
  margin: 12px -24px -40px;
  padding: 10px 24px calc(10px + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.97);
  border-top: 1px solid var(--borda);
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.atualizar__salvar > * {
  width: 100%;
  max-width: 760px;
}
.reducoes {
  padding-left: 18px;
}
@media (max-width: 640px) {
  .atualizar__salvar {
    margin: 12px -14px -32px;
    padding-left: 14px;
    padding-right: 14px;
  }
}
@media (max-width: 480px) {
  .atualizar__ferramentas {
    grid-template-columns: 1fr;
  }
  .item__entrada .campo {
    width: 104px;
  }
}
@media print {
  .atualizar__salvar {
    display: none !important;
  }
}
</style>
