<script setup>
import { useRoute } from 'vue-router';
import { estado, reiniciarDemonstracao } from './estado.js';
import { modoDemo } from './api/index.js';
import Cabecalho from './componentes/Cabecalho.vue';
import Rodape from './componentes/Rodape.vue';
import Aviso from './componentes/Aviso.vue';
import FichaObra from './componentes/FichaObra.vue';
import AcaoObra from './componentes/AcaoObra.vue';

const rota = useRoute();
const recarregar = () => location.reload();
</script>

<template>
  <div v-if="estado.erroInicial" class="conteudo">
    <div class="caixa-erro" role="alert">
      <strong>Não foi possível iniciar a ferramenta.</strong><br />
      {{ estado.erroInicial }}
      <p style="margin: 12px 0 0; display: flex; gap: 8px; flex-wrap: wrap">
        <button class="btn btn--primario" @click="recarregar">Recarregar página</button>
        <button v-if="modoDemo" class="btn" @click="reiniciarDemonstracao">Reiniciar demonstração</button>
      </p>
    </div>
  </div>
  <template v-else>
    <Cabecalho v-if="estado.sessao && !rota.meta.limpa" />
    <main :class="['conteudo', (rota.meta.cheia || rota.meta.limpa) && 'conteudo--cheia']">
      <!-- key pelo caminho: "Editar obra" -> "Nova obra" (mesmo componente) monta
           de novo, sem herdar o formulário; mudar só a busca (?obra=) não remonta -->
      <RouterView v-slot="{ Component, route }">
        <component :is="Component" :key="route.path" />
      </RouterView>
    </main>
    <Rodape v-if="!rota.meta.limpa || rota.path === '/entrar'" :compacto="!!rota.meta.cheia" />
    <FichaObra
      v-if="estado.obraAberta && estado.sessao && !rota.meta.limpa"
      :key="estado.obraAberta"
      :id="estado.obraAberta"
    />
    <AcaoObra v-if="estado.acao" :key="estado.acao.id" />
    <Aviso />
  </template>
</template>
