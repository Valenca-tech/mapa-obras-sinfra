<script setup>
// Relatório A4 para o prefeito: todas as obras ativas, atrasadas no topo.
// Ignora os filtros da tela: é sempre o retrato completo.
import { ref, computed, onMounted } from 'vue';
import { estado, obrasComSituacao, recarregarObras, totais, nomeTipo } from '../estado.js';
import { LISTA_SITUACOES, compararParaRelatorio, textoSemAtualizacao } from '../lib/situacao.js';
import { data, dataHora, pct, reais, pontos } from '../lib/formato.js';
import { modoDemo } from '../api/index.js';
import { comprimentoTrecho, formatarExtensao } from '../lib/geo.js';

// O relatório vai para o prefeito: sem dados atualizados agora, não imprime
// (sairia com a data de hoje e percentuais antigos).
const carregando = ref(true);
const erro = ref('');
const geradoEm = ref(null);

async function carregar() {
  carregando.value = true;
  erro.value = '';
  try {
    await recarregarObras();
    geradoEm.value = new Date();
  } catch (e) {
    erro.value = e.message;
  } finally {
    carregando.value = false;
  }
}
onMounted(carregar);

const obras = computed(() => [...obrasComSituacao.value].sort(compararParaRelatorio));
const t = computed(() => totais(obrasComSituacao.value));
const gerado = computed(() => (geradoEm.value ? dataHora(geradoEm.value) : ''));
const podeImprimir = computed(() => !carregando.value && !erro.value);
const imprimir = () => podeImprimir.value && window.print();

// Faixa de dados fictícios pelos dados (obra de demonstração carregada para
// treino em produção também conta), não só pelo modo.
const temFicticias = computed(() => modoDemo || obras.value.some((o) => o.demo));

function observacao(o) {
  const s = o.situacao;
  const partes = [];
  if (s.motivoAtraso === 'prazo_vencido') partes.push(`Prazo vencido há ${-s.diasParaTermino} dias`);
  if (s.motivoAtraso === 'desvio') partes.push(`${pontos(s.desvio)} pontos abaixo do prazo`);
  if (o.paralisada) partes.push(`Paralisada desde ${data(o.paralisada_desde)}`);
  if (o.prorrogada) partes.push(`Prorrogada (orig. ${data(o.data_termino_original)})`);
  if (s.alertaSemAtualizacao) partes.push(textoSemAtualizacao(s));
  if (o.pendencias_documentais > 0) partes.push('Documento pendente');
  return partes.join('; ');
}
</script>

<template>
  <div class="relatorio-tela">
    <div class="relatorio-barra nao-imprimir">
      <RouterLink to="/mapa" class="btn">← Voltar</RouterLink>
      <span class="mudo pequeno">Confira a prévia e use Imprimir (A4 retrato). Para PDF, escolha "Salvar como PDF".</span>
      <button class="btn btn--primario" :disabled="!podeImprimir" @click="imprimir">
        {{ carregando ? 'Atualizando…' : 'Imprimir' }}
      </button>
    </div>
    <div v-if="erro" class="relatorio-erro nao-imprimir" role="alert">
      <span>Não foi possível atualizar os dados ({{ erro }}). O relatório não pode ser impresso com dados antigos.</span>
      <button class="btn" @click="carregar">Tentar de novo</button>
    </div>

    <!-- sem dados atualizados, nada sai no papel (nem pelo Ctrl+P) -->
    <article :class="['folha', !podeImprimir && 'folha--sem-impressao']">
      <header class="folha__topo">
        <img :src="'marcas/prefeitura.png'" alt="Prefeitura de Imperatriz" class="folha__placa" @error="(e) => (e.target.style.display = 'none')" />
        <div class="folha__titulo">
          <p class="folha__orgao">Prefeitura Municipal de Imperatriz · Secretaria Municipal de Infraestrutura e Serviços Públicos</p>
          <h1>SINFRA: Obras ativas em {{ data(estado.hoje) }}</h1>
        </div>
        <p v-if="temFicticias" class="folha__demo">{{ modoDemo ? 'DADOS FICTÍCIOS DE DEMONSTRAÇÃO' : 'CONTÉM OBRAS FICTÍCIAS (TREINO)' }}</p>
      </header>

      <section class="folha__totais">
        <div><strong>{{ t.ativas }}</strong><span>obras ativas</span></div>
        <div v-for="s in LISTA_SITUACOES" :key="s.codigo" :style="{ '--cor': s.hex }">
          <strong>{{ t[s.codigo] ?? 0 }}</strong><span>{{ s.rotulo.toLowerCase() }}</span>
        </div>
        <div class="folha__valor"><strong>{{ reais(t.valor) }}</strong><span>valor contratado</span></div>
      </section>

      <table class="folha__tabela">
        <thead>
          <tr>
            <th>Obra</th>
            <th>Situação</th>
            <th class="direita">Exec.</th>
            <th class="direita">Prazo</th>
            <th>Término</th>
            <th class="direita">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in obras" :key="o.id" :class="`linha--${o.situacao.codigo}`">
            <td>
              <strong>{{ o.nome }}</strong>
              <span v-if="o.demo && !modoDemo" class="folha__ficticia">FICTÍCIA</span>
              <span class="folha__sub">{{ nomeTipo(o.tipo) }} · {{ o.bairro }}<template v-if="o.trecho"> · trecho de {{ formatarExtensao(comprimentoTrecho(o.trecho)) }}</template><template v-if="o.empresa"> · {{ o.empresa }}</template></span>
              <span v-if="observacao(o)" class="folha__obs">{{ observacao(o) }}</span>
            </td>
            <td class="folha__situacao" :style="{ '--cor': o.situacao.hex, '--tx': o.situacao.texto }">
              <span>{{ o.situacao.simbolo }}</span> {{ o.situacao.rotulo }}
            </td>
            <td class="direita num">{{ pct(o.situacao.executado) }}</td>
            <td class="direita num">{{ pct(o.situacao.prazoDecorrido) }}</td>
            <td class="num">{{ data(o.data_termino_prevista) }}</td>
            <td class="direita num">{{ reais(o.valor_contrato) || '—' }}</td>
          </tr>
          <tr v-if="!obras.length">
            <td colspan="6">Nenhuma obra ativa.</td>
          </tr>
        </tbody>
      </table>

      <footer class="folha__rodape">
        <p>
          <strong>Critério:</strong> atrasada quando o prazo venceu sem conclusão ou quando o executado está mais de
          {{ pontos(estado.config.tolerancia_atraso_pontos) }} pontos abaixo do prazo decorrido (proporção linear entre início e término vigente).
          Situação calculada automaticamente; não é digitada.
        </p>
        <p>
          Gerado em {{ gerado }} por {{ estado.perfil?.nome }} · Mapa de Obras SINFRA · Piloto desenvolvido pelo IFMA Campus Imperatriz
        </p>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.relatorio-tela {
  background: #e9ecf1;
  min-height: 100dvh;
  padding: 0 0 32px;
}
.relatorio-barra {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 16px;
  background: var(--superficie);
  border-bottom: 1px solid var(--borda);
}
.folha {
  background: #fff;
  width: 210mm;
  min-height: 297mm;
  margin: 20px auto;
  padding: 12mm 12mm 10mm;
  box-shadow: var(--sombra-alta);
  color: #111;
  font-size: 9pt;
  line-height: 1.3;
}
.folha__topo {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  border-bottom: 2.5pt solid var(--azul);
  padding-bottom: 3mm;
  margin-bottom: 4mm;
}
.folha__orgao {
  margin: 0 0 1mm;
  font-size: 8pt;
  color: #444;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.folha h1 {
  margin: 0;
  font-size: 15pt;
  color: var(--azul-escuro);
}
.folha__demo {
  margin: 0;
  font-size: 7.5pt;
  font-weight: 700;
  color: #7a5a00;
  border: 1pt solid var(--dourado);
  padding: 1mm 2mm;
  white-space: nowrap;
}
.folha__totais {
  display: flex;
  gap: 2mm;
  margin-bottom: 4mm;
}
.folha__totais > div {
  flex: 1;
  border: 0.75pt solid #c8ced8;
  border-top: 2.5pt solid var(--cor, var(--azul));
  padding: 1.5mm 2mm;
  display: flex;
  flex-direction: column;
}
.folha__totais strong {
  font-size: 12pt;
}
.folha__totais span {
  font-size: 7pt;
  color: #555;
}
.folha__valor {
  flex: 1.6 !important;
  --cor: var(--dourado);
}
.folha__tabela {
  width: 100%;
  border-collapse: collapse;
}
.folha__tabela th {
  text-align: left;
  font-size: 7.5pt;
  text-transform: uppercase;
  color: #444;
  border-bottom: 1pt solid #333;
  padding: 1.2mm 1.5mm;
}
.folha__tabela td {
  padding: 1.5mm;
  border-bottom: 0.5pt solid #d0d5dd;
  vertical-align: top;
}
.folha__tabela tr {
  page-break-inside: avoid;
  break-inside: avoid;
}
.folha__tabela .direita {
  text-align: right;
}
.folha__sub,
.folha__obs {
  display: block;
  font-size: 7.5pt;
  color: #555;
}
.folha__obs {
  color: #8e1c1c;
}
.folha__ficticia {
  display: inline-block;
  margin-left: 1.5mm;
  font-size: 6.5pt;
  font-weight: 700;
  color: #7a5a00;
  border: 0.75pt solid var(--dourado);
  padding: 0 1mm;
}
.relatorio-erro {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 12px auto 0;
  max-width: 210mm;
  padding: 10px 12px;
  background: var(--erro-fundo);
  border: 1px solid #f1bcbc;
  color: #8e1c1c;
  border-radius: var(--raio-p);
}
.linha--em_dia .folha__obs,
.linha--concluida .folha__obs,
.linha--nao_iniciada .folha__obs {
  color: #555;
}
.folha__situacao {
  white-space: nowrap;
  font-weight: 700;
  color: var(--tx);
}
.folha__situacao span {
  display: inline-block;
  min-width: 3.5mm;
  color: var(--cor);
}
.folha__placa {
  height: 13mm;
  width: auto;
  flex-shrink: 0;
}
.folha__titulo {
  flex: 1;
}
.folha__rodape {
  margin-top: 5mm;
  padding-top: 2mm;
  border-top: 0.75pt solid #c8ced8;
  font-size: 7pt;
  color: #555;
}
.folha__rodape p {
  margin: 0 0 1mm;
}

/* Só na tela (no papel A4 a folha cabe inteira): celular e janela estreita. */
@media screen and (max-width: 860px) {
  .folha {
    width: auto;
    min-height: 0;
    margin: 12px;
    padding: 16px;
    font-size: 10pt;
    overflow-x: auto;
  }
  .folha__totais {
    flex-wrap: wrap;
  }
  .folha__totais > div {
    flex-basis: 30%;
  }
  .relatorio-barra {
    flex-wrap: wrap;
  }
}

@media print {
  .folha--sem-impressao {
    display: none !important;
  }
  .relatorio-tela {
    background: none;
    padding: 0;
    min-height: 0;
  }
  .folha {
    width: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    box-shadow: none;
  }
}
</style>

<style>
@media print {
  @page {
    size: A4 portrait;
    margin: 12mm 12mm 12mm 12mm;
  }
  .nao-imprimir,
  .cabecalho,
  .rodape,
  .aviso {
    display: none !important;
  }
  html,
  body {
    background: #fff !important;
  }
  .conteudo {
    padding: 0 !important;
    max-width: none !important;
  }
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>
