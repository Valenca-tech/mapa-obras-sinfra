// Valores e datas por extenso, como nos documentos oficiais:
//   3800000    -> 'três milhões e oitocentos mil reais'
//   1250,5     -> 'mil duzentos e cinquenta reais e cinquenta centavos'
//   2026-10-04 -> '4 de outubro de 2026'
// Funções puras, testadas no Node.

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze',
  'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos',
  'oitocentos', 'novecentos'];
const ESCALAS = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões'],
  ['trilhão', 'trilhões'],
];

/** 0 a 999 por extenso ('' para zero). */
function ate999(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(' e ');
}

/** Inteiro não negativo por extenso: 2021 -> 'dois mil e vinte e um'. */
export function inteiroPorExtenso(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'zero';
  const grupos = [];
  while (n > 0) {
    grupos.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const partes = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    let texto;
    if (i === 1 && g === 1) texto = 'mil'; // "mil", não "um mil"
    else texto = `${ate999(g)}${i ? ` ${ESCALAS[i][g === 1 ? 0 : 1]}` : ''}`;
    partes.push({ texto, valor: g, escala: i });
  }
  // "e" antes do último grupo quando ele é menor que 100 ou centena redonda:
  // mil e duzentos, dois mil e vinte, três milhões e oitocentos mil; mas
  // mil duzentos e cinquenta.
  return partes
    .map((p, k) => {
      if (k === 0) return p.texto;
      const ultimo = k === partes.length - 1;
      const usaE = ultimo && (p.valor < 100 || p.valor % 100 === 0);
      return `${usaE ? 'e ' : ''}${p.texto}`;
    })
    .join(' ');
}

/** Valor em reais por extenso (centavos arredondados). */
export function reaisPorExtenso(valor) {
  const centavosTotais = Math.round(Math.abs(Number(valor) || 0) * 100);
  const inteiro = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  const partes = [];
  if (inteiro) {
    const texto = inteiroPorExtenso(inteiro);
    // "um milhão de reais", "dois mil reais": "de" quando termina em milhão/bilhão redondo
    const de = inteiro >= 1_000_000 && inteiro % 1_000_000 === 0 ? ' de' : '';
    partes.push(`${texto}${de} ${inteiro === 1 ? 'real' : 'reais'}`);
  }
  if (centavos) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  if (!partes.length) return 'zero real';
  return partes.join(' e ');
}

/** 45.5 -> '45,5% (quarenta e cinco vírgula cinco por cento)' */
export function percentualPorExtenso(valor) {
  const v = Math.round(Math.abs(Number(valor) || 0) * 100) / 100;
  const [inteiro, dec = ''] = String(v).split('.');
  let texto = inteiroPorExtenso(Number(inteiro));
  if (dec) texto += ` vírgula ${dec.startsWith('0') ? 'zero ' : ''}${inteiroPorExtenso(Number(dec))}`;
  return `${String(v).replace('.', ',')}% (${texto} por cento)`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro',
  'outubro', 'novembro', 'dezembro'];

/** '2026-10-04' -> '4 de outubro de 2026' (padrão do Manual de Redação: dia sem zero, mês minúsculo). */
export function dataPorExtenso(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** Número oficial do documento: (7, 2026, 'SINFRA') -> '007/2026-SINFRA'. */
export const numeroOficial = (numero, ano, sigla = 'SINFRA') =>
  `${String(numero).padStart(3, '0')}/${ano}${sigla ? `-${sigla}` : ''}`;
