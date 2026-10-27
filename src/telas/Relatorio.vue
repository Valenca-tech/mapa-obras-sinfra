<script setup>
// Relatório A4 de situação das obras, em formato de documento oficial (papel
// timbrado, seções numeradas, tabelas de borda simples, local, data e
// assinatura do secretário). Ignora os filtros da tela: é sempre o retrato completo.
import { ref, computed, onMounted } from 'vue';
import { estado, obrasComSituacao, recarregarObras, totais, nomeTipo } from '../estado.js';
import { LISTA_SITUACOES, compararParaRelatorio, textoSemAtualizacao } from '../lib/situacao.js';
import { data, dataHora, pct, reais, pontos } from '../lib/formato.js';
import { modoDemo } from '../api/index.js';
import { comprimentoTrecho, formatarExtensao } from '../lib/geo.js';
import { ArrowLeft, Printer } from 'lucide-vue-next';
import { dataPorExtenso, reaisPorExtenso } from '../lib/extenso.js';
import { numeroBr } from '../lib/documentos/conteudo.js';

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

const orgao = computed(() => estado.config.orgao_nome || 'Secretaria Municipal de Infraestrutura e Serviços Públicos');
const sigla = computed(() => estado.config.orgao_sigla || 'SINFRA');
const valorPor = (codigo) => obrasComSituacao.value.filter((o) => o.situacao.codigo === codigo).reduce((s, o) => s + Number(o.valor_contrato || 0), 0);
const execucaoMedia = computed(() => {
  const com = obrasComSituacao.value.filter((o) => Number(o.valor_contrato) > 0);
  const v = com.reduce((s, o) => s + Number(o.valor_contrato), 0);
  return v ? com.reduce((s, o) => s + o.situacao.executado * Number(o.valor_contrato), 0) / v : 0;
});
// "2 atrasadas, 1 paralisada, 5 em dia e 1 concluída"
const frase = computed(() => {
  const partes = LISTA_SITUACOES.filter((s) => t.value[s.codigo]).map((s) => {
    const n = t.value[s.codigo];
    const nome = s.rotulo.toLowerCase();
    return `${n} ${n > 1 && !nome.endsWith('dia') ? `${nome}s` : nome}`;
  });
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}` : (partes[0] ?? '');
});

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
      <RouterLink to="/painel" class="btn"><ArrowLeft class="icone" aria-hidden="true" />Voltar</RouterLink>
      <span class="mudo pequeno">Prévia em A4. Use Imprimir; para PDF, escolha "Salvar como PDF".</span>
      <button class="btn btn--primario" :disabled="!podeImprimir" @click="imprimir">
        <Printer class="icone" aria-hidden="true" />{{ carregando ? 'Atualizando…' : 'Imprimir' }}
      </button>
    </div>
    <div v-if="erro" class="relatorio-erro nao-imprimir" role="alert">
      <span>Não foi possível atualizar os dados ({{ erro }}). O relatório não pode ser impresso com dados antigos.</span>
      <button class="btn" @click="carregar">Tentar de novo</button>
    </div>

    <!-- sem dados atualizados, nada sai no papel (nem pelo Ctrl+P) -->
    <article :class="['folha', !podeImprimir && 'folha--sem-impressao']">
      <p v-if="temFicticias" class="folha__demo">{{ modoDemo ? 'DADOS FICTÍCIOS DE DEMONSTRAÇÃO' : 'CONTÉM OBRAS FICTÍCIAS (TREINO)' }}</p>

      <header class="folha__timbre">
        <img :src="'marcas/brasao_imperatriz.png'" alt="Brasão do Município de Imperatriz" @error="(e) => (e.target.style.display = 'none')" />
        <p>ESTADO DO MARANHÃO</p>
        <p>PREFEITURA MUNICIPAL DE IMPERATRIZ</p>
        <p>{{ orgao.toUpperCase() }}</p>
      </header>

      <h1 class="folha__titulo">RELATÓRIO DE SITUAÇÃO DAS OBRAS</h1>
      <p class="folha__posicao">Posição em {{ dataPorExtenso(estado.hoje) }}</p>

      <h2>1. RESUMO</h2>
      <p class="folha__texto">
        Na data deste relatório, a {{ sigla }} acompanha <strong>{{ t.ativas }} {{ t.ativas === 1 ? 'obra ativa' : 'obras ativas' }}</strong>,
        com valor contratado total de <strong>{{ reais(t.valor) }}</strong> ({{ reaisPorExtenso(t.valor) }}).
        <template v-if="t.ativas">
          Por situação: {{ frase }}. A execução média, ponderada pelo valor dos contratos, é de {{ pct(execucaoMedia) }}.
        </template>
        <template v-if="t.alertas">{{ ' ' }}{{ t.alertas }} {{ t.alertas === 1 ? 'obra está' : 'obras estão' }} sem lançamento da fiscalização há mais de {{ estado.config.dias_sem_atualizacao_alerta }} dias.</template>
        <template v-if="t.pendencias">{{ ' ' }}{{ t.pendencias }} {{ t.pendencias === 1 ? 'obra tem' : 'obras têm' }} ato registrado sem documento completo.</template>
      </p>

      <table class="folha__tabela folha__tabela--resumo">
        <thead>
          <tr>
            <th>Situação</th>
            <th class="direita">Obras</th>
            <th class="direita">Valor contratado (R$)</th>
            <th class="direita">% do valor</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in LISTA_SITUACOES" :key="s.codigo">
            <td>{{ s.rotulo }}</td>
            <td class="direita num">{{ t[s.codigo] ?? 0 }}</td>
            <td class="direita num">{{ numeroBr(valorPor(s.codigo), 2, 2) }}</td>
            <td class="direita num">{{ t.valor ? numeroBr((valorPor(s.codigo) / t.valor) * 100, 1, 1) : '0,0' }}%</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td class="direita num">{{ t.ativas }}</td>
            <td class="direita num">{{ numeroBr(t.valor, 2, 2) }}</td>
            <td class="direita num">100,0%</td>
          </tr>
        </tfoot>
      </table>

      <h2>2. OBRAS ATIVAS</h2>
      <p class="folha__nota">Em ordem de prioridade: atrasadas (maior desvio primeiro), paralisadas, em dia, não iniciadas e concluídas.</p>
      <table class="folha__tabela">
        <thead>
          <tr>
            <th class="folha__n">Nº</th>
            <th>Obra</th>
            <th>Situação</th>
            <th class="direita">Exec.</th>
            <th class="direita">Prazo</th>
            <th>Término</th>
            <th class="direita">Valor (R$)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(o, i) in obras" :key="o.id">
            <td class="folha__n num">{{ i + 1 }}</td>
            <td>
              <strong>{{ o.nome }}</strong><template v-if="o.demo && !modoDemo"> (fictícia)</template>
              <span class="folha__sub">
                {{ nomeTipo(o.tipo) }} · {{ o.bairro || 'sem bairro' }}<template v-if="o.trecho"> · trecho de {{ formatarExtensao(comprimentoTrecho(o.trecho)) }}</template><template v-if="o.numero_contrato"> · Contrato {{ o.numero_contrato }}</template><template v-if="o.empresa"> · {{ o.empresa }}</template>
              </span>
              <span v-if="observacao(o)" class="folha__obs">{{ observacao(o) }}</span>
            </td>
            <td class="folha__situacao">{{ o.situacao.rotulo }}</td>
            <td class="direita num">{{ pct(o.situacao.executado) }}</td>
            <td class="direita num">{{ pct(o.situacao.prazoDecorrido) }}</td>
            <td class="num">{{ data(o.data_termino_prevista) }}</td>
            <td class="direita num">{{ o.valor_contrato ? numeroBr(o.valor_contrato, 2, 2) : '–' }}</td>
          </tr>
          <tr v-if="!obras.length">
            <td colspan="7">Nenhuma obra ativa.</td>
          </tr>
        </tbody>
      </table>

      <h2>3. CRITÉRIOS</h2>
      <p class="folha__texto">
        A situação é calculada pelo sistema, nunca digitada. A obra é considerada atrasada quando o prazo venceu sem
        conclusão ou quando o percentual executado está mais de {{ pontos(estado.config.tolerancia_atraso_pontos) }} pontos
        abaixo do prazo decorrido, medido de forma linear entre o início e o término vigente. Os percentuais executados são
        os do último lançamento da fiscalização de cada obra.
      </p>

      <p class="folha__fecho">Imperatriz-MA, {{ dataPorExtenso(estado.hoje) }}.</p>
      <div class="folha__assinatura">
        <span class="folha__linha"></span>
        <strong>{{ estado.config.secretario_nome || 'Secretário(a)' }}</strong>
        <span>{{ estado.config.secretario_cargo }}</span>
      </div>

      <footer class="folha__rodape">
        <span>{{ orgao.toUpperCase() }}<template v-if="estado.config.orgao_endereco"> · {{ estado.config.orgao_endereco }}</template><template v-if="estado.config.prefeitura_cnpj"> · CNPJ {{ estado.config.prefeitura_cnpj }}</template></span>
        <span>Emitido em {{ gerado }} por {{ estado.perfil?.nome }} · Mapa de Obras SINFRA</span>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.relatorio-tela {
  background: #e6e8ec;
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
  position: relative;
  background: #fff;
  width: 210mm;
  min-height: 297mm;
  margin: 20px auto;
  padding: 15mm 15mm 14mm 25mm;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  color: #000;
  font-size: 10pt;
  line-height: 1.4;
}
.folha__demo {
  position: absolute;
  top: 8mm;
  right: 15mm;
  margin: 0;
  font-size: 7pt;
  font-weight: 600;
  border: 0.75pt solid #000;
  padding: 0.5mm 2mm;
}
.folha__timbre {
  text-align: center;
  margin-bottom: 7mm;
}
.folha__timbre img {
  display: block;
  height: 18mm;
  width: auto;
  margin: 0 auto 2mm;
}
.folha__timbre p {
  margin: 0;
  font-size: 9.5pt;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.folha__titulo {
  margin: 0;
  text-align: center;
  font-size: 12.5pt;
  font-weight: 700;
  color: #000;
}
.folha__posicao {
  margin: 1mm 0 7mm;
  text-align: center;
  font-size: 10pt;
}
.folha h2 {
  margin: 6mm 0 2.5mm;
  font-size: 10pt;
  font-weight: 700;
  color: #000;
}
.folha__texto {
  margin: 0 0 3mm;
  text-align: justify;
  text-indent: 12mm;
}
.folha__nota {
  margin: 0 0 2mm;
  font-size: 8.5pt;
}
.folha__tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 8.5pt;
}
.folha__tabela th,
.folha__tabela td {
  border: 0.6pt solid #000;
  padding: 1.2mm 1.6mm;
  vertical-align: top;
  text-align: left;
}
.folha__tabela th {
  font-weight: 700;
  background: #efefef;
}
.folha__tabela tfoot td {
  font-weight: 700;
}
.folha__tabela tr {
  page-break-inside: avoid;
  break-inside: avoid;
}
.folha__tabela .direita {
  text-align: right;
}
.folha__tabela--resumo {
  width: 70%;
}
.folha__n {
  width: 7mm;
  text-align: center !important;
}
.folha__sub,
.folha__obs {
  display: block;
  font-size: 7.5pt;
}
.folha__obs {
  font-style: italic;
}
.folha__situacao {
  white-space: nowrap;
}
.folha__fecho {
  margin: 10mm 0 16mm;
  text-align: right;
}
.folha__assinatura {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  break-inside: avoid;
}
.folha__linha {
  width: 75mm;
  border-top: 0.75pt solid #000;
  margin-bottom: 1.5mm;
}
.folha__assinatura span:last-child {
  font-size: 9pt;
}
.folha__rodape {
  display: flex;
  flex-direction: column;
  gap: 0.5mm;
  margin-top: 12mm;
  padding-top: 2mm;
  border-top: 0.6pt solid #000;
  font-size: 7pt;
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
  border: 1px solid var(--erro-borda);
  color: var(--erro);
  border-radius: var(--raio);
}

/* Só na tela (no papel A4 a folha cabe inteira): celular e janela estreita. */
@media screen and (max-width: 860px) {
  .folha {
    width: auto;
    min-height: 0;
    margin: 12px;
    padding: 16px;
    overflow-x: auto;
  }
  .folha__tabela--resumo {
    width: 100%;
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
  .folha__demo {
    top: 0;
    right: 0;
  }
}
</style>

<style>
@media print {
  @page {
    size: A4 portrait;
    margin: 15mm 15mm 14mm 25mm;
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
