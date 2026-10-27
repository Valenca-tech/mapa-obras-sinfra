<script setup>
// Capa de entrada: aparece ao abrir o endereço da ferramenta (uma vez por
// visita). Metade azul com a marca e os números; metade clara com as telas da
// ferramenta em carrossel; botão "Iniciar".
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowRight, Landmark, FileText, Smartphone } from 'lucide-vue-next';
import { estado } from '../estado.js';
import { telaInicial, marcarCapaVista } from '../rotas.js';

const rota = useRoute();
const roteador = useRouter();
const temPlaca = ref(true);

// Imagens em public/capa/ (telas da demonstração, dados fictícios).
const TELAS = [
  { arquivo: 'capa/painel.jpg', numero: '01', titulo: 'Painel de gestão', detalhe: 'situação das obras e alertas' },
  { arquivo: 'capa/mapa.jpg', numero: '02', titulo: 'Mapa das obras', detalhe: 'obras, trechos e prédios públicos' },
  { arquivo: 'capa/obra.jpg', numero: '03', titulo: 'Página da obra', detalhe: 'contrato, prazos e histórico' },
  { arquivo: 'capa/documentos.jpg', numero: '04', titulo: 'Documentos oficiais', detalhe: 'declaração, atestado e planilha' },
];
const atual = ref(0);
const tela = computed(() => TELAS[atual.value]);
let relogio;
const proxima = () => (atual.value = (atual.value + 1) % TELAS.length);
function irPara(i) {
  atual.value = i;
  clearInterval(relogio);
  relogio = setInterval(proxima, 5000);
}
onMounted(() => {
  if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) relogio = setInterval(proxima, 5000);
});
onBeforeUnmount(() => clearInterval(relogio));

function iniciar() {
  marcarCapaVista();
  const depois = typeof rota.query.depois === 'string' && rota.query.depois.startsWith('/') ? rota.query.depois : null;
  if (!estado.sessao) roteador.replace('/entrar');
  else roteador.replace(depois && depois !== '/capa' ? depois : telaInicial());
}
</script>

<template>
  <div class="capa">
    <!-- metade azul -->
    <section class="capa__azul">
      <svg class="capa__linhas" viewBox="0 0 800 900" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="150" x2="160" y2="0" />
        <line x1="760" y1="590" x2="700" y2="760" class="capa__linha-forte" />
        <!-- treliça no pé -->
        <g class="capa__trelica">
          <polyline points="30,820 90,760 150,820 210,760 270,820 330,760 390,820 450,760 510,820 570,760 630,820" />
          <line x1="30" y1="820" x2="630" y2="820" />
          <line x1="90" y1="760" x2="570" y2="760" />
          <line x1="90" y1="760" x2="90" y2="900" />
          <line x1="210" y1="760" x2="210" y2="900" />
          <line x1="330" y1="760" x2="330" y2="900" />
          <line x1="450" y1="760" x2="450" y2="900" />
          <line x1="570" y1="760" x2="570" y2="900" />
        </g>
      </svg>

      <header class="capa__marca">
        <img v-if="temPlaca" :src="'marcas/prefeitura.png'" alt="Prefeitura de Imperatriz" @error="temPlaca = false" />
        <span class="capa__orgao">Secretaria Municipal de<br />Infraestrutura e Serviços Públicos</span>
      </header>

      <div class="capa__texto">
        <h1 class="capa__titulo"><span>SINFRA</span><span class="capa__titulo-azul">obras</span></h1>
        <p class="capa__faixa"><i aria-hidden="true"></i>Gestão de obras públicas <b aria-hidden="true">•</b> Imperatriz-MA</p>
        <p class="capa__descricao">
          A central de acompanhamento das obras da Prefeitura: situação, prazos, contratos, serviços e documentos num só lugar.
        </p>
      </div>

      <ul class="capa__numeros">
        <li>
          <Landmark class="icone" aria-hidden="true" />
          <strong>270</strong>
          <span>prédios e espaços<br />públicos no mapa</span>
        </li>
        <li>
          <FileText class="icone" aria-hidden="true" />
          <strong>4</strong>
          <span>documentos oficiais<br />no papel timbrado</span>
        </li>
        <li>
          <Smartphone class="icone" aria-hidden="true" />
          <strong>Campo</strong>
          <span>lançamento do fiscal<br />pelo celular</span>
        </li>
      </ul>
    </section>

    <!-- metade clara -->
    <section class="capa__clara">
      <svg class="capa__linhas capa__linhas--clara" viewBox="0 0 800 900" preserveAspectRatio="none" aria-hidden="true">
        <line x1="800" y1="150" x2="560" y2="330" />
        <line x1="800" y1="760" x2="640" y2="900" class="capa__linha-forte" />
      </svg>
      <span class="capa__sinfra" aria-hidden="true">SINFRA</span>

      <div class="capa__vitrine">
        <div class="capa__janela" aria-hidden="true">
          <div class="capa__janela-barra"><i></i><i></i><i></i></div>
          <Transition name="troca" mode="out-in">
            <img :key="tela.arquivo" :src="tela.arquivo" :alt="tela.titulo" />
          </Transition>
        </div>
        <p class="capa__rotulo">Telas da ferramenta</p>
        <p class="capa__legenda" aria-live="polite">
          <span class="capa__numero">{{ tela.numero }}</span>
          <strong>{{ tela.titulo }}</strong><span class="capa__detalhe">&nbsp;·&nbsp;{{ tela.detalhe }}</span>
        </p>
        <div class="capa__pontos" role="tablist" aria-label="Telas">
          <button
            v-for="(t, i) in TELAS"
            :key="t.arquivo"
            type="button"
            role="tab"
            :aria-selected="i === atual"
            :aria-label="t.titulo"
            :class="i === atual && 'ativo'"
            @click="irPara(i)"
          ></button>
        </div>
      </div>

      <button type="button" class="capa__iniciar" @click="iniciar">
        Iniciar <ArrowRight class="icone" aria-hidden="true" />
      </button>
      <p class="capa__credito">Piloto IFMA Campus Imperatriz · LAEST e Concretta Jr</p>
    </section>
  </div>
</template>

<style scoped>
.capa {
  --capa-azul: #0b1f44;
  --capa-azul-2: #12306b;
  --capa-claro: #3fa3ec;
  position: relative;
  min-height: 100dvh;
  display: grid;
  grid-template-columns: 55% 45%;
  overflow: hidden;
  background: #eef1f6;
  font-family: var(--fonte);
}
.capa__azul {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  padding: 6vh 6vw 5vh;
  color: #fff;
  background: linear-gradient(160deg, var(--capa-azul-2) 0%, var(--capa-azul) 55%, #081734 100%);
  /* corte diagonal, como no modelo */
  clip-path: polygon(0 0, 100% 0, 78% 100%, 0 100%);
  margin-right: -12%;
}
.capa__linhas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.capa__linhas line,
.capa__linhas polyline {
  stroke: rgba(63, 163, 236, 0.45);
  stroke-width: 1.2;
  fill: none;
  vector-effect: non-scaling-stroke;
}
.capa__linha-forte {
  stroke: var(--capa-claro) !important;
  stroke-width: 3 !important;
}
.capa__trelica polyline,
.capa__trelica line {
  stroke: rgba(255, 255, 255, 0.07) !important;
}
.capa__marca {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
}
.capa__marca img {
  height: 52px;
  width: auto;
}
.capa__orgao {
  padding-left: 18px;
  border-left: 1px solid rgba(255, 255, 255, 0.25);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8fc8f5;
  line-height: 1.6;
}
.capa__texto {
  position: relative;
  margin: auto 0;
  padding: 4vh 0;
}
.capa__titulo {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  font-family: 'Archivo Black', 'Arial Black', Arial, sans-serif;
  font-weight: 400;
  font-size: clamp(3rem, 6.2vw, 6.2rem);
  line-height: 0.95;
  letter-spacing: -0.02em;
  color: #fff;
}
.capa__titulo-azul {
  color: var(--capa-claro);
}
.capa__faixa {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 2.6vh 0 2vh;
  font-size: 0.92rem;
  font-weight: 600;
  letter-spacing: 0.32em;
  text-transform: uppercase;
}
.capa__faixa i {
  width: 52px;
  height: 3px;
  background: var(--capa-claro);
  flex-shrink: 0;
}
.capa__faixa b {
  color: var(--capa-claro);
}
.capa__descricao {
  margin: 0;
  max-width: 440px;
  font-size: 1.08rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.85);
}
.capa__numeros {
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 0;
  max-width: 640px;
}
.capa__numeros li {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 12px;
  padding: 0 22px;
}
.capa__numeros li:first-child {
  padding-left: 0;
}
.capa__numeros li + li {
  border-left: 1px solid rgba(255, 255, 255, 0.18);
}
.capa__numeros .icone {
  grid-row: 1;
  width: 28px;
  height: 28px;
  color: var(--capa-claro);
  stroke-width: 1.5;
  margin-top: 4px;
}
.capa__numeros strong {
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.1;
}
.capa__numeros span {
  grid-column: 2;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.35;
}

.capa__clara {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6vh 4vw 5vh 8vw;
}
.capa__linhas--clara line {
  stroke: rgba(63, 163, 236, 0.55);
}
.capa__sinfra {
  position: absolute;
  top: 5vh;
  right: 4vw;
  font-family: 'Archivo Black', 'Arial Black', Arial, sans-serif;
  font-size: 1.5rem;
  color: var(--capa-azul);
  letter-spacing: 0.02em;
}
.capa__vitrine {
  width: 100%;
  max-width: 620px;
  display: flex;
  flex-direction: column;
}
.capa__janela {
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  box-shadow:
    0 30px 60px -20px rgba(11, 31, 68, 0.45),
    0 0 0 1px rgba(11, 31, 68, 0.08);
  transform: perspective(1400px) rotateY(-8deg) rotateX(3deg);
  transform-origin: center;
}
.capa__janela-barra {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  background: #e3e7ee;
}
.capa__janela-barra i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #c3c9d3;
}
.capa__janela img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  object-position: top left;
}
.capa__rotulo {
  margin: 5vh 0 10px;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #5b6b82;
}
.capa__legenda {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 0;
  margin: 0;
  font-size: 1.15rem;
  color: var(--capa-azul);
}
.capa__numero {
  display: inline-block;
  margin-right: 14px;
  padding: 3px 10px;
  border-radius: 6px;
  background: var(--capa-azul);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
}
.capa__legenda strong {
  font-weight: 600;
}
.capa__detalhe {
  color: #5b6b82;
}
.capa__pontos {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
.capa__pontos button {
  width: 9px;
  height: 9px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: #c9d1dd;
  cursor: pointer;
  transition: width 0.2s, background 0.2s;
}
.capa__pontos button.ativo {
  width: 28px;
  background: var(--capa-claro);
}
.capa__iniciar {
  position: absolute;
  right: 3vw;
  bottom: 6vh;
  display: inline-flex;
  align-items: center;
  gap: 14px;
  padding: 16px 64px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(180deg, #17346f, var(--capa-azul));
  color: #fff;
  font: inherit;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow:
    0 0 0 4px #eef1f6,
    0 0 0 6px var(--capa-claro),
    0 14px 30px -10px rgba(11, 31, 68, 0.6);
}
.capa__iniciar:hover {
  background: linear-gradient(180deg, #1d3f86, #10295a);
}
.capa__iniciar:focus-visible {
  outline: 3px solid var(--capa-azul);
  outline-offset: 8px;
}
.capa__iniciar .icone {
  width: 20px;
  height: 20px;
}
.capa__credito {
  position: absolute;
  left: 8vw;
  bottom: 2vh;
  margin: 0;
  font-size: 0.78rem;
  color: #7a879a;
}
.troca-enter-active,
.troca-leave-active {
  transition: opacity 0.35s;
}
.troca-enter-from,
.troca-leave-to {
  opacity: 0;
}

@media (max-width: 960px) {
  .capa {
    grid-template-columns: 1fr;
  }
  .capa__azul {
    clip-path: polygon(0 0, 100% 0, 100% 92%, 0 100%);
    margin-right: 0;
    padding: 28px 22px 48px;
    min-height: auto;
  }
  .capa__texto {
    padding: 36px 0 28px;
  }
  .capa__numeros {
    flex-wrap: wrap;
    gap: 16px 0;
  }
  .capa__numeros li {
    padding: 0 16px;
  }
  .capa__faixa {
    flex-wrap: wrap;
    letter-spacing: 0.14em;
    font-size: 0.78rem;
  }
  .capa__faixa b {
    display: none;
  }
  .capa__clara {
    padding: 28px 22px 120px;
  }
  .capa__sinfra {
    display: none;
  }
  .capa__janela {
    transform: none;
  }
  .capa__rotulo {
    margin-top: 24px;
  }
  .capa__iniciar {
    left: 22px;
    right: 22px;
    bottom: 44px;
    justify-content: center;
  }
  .capa__credito {
    left: 22px;
    bottom: 14px;
  }
}
@media (max-width: 520px) {
  .capa__numeros li {
    flex: 1 1 100%;
    padding: 0;
    border-left: none !important;
  }
  .capa__marca img {
    height: 40px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .troca-enter-active,
  .troca-leave-active {
    transition: none;
  }
}
</style>
