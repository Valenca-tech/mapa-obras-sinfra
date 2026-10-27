// Ligação com o Medição Pro (medicaopro.concretta.org), a ferramenta de
// medição de obras públicas. Cada obra guarda o código dela no Medição Pro e
// abre de lá as medições. O Medição Pro tem login próprio: quem não estiver
// logado lá entra primeiro e depois chega à obra.

export const MEDICAO_PRO = 'https://medicaopro.concretta.org';

/**
 * Código da obra no Medição Pro a partir do que a pessoa colou: o próprio
 * código ou o endereço da obra aberta lá (".../#/obras/<código>/medicoes").
 */
export function codigoMedicaoPro(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return '';
  const m = t.match(/\/obras\/([\w-]+)/);
  if (m) return m[1];
  return /^[\w-]+$/.test(t) ? t : '';
}

/** Endereço das medições da obra no Medição Pro. */
export const urlMedicoes = (codigo) => `${MEDICAO_PRO}/#/obras/${encodeURIComponent(codigo)}/medicoes`;
