<script setup>
// Somente o secretário: parâmetros da regra de situação e visão dos perfis.
import { ref, onMounted } from 'vue';
import { api, modoDemo } from '../api/index.js';
import { estado, avisar, ROTULO_PAPEL, mensagemDeFalhaAoGravar } from '../estado.js';
import { lerNumero, lerPercentual, pontos } from '../lib/formato.js';

const tolerancia = ref(pontos(estado.config.tolerancia_atraso_pontos));
const dias = ref(String(estado.config.dias_sem_atualizacao_alerta));
const erro = ref('');
const erroCarga = ref('');
const salvando = ref(false);
const papeis = ref([]);
const permissoes = ref([]);
const usuarios = ref([]);

onMounted(async () => {
  const ORDEM = ['secretario', 'admin', 'fiscal', 'leitura'];
  try {
    const [lista, todas, perfis] = await Promise.all([api.permissoesPorPapel(), api.permissoes(), api.perfis()]);
    permissoes.value = todas;
    usuarios.value = perfis;
    papeis.value = lista.sort((a, b) => ORDEM.indexOf(a.codigo) - ORDEM.indexOf(b.codigo));
  } catch (e) {
    erroCarga.value = `Não foi possível carregar perfis e permissões: ${e.message}`;
  }
});

async function salvar() {
  if (salvando.value) return;
  erro.value = '';
  const t = lerPercentual(tolerancia.value);
  const d = lerNumero(dias.value);
  if (t.erro || t.valor === null) return (erro.value = t.erro ?? 'Informe a tolerância (0 a 100 pontos).');
  if (!Number.isInteger(d) || d < 1 || d > 365) {
    return (erro.value = 'Prazo do alerta: número inteiro de dias, de 1 a 365.');
  }
  salvando.value = true;
  try {
    await api.salvarConfiguracao({ tolerancia_atraso_pontos: t.valor, dias_sem_atualizacao_alerta: d });
  } catch (e) {
    erro.value = mensagemDeFalhaAoGravar(e);
    salvando.value = false;
    return;
  }
  try {
    estado.config = await api.configuracao();
    avisar('Configuração salva. Mapa, lista e relatório já usam os novos valores.');
  } catch {
    avisar('Configuração salva, mas a tela não atualizou. Recarregue a página.', 'erro');
  } finally {
    salvando.value = false;
  }
}

const tem = (papel, permissao) => papel.codigo === 'secretario' || papel.permissoes.includes(permissao);
</script>

<template>
  <div class="config">
    <div class="barra-titulo"><h1>Configuração</h1></div>

    <form class="cartao config__form" @submit.prevent="salvar">
      <h2>Regra de situação</h2>
      <div class="grade">
        <label class="campo">
          <span>Tolerância de atraso (pontos percentuais)</span>
          <input v-model="tolerancia" type="text" inputmode="decimal" />
          <small class="ajuda">A obra fica "Atrasada" quando o executado está mais que isso abaixo do prazo decorrido.</small>
        </label>
        <label class="campo">
          <span>Alerta de obra sem atualização (dias)</span>
          <input v-model="dias" type="text" inputmode="numeric" />
          <small class="ajuda">Depois desse prazo sem lançamento, a obra mostra o aviso "sem atualização".</small>
        </label>
      </div>
      <p v-if="erro" class="caixa-erro" role="alert">{{ erro }}</p>
      <div><button class="btn btn--primario" :disabled="salvando">{{ salvando ? 'Salvando…' : 'Salvar' }}</button></div>
    </form>

    <p v-if="erroCarga" class="caixa-erro" role="alert">{{ erroCarga }}</p>

    <section class="cartao">
      <h2>Perfis e permissões</h2>
      <p class="mudo pequeno">
        No piloto, usuários são criados e têm o perfil alterado pela Concretta Jr no painel do Supabase.
        O perfil Secretário recebe automaticamente toda permissão nova.
      </p>
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th>Permissão</th>
              <th v-for="p in papeis" :key="p.codigo" class="centro">{{ ROTULO_PAPEL[p.codigo] ?? p.nome }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="perm in permissoes" :key="perm.codigo">
              <td>{{ perm.descricao }}</td>
              <td v-for="p in papeis" :key="p.codigo" class="centro">
                <span v-if="tem(p, perm.codigo)" aria-label="sim" style="color: var(--s-em-dia); font-weight: 700">✓</span>
                <span v-else aria-label="não" class="mudo">·</span>
              </td>
            </tr>
            <tr>
              <td>Consultar mapa, lista, fichas e relatório</td>
              <td v-for="p in papeis" :key="p.codigo" class="centro" style="color: var(--s-em-dia); font-weight: 700">✓</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="cartao">
      <h2>Usuários</h2>
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead><tr><th>Nome</th><th>Perfil</th><th>Situação</th></tr></thead>
          <tbody>
            <tr v-for="u in usuarios" :key="u.id">
              <td>{{ u.nome }}</td>
              <td>{{ ROTULO_PAPEL[u.papel] ?? u.papel }}</td>
              <td>{{ u.ativo ? 'Ativo' : 'Desativado' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="modoDemo" class="pequeno mudo">Na demonstração existem só os quatro usuários de exemplo.</p>
    </section>
  </div>
</template>

<style scoped>
.config {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.config__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.centro {
  text-align: center !important;
}
</style>
