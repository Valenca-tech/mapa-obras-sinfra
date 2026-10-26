<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, modoDemo } from '../api/index.js';
import { SENHA_DEMO } from '../api/demo_dados.js';
import { entrar, reiniciarDemonstracao } from '../estado.js';
import { telaInicial } from '../rotas.js';

const roteador = useRouter();
const email = ref('');
const senha = ref('');
const erro = ref('');
const entrando = ref(false);
const temPlaca = ref(true);

async function enviar(e = email.value, s = senha.value) {
  if (entrando.value) return;
  erro.value = '';
  if (!e.trim() || !s) {
    erro.value = 'Informe e-mail e senha.';
    return;
  }
  entrando.value = true;
  try {
    await entrar(e, s);
    roteador.replace(telaInicial());
  } catch (x) {
    erro.value = x.message;
  } finally {
    entrando.value = false;
  }
}

const entrarComo = (u) => enviar(u.email, SENHA_DEMO);
</script>

<template>
  <div class="entrar">
    <div class="entrar__caixa">
      <header class="entrar__marca">
        <img v-if="temPlaca" :src="'marcas/prefeitura.png'" alt="Prefeitura de Imperatriz" @error="temPlaca = false" />
        <div>
          <strong>SINFRA</strong>
          <span>Mapa de Obras</span>
        </div>
      </header>
      <p class="entrar__orgao">Secretaria Municipal de Infraestrutura e Serviços Públicos</p>

      <form class="entrar__form" @submit.prevent="enviar()">
        <h1>Entrar</h1>
        <label class="campo">
          <span>E-mail</span>
          <input v-model="email" type="email" autocomplete="username" inputmode="email" required />
        </label>
        <label class="campo">
          <span>Senha</span>
          <input v-model="senha" type="password" autocomplete="current-password" required />
        </label>
        <p v-if="erro" class="caixa-erro" role="alert">{{ erro }}</p>
        <button class="btn btn--primario btn--bloco entrar__enviar" :disabled="entrando">
          {{ entrando ? 'Entrando…' : 'Entrar' }}
        </button>
        <p class="entrar__ajuda">Para obter acesso, procure o gabinete da SINFRA.</p>
      </form>

      <section v-if="modoDemo" class="entrar__demo" aria-labelledby="titulo-demo">
        <h2 id="titulo-demo">Demonstração</h2>
        <p>Dados fictícios, guardados só neste navegador. Escolha um perfil (senha <code>{{ SENHA_DEMO }}</code>).</p>
        <div class="entrar__perfis">
          <button v-for="u in api.usuariosDemo" :key="u.email" type="button" class="btn" :disabled="entrando" @click="entrarComo(u)">
            {{ u.rotulo }}
          </button>
        </div>
        <button class="btn btn--link entrar__reiniciar" type="button" @click="reiniciarDemonstracao">
          Reiniciar demonstração
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.entrar {
  min-height: calc(100dvh - 60px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px 16px;
}
.entrar__caixa {
  width: 100%;
  max-width: 380px;
}
.entrar__marca {
  display: flex;
  align-items: center;
  gap: 12px;
}
.entrar__marca img {
  height: 40px;
  width: auto;
}
.entrar__marca div {
  display: flex;
  flex-direction: column;
  padding-left: 12px;
  border-left: 1px solid var(--borda-forte);
  line-height: 1.1;
}
.entrar__marca strong {
  font-family: 'Archivo Black', 'Arial Black', Arial, sans-serif;
  font-weight: 400;
  font-size: 1.35rem;
  color: var(--azul);
  letter-spacing: 0.02em;
}
.entrar__marca span {
  font-size: 0.84rem;
  color: var(--texto-2);
}
.entrar__orgao {
  margin: 10px 0 24px;
  color: var(--texto-2);
  font-size: 0.9rem;
}
.entrar__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px;
  background: var(--superficie);
  border: 1px solid var(--borda);
  border-radius: var(--raio);
}
.entrar__form h1 {
  margin: 0;
  font-size: 1.15rem;
}
.entrar__enviar {
  min-height: 40px;
}
.entrar__ajuda {
  margin: 0;
  font-size: 0.86rem;
  color: var(--texto-3);
}
.entrar__demo {
  margin-top: 20px;
  padding: 16px 0 0;
  border-top: 1px solid var(--borda);
}
.entrar__demo h2 {
  font-size: 0.95rem;
  margin-bottom: 4px;
}
.entrar__demo p {
  margin: 0 0 10px;
  color: var(--texto-2);
  font-size: 0.9rem;
}
.entrar__perfis {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.entrar__reiniciar {
  margin-top: 10px;
  font-size: 0.86rem;
  color: var(--texto-2);
}
</style>
