// Utilidades de texto compartilhadas pelas telas.

/** Minúsculas e sem acento, para busca: 'Vila Lobão' -> 'vila lobao'. */
export const semAcento = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
