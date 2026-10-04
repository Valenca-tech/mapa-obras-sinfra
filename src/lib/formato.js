// Formatação no padrão brasileiro: DD/MM/AAAA, R$, vírgula decimal.
import { diaEmImperatriz } from './situacao.js';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moedaCompacta = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1,
});
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const numero2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
// Percentual truncado: 99,95% aparece como 99,9%, nunca "100%" ao lado de "Atrasada".
const percentual = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, roundingMode: 'trunc' });
const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit' });

/** '2026-10-02' -> '02/10/2026' */
export function data(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** instante -> '02/10/2026 14:30' (horário de Imperatriz) */
export function dataHora(instante) {
  if (!instante) return '';
  return `${data(diaEmImperatriz(instante))} ${hora.format(new Date(instante))}`;
}

export const reais = (v) => (v === null || v === undefined || v === '' ? '' : moeda.format(Number(v)));
export const reaisCompacto = (v) => moedaCompacta.format(Number(v || 0));

/** 27.5 -> '27,5%' (truncado; abaixo de 100 nunca mostra 100) */
export function pct(v) {
  const n = Number(v || 0);
  return `${percentual.format(n < 100 ? Math.min(n, 99.9) : n)}%`;
}

export const num = (v) => numero.format(Number(v || 0));

/** Pontos percentuais com até 2 casas (desvio x tolerância): '10,04' */
export const pontos = (v) => numero2.format(Number(v || 0));

/** 'há 3 dias', 'hoje', 'ontem' */
export function haDias(n) {
  if (n === null || n === undefined) return '';
  if (n <= 0) return 'hoje';
  if (n === 1) return 'ontem';
  return `há ${n} dias`;
}

// ---------------------------------------------------------------- leitura de números

/**
 * Normaliza número digitado no padrão brasileiro ou internacional para a forma
 * '1234.5'. Devolve '' se vazio e null se não for número.
 *   '1.250.000,50' e '1,250,000.50' -> '1250000.50'
 *   '27,5' '27.5' '27,5%' -> '27.5' ;  ',5' -> '.5' ;  '50,' -> '50.'
 *   '1.250' -> '1250' (milhar) ;  '0.050' -> '0.050' (decimal: começa com zero)
 */
function normalizarNumero(texto) {
  let s = String(texto ?? '').trim().replace(/\s|R\$|%/g, '');
  if (s === '') return '';
  const virgula = s.lastIndexOf(',');
  const ponto = s.lastIndexOf('.');
  if (virgula >= 0 && ponto >= 0) {
    // os dois separadores: o último é o decimal
    const [decimal, milhar] = virgula > ponto ? [',', '.'] : ['.', ','];
    const partes = s.split(decimal);
    if (partes.length !== 2) return null;
    s = `${partes[0].split(milhar).join('')}.${partes[1]}`;
  } else if (virgula >= 0) {
    // só vírgula: uma vez é decimal ('27,5'); várias, milhar ('1,250,000')
    s = (s.match(/,/g).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.'));
  } else if (ponto >= 0) {
    // só ponto: várias vezes é milhar; uma vez seguida de 3 algarismos também
    // ('1.250'), a não ser que a parte inteira seja zero ('0.050')
    const qtdPontos = s.match(/\./g).length;
    if (qtdPontos > 1 || /^-?[1-9]\d{0,2}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  }
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? s : null;
}

/**
 * Lê número digitado no padrão brasileiro ou internacional.
 * '1.250.000,50' -> 1250000.5 ; '27,5' -> 27.5 ; '27.5' -> 27.5 ; '' -> null
 * Retorna NaN se não for número.
 */
export function lerNumero(texto) {
  if (texto === null || texto === undefined) return null;
  const s = normalizarNumero(texto);
  if (s === '') return null;
  return s === null ? NaN : Number(s);
}

/** Casas decimais significativas digitadas ('27,555' -> 3; '27,500' -> 1). */
export function casasDecimais(texto) {
  const s = normalizarNumero(texto);
  return s && s.includes('.') ? s.split('.')[1].replace(/0+$/, '').length : 0;
}

/**
 * Percentual digitado (0 a 100, até 2 casas).
 * Devolve { valor } (null se vazio) ou { erro } com a mensagem para a tela.
 */
export function lerPercentual(texto) {
  const valor = lerNumero(texto);
  if (valor === null) return { valor: null };
  if (Number.isNaN(valor)) return { erro: 'Número inválido. Use algarismos e vírgula, como 27,5.' };
  if (valor < 0 || valor > 100) return { erro: 'O percentual deve estar entre 0 e 100.' };
  if (casasDecimais(texto) > 2) return { erro: 'Use no máximo 2 casas decimais.' };
  return { valor };
}

/**
 * Confere uma data 'AAAA-MM-DD' de campo de data: ano com 4 algarismos e entre
 * 2000 e 2099 (barra ano digitado com 2 ou 5 algarismos). '' se estiver certa.
 */
export function erroDeData(iso) {
  if (!iso) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'Data inválida. Confira o ano (4 algarismos).';
  if (iso < '2000-01-01' || iso > '2099-12-31') return 'Data fora do intervalo aceito (anos 2000 a 2099). Confira o ano.';
  return '';
}
