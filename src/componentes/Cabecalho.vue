<script setup>
// Cabeçalho (estilo A, azul institucional): marca da Prefeitura e da SINFRA à
// esquerda, navegação no meio, IFMA e usuário à direita, fita amarela e verde
// da Prefeitura embaixo. Abaixo de 1100 px vira menu de hambúrguer.
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { estado, pode, ROTULO_PAPEL, reiniciarDemonstracao } from '../estado.js';
import { sairDaConta } from '../rotas.js';
import { modoDemo } from '../api/index.js';
import Marca from './Marca.vue';

const rota = useRoute();
const menuAberto = ref(false); // celular
const usuarioAberto = ref(false); // computador
const caixaUsuario = ref(null);
const botaoUsuario = ref(null);
const menuUsuario = ref(null);
const botaoMenu = ref(null);
const menuPrincipal = ref(null);
const temIfma = ref(true);

// Ao abrir um menu, o foco vai para o primeiro item (teclado e leitor de tela
// chegam aos itens, que vêm antes do botão na página).
watch(usuarioAberto, async (aberto) => {
  if (!aberto) return;
  await nextTick();
  menuUsuario.value?.querySelector('a, button')?.focus();
});
watch(menuAberto, async (aberto) => {
  if (!aberto) return;
  await nextTick();
  menuPrincipal.value?.querySelector('a, button')?.focus();
});

watch(
  () => rota.fullPath,
  () => {
    menuAberto.value = false;
    usuarioAberto.value = false;
  },
);

const principais = computed(() =>
  [
    { para: '/mapa', rotulo: 'Mapa' },
    { para: '/lista', rotulo: 'Lista' },
    { para: '/atualizar', rotulo: 'Atualizar', permissao: 'percentual.lancar' },
    { para: '/pendencias', rotulo: 'Pendências' },
    { para: '/instalacoes', rotulo: 'Instalações' },
    { para: '/obras/nova', rotulo: 'Nova obra', permissao: 'obra.cadastrar' },
  ].filter((i) => !i.permissao || pode(i.permissao)),
);

const gestao = computed(() =>
  [
    { para: '/configuracao', rotulo: 'Configuração', permissao: 'configuracao.editar' },
    { para: '/auditoria', rotulo: 'Auditoria', permissao: 'auditoria.ver' },
  ].filter((i) => pode(i.permissao)),
);

const iniciais = computed(() => {
  const partes = (estado.perfil?.nome ?? '').replace(/\(.*\)/, '').trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
});
const primeiroNome = computed(() => (estado.perfil?.nome ?? '').split(/\s+/)[0]);

// Fecha o menu do usuário ao clicar fora ou apertar Esc (o foco volta ao botão).
const fora = (e) => {
  if (usuarioAberto.value && caixaUsuario.value && !caixaUsuario.value.contains(e.target)) usuarioAberto.value = false;
};
const esc = (e) => {
  if (e.key !== 'Escape') return;
  if (usuarioAberto.value) {
    usuarioAberto.value = false;
    botaoUsuario.value?.focus();
  }
  if (menuAberto.value) {
    menuAberto.value = false;
    botaoMenu.value?.focus();
  }
};
onMounted(() => {
  document.addEventListener('mousedown', fora);
  document.addEventListener('keydown', esc);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', fora);
  document.removeEventListener('keydown', esc);
});
</script>

<template>
  <header class="cabecalho">
    <div class="cabecalho__faixa">
      <RouterLink to="/" class="cabecalho__marca" aria-label="Mapa de Obras SINFRA, página inicial">
        <Marca variante="escura" />
      </RouterLink>

      <nav id="menu-principal" ref="menuPrincipal" :class="['cabecalho__nav', menuAberto && 'aberto']" aria-label="Principal">
        <RouterLink v-for="i in principais" :key="i.para" :to="i.para" class="cabecalho__link">{{ i.rotulo }}</RouterLink>

        <!-- só no celular: o que no computador fica no menu do usuário -->
        <div class="cabecalho__movel">
          <RouterLink v-for="i in gestao" :key="i.para" :to="i.para" class="cabecalho__link">{{ i.rotulo }}</RouterLink>
          <div class="cabecalho__movel-usuario">
            <span>
              <strong>{{ estado.perfil?.nome }}</strong>
              <small>{{ ROTULO_PAPEL[estado.perfil?.papel] }}</small>
            </span>
            <button v-if="modoDemo" class="btn btn--link cabecalho__acao" @click="reiniciarDemonstracao">Reiniciar demonstração</button>
            <button class="btn btn--link cabecalho__acao" @click="sairDaConta">Sair</button>
          </div>
          <span v-if="temIfma" class="cabecalho__ifma cabecalho__ifma--movel">
            <img :src="'marcas/ifma.png'" alt="IFMA Campus Imperatriz" @error="temIfma = false" />
          </span>
        </div>
      </nav>

      <div class="cabecalho__direita">
        <span v-if="modoDemo" class="cabecalho__demo" title="Dados fictícios, guardados só neste navegador">
          <span class="cabecalho__demo-longo">Demonstração</span><span class="cabecalho__demo-curto">Demo</span>
        </span>
        <span v-if="temIfma" class="cabecalho__ifma" title="Desenvolvido pelo IFMA Campus Imperatriz">
          <img :src="'marcas/ifma.png'" alt="IFMA Campus Imperatriz" @error="temIfma = false" />
        </span>

        <div ref="caixaUsuario" class="usuario">
          <button
            ref="botaoUsuario"
            class="usuario__botao"
            :aria-expanded="usuarioAberto"
            aria-controls="menu-usuario"
            @click="usuarioAberto = !usuarioAberto"
          >
            <span class="usuario__avatar" aria-hidden="true">{{ iniciais }}</span>
            <span class="usuario__nome">{{ primeiroNome }}</span>
            <span class="usuario__seta" aria-hidden="true">▾</span>
            <span class="oculto">Menu do usuário</span>
          </button>
          <div v-if="usuarioAberto" id="menu-usuario" ref="menuUsuario" class="usuario__menu">
            <div class="usuario__quem">
              <strong>{{ estado.perfil?.nome }}</strong>
              <small>{{ ROTULO_PAPEL[estado.perfil?.papel] }}</small>
            </div>
            <RouterLink v-for="i in gestao" :key="i.para" :to="i.para" class="usuario__item">{{ i.rotulo }}</RouterLink>
            <button v-if="modoDemo" class="usuario__item" @click="reiniciarDemonstracao">Reiniciar demonstração</button>
            <button class="usuario__item usuario__sair" @click="sairDaConta">Sair</button>
          </div>
        </div>

        <button
          ref="botaoMenu"
          class="cabecalho__hamburguer"
          :aria-expanded="menuAberto"
          aria-controls="menu-principal"
          @click="menuAberto = !menuAberto"
        >
          <span></span><span></span><span></span>
          <span class="oculto">Menu</span>
        </button>
      </div>
    </div>
    <div class="cabecalho__fita" aria-hidden="true"><i></i><i></i></div>
  </header>
</template>

<style scoped>
.cabecalho {
  background: var(--azul);
  color: #fff;
  position: sticky;
  top: 0;
  z-index: 1200; /* acima dos controles do Leaflet (1000), abaixo da ficha (1500) */
}
.cabecalho__faixa {
  display: flex;
  align-items: center;
  gap: 18px;
  height: calc(var(--altura-cabecalho) - 4px);
  padding: 0 16px;
}
.cabecalho__fita {
  display: flex;
  height: 4px;
}
.cabecalho__fita i:first-child {
  flex: 2;
  background: var(--amarelo-pmi);
}
.cabecalho__fita i:last-child {
  flex: 1;
  background: var(--verde-pmi);
}
.cabecalho__marca {
  color: #fff;
  text-decoration: none;
  flex-shrink: 0;
}
.cabecalho__nav {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-right: auto;
}
.cabecalho__link {
  color: #e3e9f8;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.92rem;
  padding: 8px 10px;
  border-radius: var(--raio-p);
  white-space: nowrap;
}
.cabecalho__link:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}
.cabecalho__link.router-link-active {
  background: #fff;
  color: var(--azul);
}
.cabecalho__movel {
  display: none;
}
.cabecalho__direita {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.cabecalho__demo-curto {
  display: none;
}
.cabecalho__demo {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #3d2c00;
  background: var(--amarelo-pmi);
  padding: 3px 9px;
  border-radius: 999px;
}
.cabecalho__ifma {
  display: inline-flex;
  background: #fff;
  border-radius: 6px;
  padding: 4px 8px;
}
.cabecalho__ifma img {
  height: 30px;
  width: auto;
  display: block;
}
.usuario {
  position: relative;
}
.usuario__botao {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: transparent;
  color: #fff;
  font: inherit;
  font-weight: 600;
  font-size: 0.9rem;
  padding: 4px 10px 4px 4px;
  border-radius: 999px;
  cursor: pointer;
  min-height: 40px;
}
.usuario__botao:hover {
  background: rgba(255, 255, 255, 0.12);
}
.usuario__avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #fff;
  color: var(--azul);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.8rem;
}
.usuario__seta {
  font-size: 0.75rem;
  opacity: 0.8;
}
.usuario__menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  min-width: 230px;
  background: var(--superficie);
  color: var(--texto);
  border: 1px solid var(--borda);
  border-radius: var(--raio);
  box-shadow: var(--sombra-alta);
  padding: 6px;
  display: flex;
  flex-direction: column;
}
.usuario__quem {
  display: flex;
  flex-direction: column;
  padding: 8px 10px 10px;
  border-bottom: 1px solid var(--borda);
  margin-bottom: 4px;
}
.usuario__quem small {
  color: var(--texto-2);
}
.usuario__item {
  display: block;
  text-align: left;
  min-height: 40px;
  border: none;
  background: none;
  font: inherit;
  font-size: 0.92rem;
  color: var(--texto);
  text-decoration: none;
  padding: 9px 10px;
  border-radius: var(--raio-p);
  cursor: pointer;
}
.usuario__item:hover {
  background: var(--azul-claro);
}
.usuario__sair {
  color: var(--s-atrasada);
}
.cabecalho__hamburguer {
  display: none;
  width: 44px;
  height: 44px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: var(--raio-p);
  background: transparent;
  cursor: pointer;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
}
.cabecalho__hamburguer span:not(.oculto) {
  display: block;
  width: 18px;
  height: 2px;
  background: #fff;
}
.cabecalho__acao {
  color: #fff;
}

@media (max-width: 1280px) {
  .cabecalho__ifma:not(.cabecalho__ifma--movel) {
    display: none;
  }
}
@media (max-width: 1100px) {
  .cabecalho__hamburguer {
    display: flex;
  }
  .usuario {
    display: none;
  }
  .cabecalho__nav {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    flex-direction: column;
    align-items: stretch;
    background: var(--azul);
    padding: 8px 12px 14px;
    border-bottom: 4px solid var(--amarelo-pmi);
    box-shadow: var(--sombra-alta);
    max-height: calc(100dvh - var(--altura-cabecalho));
    overflow-y: auto;
  }
  .cabecalho__nav.aberto {
    display: flex;
  }
  .cabecalho__link {
    padding: 12px;
    font-size: 1rem;
  }
  .cabecalho__movel {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cabecalho__movel-usuario {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.25);
  }
  .cabecalho__movel-usuario > span {
    display: flex;
    flex-direction: column;
    margin-right: auto;
    font-size: 0.9rem;
  }
  .cabecalho__movel-usuario small {
    color: #c9d4f0;
  }
  .cabecalho__ifma--movel {
    align-self: flex-start;
    margin-top: 12px;
  }
}
@media (max-width: 520px) {
  /* no celular o selo fica, abreviado: quem lança precisa saber que é treino */
  .cabecalho__demo-longo {
    display: none;
  }
  .cabecalho__demo-curto {
    display: inline;
  }
  .cabecalho__demo {
    padding: 3px 7px;
  }
  .cabecalho__faixa {
    gap: 10px;
    padding: 0 12px;
  }
}
</style>
