<script setup>
import { useRoute } from 'vue-router';
import { estado, reiniciarDemonstracao } from './estado.js';
import { modoDemo } from './api/index.js';
import MenuLateral from './componentes/MenuLateral.vue';
import Rodape from './componentes/Rodape.vue';
import Aviso from './componentes/Aviso.vue';
import AcaoObra from './componentes/AcaoObra.vue';

const rota = useRoute();
const recarregar = () => location.reload();
</script>

<template>
  <div v-if="estado.erroInicial" class="conteudo">
    <div class="caixa-erro" role="alert">
      <div>
        <strong>Não foi possível iniciar a ferramenta.</strong><br />
        {{ estado.erroInicial }}
        <p style="margin: 12px 0 0; display: flex; gap: 8px; flex-wrap: wrap">
          <button class="btn btn--primario" @click="recarregar">Recarregar página</button>
          <button v-if="modoDemo" class="btn" @click="reiniciarDemonstracao">Reiniciar demonstração</button>
        </p>
      </div>
    </div>
  </div>

  <!-- telas com menu (usuário dentro) -->
  <div v-else-if="estado.sessao && !rota.meta.limpa" :class="['app', estado.menuRecolhido && 'app--recolhido']">
    <MenuLateral />
    <div class="app__principal">
      <!-- key pelo caminho: "Editar obra" -> "Nova obra" (mesmo componente) monta
           de novo, sem herdar o formulário; mudar só a busca (?obra=) não remonta -->
      <main :class="['conteudo', rota.meta.cheia && 'conteudo--cheia']">
        <RouterView v-slot="{ Component, route }">
          <component :is="Component" :key="route.path" />
        </RouterView>
      </main>
    </div>
    <AcaoObra v-if="estado.acao" :key="estado.acao.id" />
    <Aviso />
  </div>

  <!-- entrada e relatório de impressão: sem menu -->
  <template v-else>
    <main class="tela-limpa">
      <RouterView v-slot="{ Component, route }">
        <component :is="Component" :key="route.path" />
      </RouterView>
    </main>
    <Rodape v-if="rota.path === '/entrar'" />
    <Aviso />
  </template>
</template>

<style>
.app__principal {
  margin-left: var(--largura-lateral);
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
.app--recolhido .app__principal {
  margin-left: var(--largura-lateral-recolhida);
}
.app__principal > main {
  flex: 1;
}
.app__principal > .conteudo--cheia {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100dvh;
}
@media (max-width: 959px) {
  .app__principal,
  .app--recolhido .app__principal {
    margin-left: 0;
    padding-top: var(--altura-topo-movel);
  }
  .app__principal > .conteudo--cheia {
    height: calc(100dvh - var(--altura-topo-movel));
  }
}
.tela-limpa {
  min-height: calc(100dvh - 60px);
}
</style>
