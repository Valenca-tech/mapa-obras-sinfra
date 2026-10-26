<script setup>
// Navegação principal: barra à esquerda, que recolhe para só os ícones
// (escolha guardada no aparelho). Abaixo de 960 px vira gaveta, aberta pelo
// botão da barra superior.
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import {
  Building2, ClipboardCheck, FileWarning, Landmark, Printer, Settings, History, LogOut, PanelLeftClose,
  PanelLeftOpen, Menu, X, RotateCcw,
} from 'lucide-vue-next';
import { estado, pode, ROTULO_PAPEL, reiniciarDemonstracao } from '../estado.js';
import { sairDaConta } from '../rotas.js';
import { modoDemo } from '../api/index.js';

const rota = useRoute();
const aberto = ref(false); // gaveta no celular
const gaveta = ref(null);
const botaoAbrir = ref(null);
const temPlaca = ref(true);

// No celular a barra vira gaveta e sempre mostra os nomes.
const consulta = typeof window !== 'undefined' ? window.matchMedia('(max-width: 959px)') : null;
const movel = ref(!!consulta?.matches);
const aoMudarTela = () => (movel.value = !!consulta?.matches);
const recolhida = computed(() => estado.menuRecolhido && !movel.value);

const pendencias = computed(() => estado.obras.reduce((s, o) => s + Number(o.pendencias_documentais || 0), 0));

const principais = computed(() =>
  [
    { para: '/obras', rotulo: 'Obras', icone: Building2 },
    { para: '/lancamentos', rotulo: 'Lançamentos', icone: ClipboardCheck, permissao: 'percentual.lancar' },
    { para: '/pendencias', rotulo: 'Pendências', icone: FileWarning, contador: pendencias.value },
    { para: '/instalacoes', rotulo: 'Instalações públicas', icone: Landmark },
    { para: '/relatorio', rotulo: 'Relatório', icone: Printer },
  ].filter((i) => !i.permissao || pode(i.permissao)),
);
const administracao = computed(() =>
  [
    { para: '/configuracao', rotulo: 'Configuração', icone: Settings, permissao: 'configuracao.editar' },
    { para: '/auditoria', rotulo: 'Auditoria', icone: History, permissao: 'auditoria.ver' },
  ].filter((i) => pode(i.permissao)),
);

// "Obras" fica marcada também na página da obra e no cadastro.
const atual = (para) => rota.path === para || rota.path.startsWith(`${para}/`);

const iniciais = computed(() => {
  const partes = (estado.perfil?.nome ?? '').replace(/\(.*\)/, '').trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
});

watch(
  () => rota.fullPath,
  () => (aberto.value = false),
);
watch(aberto, async (v) => {
  document.body.style.overflow = v ? 'hidden' : '';
  if (!v) return;
  await nextTick();
  gaveta.value?.querySelector('a, button')?.focus();
});
const aoTeclar = (e) => {
  if (e.key === 'Escape' && aberto.value) {
    aberto.value = false;
    botaoAbrir.value?.focus();
  }
};
onMounted(() => {
  document.addEventListener('keydown', aoTeclar);
  consulta?.addEventListener?.('change', aoMudarTela);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', aoTeclar);
  consulta?.removeEventListener?.('change', aoMudarTela);
  document.body.style.overflow = '';
});

const titulo = computed(() => {
  const todos = [...principais.value, ...administracao.value];
  return todos.find((i) => atual(i.para))?.rotulo ?? '';
});
</script>

<template>
  <!-- barra superior (só no celular e tablet) -->
  <header class="topo-movel">
    <button ref="botaoAbrir" type="button" class="btn btn--fantasma btn--icone" :aria-expanded="aberto" aria-controls="menu-lateral" @click="aberto = true">
      <Menu class="icone" aria-hidden="true" />
      <span class="oculto">Abrir menu</span>
    </button>
    <RouterLink to="/" class="topo-movel__marca">SINFRA</RouterLink>
    <span class="topo-movel__titulo">{{ titulo }}</span>
    <span v-if="modoDemo" class="etiqueta etiqueta--demo">Demonstração</span>
  </header>

  <div v-if="aberto" class="lateral__fundo" aria-hidden="true" @click="aberto = false"></div>

  <nav
    id="menu-lateral"
    ref="gaveta"
    :class="['lateral', recolhida && 'lateral--recolhida', aberto && 'lateral--aberta']"
    aria-label="Principal"
  >
    <div class="lateral__marca">
      <RouterLink to="/" class="lateral__inicio" :title="recolhida ? 'SINFRA, Mapa de Obras' : undefined">
        <img
          v-if="temPlaca && !recolhida"
          :src="'marcas/prefeitura.png'"
          alt="Prefeitura de Imperatriz"
          class="lateral__placa"
          @error="temPlaca = false"
        />
        <span class="lateral__palavra">{{ recolhida ? 'S' : 'SINFRA' }}</span>
      </RouterLink>
      <button type="button" class="btn btn--fantasma btn--icone lateral__fechar" @click="aberto = false">
        <X class="icone" aria-hidden="true" />
        <span class="oculto">Fechar menu</span>
      </button>
    </div>

    <div class="lateral__itens">
      <RouterLink
        v-for="i in principais"
        :key="i.para"
        :to="i.para"
        :class="['lateral__item', atual(i.para) && 'lateral__item--atual']"
        :aria-current="atual(i.para) ? 'page' : undefined"
        :title="recolhida ? i.rotulo : undefined"
      >
        <component :is="i.icone" class="icone" aria-hidden="true" />
        <span class="lateral__rotulo">{{ i.rotulo }}</span>
        <span v-if="i.contador" class="contador contador--alerta lateral__contador" :aria-label="`${i.contador} pendentes`">{{ i.contador }}</span>
      </RouterLink>

      <template v-if="administracao.length">
        <p class="lateral__grupo">Administração</p>
        <RouterLink
          v-for="i in administracao"
          :key="i.para"
          :to="i.para"
          :class="['lateral__item', atual(i.para) && 'lateral__item--atual']"
          :aria-current="atual(i.para) ? 'page' : undefined"
          :title="recolhida ? i.rotulo : undefined"
        >
          <component :is="i.icone" class="icone" aria-hidden="true" />
          <span class="lateral__rotulo">{{ i.rotulo }}</span>
        </RouterLink>
      </template>
    </div>

    <div class="lateral__rodape">
      <div v-if="modoDemo" class="lateral__demo">
        <span class="lateral__rotulo">Demonstração: dados fictícios neste navegador.</span>
        <button type="button" class="lateral__item lateral__item--pequeno" title="Reiniciar demonstração" @click="reiniciarDemonstracao">
          <RotateCcw class="icone" aria-hidden="true" />
          <span class="lateral__rotulo">Reiniciar demonstração</span>
        </button>
      </div>
      <div class="lateral__usuario" :title="recolhida ? `${estado.perfil?.nome} (${ROTULO_PAPEL[estado.perfil?.papel]})` : undefined">
        <span class="lateral__avatar" aria-hidden="true">{{ iniciais }}</span>
        <span class="lateral__rotulo lateral__quem">
          <strong>{{ estado.perfil?.nome }}</strong>
          <small>{{ ROTULO_PAPEL[estado.perfil?.papel] }}</small>
        </span>
      </div>
      <button type="button" class="lateral__item" title="Sair" @click="sairDaConta">
        <LogOut class="icone" aria-hidden="true" />
        <span class="lateral__rotulo">Sair</span>
      </button>
      <button
        type="button"
        class="lateral__item lateral__recolher"
        :title="recolhida ? 'Expandir menu' : 'Recolher menu'"
        :aria-label="estado.menuRecolhido ? 'Expandir menu' : 'Recolher menu'"
        @click="estado.menuRecolhido = !estado.menuRecolhido"
      >
        <component :is="estado.menuRecolhido ? PanelLeftOpen : PanelLeftClose" class="icone" aria-hidden="true" />
        <span class="lateral__rotulo">Recolher menu</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.lateral {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 1400; /* acima dos controles do Leaflet (1000) */
  width: var(--largura-lateral);
  display: flex;
  flex-direction: column;
  background: var(--superficie);
  border-right: 1px solid var(--borda);
}
.lateral--recolhida {
  width: var(--largura-lateral-recolhida);
}
.lateral__marca {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 56px;
  padding: 0 14px;
  border-bottom: 1px solid var(--borda);
}
.lateral--recolhida .lateral__marca {
  padding: 0;
  justify-content: center;
}
.lateral__inicio {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--azul);
  min-width: 0;
}
.lateral__placa {
  height: 28px;
  width: auto;
  display: block;
}
.lateral__palavra {
  font-family: 'Archivo Black', 'Arial Black', Arial, sans-serif;
  font-size: 1.05rem;
  letter-spacing: 0.02em;
  line-height: 1;
  padding-left: 10px;
  border-left: 1px solid var(--borda-forte);
}
.lateral--recolhida .lateral__palavra {
  padding-left: 0;
  border-left: none;
  font-size: 1.2rem;
}
.lateral__fechar {
  display: none;
}
.lateral__itens {
  flex: 1;
  overflow-y: auto;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.lateral__grupo {
  margin: 14px 10px 4px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--texto-3);
}
.lateral--recolhida .lateral__grupo {
  height: 1px;
  margin: 10px 6px;
  overflow: hidden;
  color: transparent;
  background: var(--borda);
}
.lateral__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 6px 10px;
  border: none;
  border-radius: var(--raio);
  background: none;
  font: inherit;
  font-size: 0.95rem;
  color: var(--texto);
  text-decoration: none;
  text-align: left;
  cursor: pointer;
}
.lateral__item .icone {
  width: 18px;
  height: 18px;
  color: var(--texto-2);
}
.lateral__item:hover {
  background: var(--superficie-2);
}
.lateral__item--atual {
  background: var(--azul-claro);
  color: var(--azul);
  font-weight: 500;
}
.lateral__item--atual .icone {
  color: var(--azul);
}
.lateral__item--pequeno {
  font-size: 0.86rem;
  min-height: 30px;
  color: var(--texto-2);
}
.lateral__contador {
  margin-left: auto;
}
.lateral--recolhida .lateral__item {
  justify-content: center;
  padding: 6px;
  position: relative;
}
.lateral--recolhida .lateral__rotulo {
  display: none;
}
.lateral--recolhida .lateral__contador {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 15px;
  font-size: 0.7rem;
  padding: 0 3px;
}
.lateral__rodape {
  border-top: 1px solid var(--borda);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.lateral__demo {
  padding: 6px 10px 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--borda);
  font-size: 0.82rem;
  color: var(--texto-3);
}
.lateral__demo .lateral__item {
  padding: 4px 0;
}
.lateral--recolhida .lateral__demo {
  padding: 0 0 6px;
}
.lateral--recolhida .lateral__demo .lateral__item {
  justify-content: center;
}
.lateral__usuario {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
}
.lateral--recolhida .lateral__usuario {
  justify-content: center;
  padding: 6px 0;
}
.lateral__avatar {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--azul-claro);
  color: var(--azul);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  font-weight: 600;
}
.lateral__quem {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}
.lateral__quem strong {
  font-weight: 500;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lateral__quem small {
  color: var(--texto-3);
  font-size: 0.8rem;
}

/* barra superior: só no celular e tablet */
.topo-movel {
  display: none;
}

@media (max-width: 959px) {
  .topo-movel {
    position: fixed;
    inset: 0 0 auto 0;
    z-index: 1300;
    height: var(--altura-topo-movel);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    background: var(--superficie);
    border-bottom: 1px solid var(--borda);
  }
  .topo-movel__marca {
    font-family: 'Archivo Black', 'Arial Black', Arial, sans-serif;
    font-size: 1rem;
    color: var(--azul);
    text-decoration: none;
    padding-right: 10px;
    border-right: 1px solid var(--borda-forte);
  }
  .topo-movel__titulo {
    flex: 1;
    min-width: 0;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lateral,
  .lateral--recolhida {
    width: min(300px, 86vw);
    transform: translateX(-100%);
    transition: transform 0.18s ease-out;
    box-shadow: var(--sombra-alta);
  }
  .lateral--aberta {
    transform: none;
  }
  .lateral__fechar {
    display: inline-flex;
  }
  .lateral__recolher {
    display: none;
  }
  .lateral__item {
    min-height: 44px;
  }
  .lateral__fundo {
    position: fixed;
    inset: 0;
    z-index: 1350;
    background: rgba(16, 24, 40, 0.4);
  }
}
@media (prefers-reduced-motion: reduce) {
  .lateral {
    transition: none !important;
  }
}
</style>
