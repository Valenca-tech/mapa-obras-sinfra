<script setup>
// Somente o secretário: parâmetros da regra de situação, dados do papel
// timbrado e da assinatura dos documentos, e visão dos perfis.
import { ref, onMounted } from 'vue';
import { api, modoDemo } from '../api/index.js';
import { estado, avisar, ROTULO_PAPEL, mensagemDeFalhaAoGravar } from '../estado.js';
import { lerNumero, lerPercentual, pontos } from '../lib/formato.js';
import { Check } from 'lucide-vue-next';

const tolerancia = ref(pontos(estado.config.tolerancia_atraso_pontos));
const dias = ref(String(estado.config.dias_sem_atualizacao_alerta));
const erro = ref('');
const erroCarga = ref('');

// Papel timbrado e assinatura (documentos da Central de Obras).
const CAMPOS_ORGAO = [
  { campo: 'orgao_nome', rotulo: 'Nome do órgão', largo: true, obrigatorio: true },
  { campo: 'orgao_sigla', rotulo: 'Sigla', ajuda: 'Vai no número dos documentos: Nº 001/2026-SINFRA.', obrigatorio: true },
  { campo: 'prefeitura_cnpj', rotulo: 'CNPJ (do Município)' },
  { campo: 'orgao_endereco', rotulo: 'Endereço', largo: true },
  { campo: 'orgao_telefone', rotulo: 'Telefone' },
  { campo: 'orgao_email', rotulo: 'E-mail' },
];
const CAMPOS_SECRETARIO = [
  { campo: 'secretario_nome', rotulo: 'Nome do secretário', largo: true },
  { campo: 'secretario_cargo', rotulo: 'Cargo', largo: true, obrigatorio: true },
  { campo: 'secretario_ato', rotulo: 'Ato de nomeação', ajuda: 'Ex.: Portaria nº 12/2025-GAB (opcional).' },
  { campo: 'secretario_matricula', rotulo: 'Matrícula' },
];
const textos = () => Object.fromEntries([...CAMPOS_ORGAO, ...CAMPOS_SECRETARIO].map((c) => [c.campo, estado.config[c.campo] ?? '']));
const orgao = ref(textos());
const erroOrgao = ref('');
const salvandoOrgao = ref(false);

async function salvarOrgao() {
  if (salvandoOrgao.value) return;
  erroOrgao.value = '';
  const v = Object.fromEntries(Object.entries(orgao.value).map(([k, x]) => [k, String(x ?? '').trim() || null]));
  const falta = [...CAMPOS_ORGAO, ...CAMPOS_SECRETARIO].find((c) => c.obrigatorio && !v[c.campo]);
  if (falta) return (erroOrgao.value = `Preencha: ${falta.rotulo}.`);
  salvandoOrgao.value = true;
  try {
    await api.salvarConfiguracao(v);
    estado.config = await api.configuracao();
    orgao.value = textos();
    avisar('Dados do órgão e da assinatura salvos. Os próximos documentos já saem com eles.');
  } catch (e) {
    erroOrgao.value = mensagemDeFalhaAoGravar(e);
  } finally {
    salvandoOrgao.value = false;
  }
}
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
    <div class="pagina__cabecalho"><h1>Configuração</h1></div>

    <form class="painel config__form" @submit.prevent="salvar">
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

    <form class="painel config__form" @submit.prevent="salvarOrgao">
      <h2>Papel timbrado e assinatura dos documentos</h2>
      <p class="mudo pequeno">
        Saem no cabeçalho, no rodapé e na assinatura das declarações, atestados, fichas técnicas e planilhas emitidas
        pela Central de Obras. O fiscal de cada obra assina com o nome, título e registro cadastrados na obra.
      </p>
      <div class="grade">
        <label v-for="c in CAMPOS_ORGAO" :key="c.campo" :class="['campo', c.largo && 'largo']">
          <span>{{ c.rotulo }} <i v-if="c.obrigatorio" class="obrig">*</i></span>
          <input v-model="orgao[c.campo]" type="text" maxlength="200" />
          <small v-if="c.ajuda" class="ajuda">{{ c.ajuda }}</small>
        </label>
      </div>
      <h3>Secretário</h3>
      <div class="grade">
        <label v-for="c in CAMPOS_SECRETARIO" :key="c.campo" :class="['campo', c.largo && 'largo']">
          <span>{{ c.rotulo }} <i v-if="c.obrigatorio" class="obrig">*</i></span>
          <input v-model="orgao[c.campo]" type="text" maxlength="200" />
          <small v-if="c.ajuda" class="ajuda">{{ c.ajuda }}</small>
        </label>
      </div>
      <p v-if="erroOrgao" class="caixa-erro" role="alert">{{ erroOrgao }}</p>
      <div><button class="btn btn--primario" :disabled="salvandoOrgao">{{ salvandoOrgao ? 'Salvando…' : 'Salvar' }}</button></div>
    </form>

    <p v-if="erroCarga" class="caixa-erro" role="alert">{{ erroCarga }}</p>

    <section class="painel">
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
                <Check v-if="tem(p, perm.codigo)" class="icone config__sim" aria-label="sim" />
                <span v-else aria-label="não" class="mudo">·</span>
              </td>
            </tr>
            <tr>
              <td>Consultar mapa, lista, fichas e relatório</td>
              <td v-for="p in papeis" :key="p.codigo" class="centro"><Check class="icone config__sim" aria-label="sim" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="painel">
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
.config__form h2,
.config__form h3,
.config__form p {
  margin: 0;
}
.centro {
  text-align: center !important;
}
.config__sim {
  color: var(--ok);
  vertical-align: middle;
}
.config h2 {
  font-size: 1rem;
}
</style>
