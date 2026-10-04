<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, modoDemo } from '../api/index.js';
import { SENHA_DEMO } from '../api/demo_dados.js';
import { entrar, reiniciarDemonstracao } from '../estado.js';
import { telaInicial } from '../rotas.js';
import Marca from '../componentes/Marca.vue';

const roteador = useRouter();
const email = ref('');
const senha = ref('');
const erro = ref('');
const entrando = ref(false);

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
    <div class="entrar__cartao cartao">
      <div class="entrar__marca"><Marca variante="clara" grande /></div>
      <p class="entrar__sub">Secretaria Municipal de Infraestrutura e Serviços Públicos</p>

      <form class="entrar__form" @submit.prevent="enviar()">
        <label class="campo">
          <span>E-mail</span>
          <input v-model="email" type="email" autocomplete="username" inputmode="email" required />
        </label>
        <label class="campo">
          <span>Senha</span>
          <input v-model="senha" type="password" autocomplete="current-password" required />
        </label>
        <p v-if="erro" class="caixa-erro" role="alert">{{ erro }}</p>
        <button class="btn btn--primario btn--grande btn--bloco" :disabled="entrando">
          {{ entrando ? 'Entrando…' : 'Entrar' }}
        </button>
        <p class="pequeno mudo entrar__ajuda">Sem cadastro aberto. Para obter acesso, procure o gabinete da SINFRA.</p>
      </form>

      <section v-if="modoDemo" class="entrar__demo">
        <h2>Demonstração</h2>
        <p class="pequeno">
          Dados fictícios, guardados só neste navegador. Entre com um dos perfis para ver o que cada um pode fazer
          (senha <code>{{ SENHA_DEMO }}</code>).
        </p>
        <div class="entrar__perfis">
          <button v-for="u in api.usuariosDemo" :key="u.email" class="btn" :disabled="entrando" @click="entrarComo(u)">
            {{ u.rotulo }}
          </button>
        </div>
        <button class="btn btn--link entrar__reiniciar" type="button" @click="reiniciarDemonstracao">
          Reiniciar demonstração (apaga o que foi feito)
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
  padding: 24px 16px;
  background:
    linear-gradient(180deg, var(--azul) 0, var(--azul) 220px, transparent 220px),
    var(--fundo);
}
.entrar__cartao {
  width: 100%;
  max-width: 420px;
  padding: 28px 24px;
  border-top: 4px solid var(--amarelo-pmi);
}
.entrar__marca {
  display: flex;
  justify-content: center;
}
.entrar__sub {
  text-align: center;
  color: var(--texto-2);
  font-size: 0.85rem;
  margin: 8px 0 20px;
}
.entrar__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.entrar__ajuda {
  margin: 0;
  text-align: center;
}
.entrar__demo {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px dashed var(--borda-forte);
}
.entrar__demo h2 {
  font-size: 0.95rem;
  margin-bottom: 4px;
}
.entrar__demo p {
  margin: 0 0 10px;
  color: var(--texto-2);
}
.entrar__reiniciar {
  margin-top: 10px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--texto-2);
}
.entrar__perfis {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.entrar :deep(.campo input) {
  min-height: 46px;
}
</style>
